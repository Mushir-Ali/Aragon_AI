import { prisma } from "./db.js";
import { storage } from "./storage.js";
import { validate } from "./validation.js";

/**
 * Processes images one at a time, in the background. Sequential by design:
 * decoding and convolution are CPU-bound, and running them in parallel on a
 * single Node process makes every image slower, not faster.
 * In production this is a BullMQ worker consuming a queue.
 */
export async function processUpload(uploadId: string, buffers: Map<string, Buffer>) {
  const images = await prisma.image.findMany({
    where: { uploadId },
    orderBy: { createdAt: "asc" },
  });

  // Accepted hashes seen so far, for duplicate comparison.
  const seenHashes: string[] = [];

  for (const image of images) {
    const buffer = buffers.get(image.id);
    if (!buffer) continue;

    await prisma.image.update({ where: { id: image.id }, data: { status: "PROCESSING" } });

    try {
      const { rejection, metrics } = await validate(buffer, image.sizeBytes, seenHashes);

      // A converted HEIC is stored alongside the original so the UI can display it.
      let convertedKey: string | null = null;
      if (metrics.converted && metrics.processable) {
        convertedKey = `${uploadId}/converted-${image.id}.jpg`;
        await storage.put(convertedKey, metrics.processable, "image/jpeg");
      }

      if (!rejection && metrics.perceptualHash) seenHashes.push(metrics.perceptualHash);

      await prisma.image.update({
        where: { id: image.id },
        data: {
          status: rejection ? "REJECTED" : "ACCEPTED",
          rejectionReason: rejection?.reason ?? null,
          rejectionDetail: rejection?.detail ?? null,
          width: metrics.width || null,
          height: metrics.height || null,
          perceptualHash: metrics.perceptualHash,
          blurScore: metrics.blurScore,
          faceCount: metrics.faceCount,
          convertedKey,
        },
      });
    } catch (err) {
      await prisma.image.update({
        where: { id: image.id },
        data: {
          status: "REJECTED",
          rejectionReason: "PROCESSING_ERROR",
          rejectionDetail: err instanceof Error ? err.message : "Could not process image",
        },
      });
    }
  }
}