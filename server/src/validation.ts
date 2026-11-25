import type { RejectionReason } from "@prisma/client";
import {
  sniffFormat, toProcessable, readDimensions, perceptualHash,
  hammingDistance, blurScore, detectFaces, type DetectedFormat,
} from "./imaging.js";

export const RULES = {
  MIN_WIDTH: 512,
  MIN_HEIGHT: 512,
  MIN_BYTES: 20 * 1024,
  MIN_BLUR_SCORE: 100,      // Laplacian variance below this reads as blurry
  MAX_HASH_DISTANCE: 10,    // of 64 bits; below this the images are near-identical
  MIN_FACE_RATIO: 0.1,      // face must cover >=10% of the frame
} as const;

export type Rejection = { reason: RejectionReason; detail: string };

export type ValidationResult = {
  rejection: Rejection | null;
  metrics: {
    format: DetectedFormat | null;
    width: number;
    height: number;
    perceptualHash: string | null;
    blurScore: number | null;
    faceCount: number | null;
    converted: boolean;
    processable: Buffer | null;
  };
};

/**
 * Checks run cheapest-first and stop at the first failure: there is no point
 * computing a Laplacian for a file that isn't an image.
 */
export async function validate(
  original: Buffer,
  sizeBytes: number,
  existingHashes: string[]
): Promise<ValidationResult> {
  const metrics: ValidationResult["metrics"] = {
    format: null, width: 0, height: 0, perceptualHash: null,
    blurScore: null, faceCount: null, converted: false, processable: null,
  };

  // Rule 2 — format
  const format = sniffFormat(original);
  metrics.format = format;
  if (!format) {
    return { rejection: { reason: "INVALID_FORMAT", detail: "Not a JPEG, PNG or HEIC file" }, metrics };
  }

  const { buffer, converted } = await toProcessable(original, format);
  metrics.processable = buffer;
  metrics.converted = converted;

  // Rule 1 — size and resolution
  const { width, height } = await readDimensions(buffer);
  metrics.width = width;
  metrics.height = height;

  if (sizeBytes < RULES.MIN_BYTES) {
    return {
      rejection: { reason: "TOO_SMALL", detail: `File is ${Math.round(sizeBytes / 1024)} KB, minimum is ${RULES.MIN_BYTES / 1024} KB` },
      metrics,
    };
  }
  if (width < RULES.MIN_WIDTH || height < RULES.MIN_HEIGHT) {
    return {
      rejection: { reason: "TOO_SMALL", detail: `${width}x${height} is below the ${RULES.MIN_WIDTH}x${RULES.MIN_HEIGHT} minimum` },
      metrics,
    };
  }

  // Rule 4 — blur
  const blur = await blurScore(buffer);
  metrics.blurScore = blur;
  if (blur < RULES.MIN_BLUR_SCORE) {
    return {
      rejection: { reason: "BLURRY", detail: `Sharpness score ${blur.toFixed(0)}, minimum is ${RULES.MIN_BLUR_SCORE}` },
      metrics,
    };
  }

  // Rule 3 — near-duplicate
  const hash = await perceptualHash(buffer);
  metrics.perceptualHash = hash;
  const closest = existingHashes
    .map((h) => hammingDistance(hash, h))
    .reduce((min, d) => Math.min(min, d), 64);

  if (closest <= RULES.MAX_HASH_DISTANCE) {
    return {
      rejection: { reason: "DUPLICATE", detail: "Too similar to another photo in this upload" },
      metrics,
    };
  }

  // Rules 5 and 6 — faces. Skipped when no detector is configured.
  const faces = await detectFaces(buffer);
  if (faces) {
    metrics.faceCount = faces.count;
    if (faces.count === 0 || faces.largestFaceRatio < RULES.MIN_FACE_RATIO) {
      return { rejection: { reason: "FACE_TOO_SMALL", detail: "No clearly visible face, or the face is too small" }, metrics };
    }
    if (faces.count > 1) {
      return { rejection: { reason: "MULTIPLE_FACES", detail: `${faces.count} faces detected; photos must contain exactly one` }, metrics };
    }
  }

  return { rejection: null, metrics };
}