import sharp from "sharp";
import heicConvert from "heic-convert";

export type DetectedFormat = "jpeg" | "png" | "heic";

/**
 * Identify the real format from magic bytes. Browsers routinely send HEIC as
 * application/octet-stream, and a client-supplied MIME type is trivially
 * spoofed, so the header is the only thing we trust.
 */
export function sniffFormat(buf: Buffer): DetectedFormat | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";

  // ISO-BMFF container: "ftyp" at offset 4, brand at offset 8.
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx", "mif1", "heim", "msf1"].includes(brand)) return "heic";
  }
  return null;
}

/** HEIC is converted to JPEG so sharp (and every browser) can handle it. */
export async function toProcessable(
  buf: Buffer,
  format: DetectedFormat
): Promise<{ buffer: Buffer; converted: boolean }> {
  if (format !== "heic") return { buffer: buf, converted: false };
  const out = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.92 });
  return { buffer: Buffer.from(out), converted: true };
}

export async function readDimensions(buf: Buffer) {
  const { width = 0, height = 0 } = await sharp(buf).metadata();
  return { width, height };
}

/**
 * Perceptual hash (dHash): downscale to 9x8 greyscale and record whether each
 * pixel is brighter than its right-hand neighbour. Robust to resizing and
 * re-compression, so near-identical photos collide while different ones don't.
 */
export async function perceptualHash(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const i = row * 9 + col;
      bits += data[i] > data[i + 1] ? "1" : "0";
    }
  }
  // 64 bits -> 16 hex chars, cheap to store and index.
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}

export function hammingDistance(a: string, b: string): number {
  let diff = BigInt("0x" + a) ^ BigInt("0x" + b);
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/**
 * Blur score: variance of the Laplacian. A sharp image has strong local
 * intensity changes (high variance); a blurry one is locally flat.
 * Standard technique from OpenCV, implemented directly to avoid the dependency.
 */
export async function blurScore(buf: Buffer): Promise<number> {
  const size = 512;
  const { data, info } = await sharp(buf)
    .greyscale()
    .resize(size, size, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h } = info;
  const values: number[] = [];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // 4-neighbour Laplacian kernel
      const lap = -4 * data[i] + data[i - 1] + data[i + 1] + data[i - w] + data[i + w];
      values.push(lap);
    }
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
}

export type FaceMetrics = { count: number; largestFaceRatio: number };

/**
 * Face detection is stubbed. A real implementation needs a model
 * (face-api.js / MediaPipe / a hosted vision API) which was out of scope for
 * the time budget. Returning null means "not evaluated" rather than "passed",
 * so the pipeline records it honestly instead of silently accepting.
 */
export async function detectFaces(_buf: Buffer): Promise<FaceMetrics | null> {
  return null;
}