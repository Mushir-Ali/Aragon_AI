import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import path from "node:path";
import { prisma } from "./db.js";
import { storage } from "./storage.js";
import { processUpload } from "./processor.js";

export const uploadsRouter = Router();

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 20;

// Accepted MIME types. HEIC frequently arrives as octet-stream from browsers
// that do not recognise it, so we allow it here and verify the real format
// from the file's magic bytes during processing — never trust the client.
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/octet-stream",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter: (_req, file, cb) => cb(null, ACCEPTED_MIME.has(file.mimetype)),
});

// POST /api/uploads — persist files and metadata, return immediately.
// Validation runs asynchronously; the client polls for results.
uploadsRouter.post("/", upload.array("photos", MAX_FILES), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: "Upload at least one JPEG, PNG or HEIC image" });
    return;
  }

  const uploadRecord = await prisma.upload.create({ data: {} });

  // Buffers are handed to the processor in memory so it doesn't re-download
  // every file from storage immediately after we uploaded it.
  const buffers = new Map<string, Buffer>();

  const images = await Promise.all(
    files.map(async (file) => {
      // Keys are generated server-side: the client never controls a path we write to.
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      const key = `${uploadRecord.id}/${nanoid(12)}${ext}`;

      await storage.put(key, file.buffer, file.mimetype);

      const record = await prisma.image.create({
        data: {
          uploadId: uploadRecord.id,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey: key,
          status: "PENDING",
        },
      });

      buffers.set(record.id, file.buffer);
      return record;
    })
  );

  // Fire and forget: validation runs in the background while the client polls.
  void processUpload(uploadRecord.id, buffers);

  res.status(202).json({
    uploadId: uploadRecord.id,
    images: images.map(toDto),
  });
});

// GET /api/uploads/:id — current state of every image in this upload.
uploadsRouter.get("/:id", async (req, res) => {
  const images = await prisma.image.findMany({
    where: { uploadId: req.params.id },
    orderBy: { createdAt: "asc" },
  });

  if (images.length === 0) {
    res.status(404).json({ error: "Upload not found" });
    return;
  }

  res.json({
    uploadId: req.params.id,
    images: images.map(toDto),
    counts: {
      pending: images.filter((i) => i.status === "PENDING" || i.status === "PROCESSING").length,
      accepted: images.filter((i) => i.status === "ACCEPTED").length,
      rejected: images.filter((i) => i.status === "REJECTED").length,
    },
  });
});

// Shape the client sees: no storage keys, no internal columns.
function toDto(image: {
  id: string;
  originalName: string;
  status: string;
  rejectionReason: string | null;
  rejectionDetail: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  storageKey: string;
  convertedKey: string | null;
}) {
  return {
    id: image.id,
    originalName: image.originalName,
    status: image.status,
    rejectionReason: image.rejectionReason,
    rejectionDetail: image.rejectionDetail,
    width: image.width,
    height: image.height,
    sizeBytes: image.sizeBytes,
    url: storage.publicUrl(image.convertedKey ?? image.storageKey),
  };
}