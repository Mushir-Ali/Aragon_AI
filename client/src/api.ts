// Empty in dev (the Vite proxy forwards /api); the Render URL in production.
const API = import.meta.env.VITE_API_URL ?? "";

export type ImageStatus = "PENDING" | "PROCESSING" | "ACCEPTED" | "REJECTED";

export type ImageDto = {
  id: string;
  originalName: string;
  status: ImageStatus;
  rejectionReason: string | null;
  rejectionDetail: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  url: string;
};

export type UploadDto = {
  uploadId: string;
  images: ImageDto[];
  counts?: { pending: number; accepted: number; rejected: number };
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function uploadPhotos(files: File[]): Promise<UploadDto> {
  const form = new FormData();
  // No Content-Type header: the browser must set the multipart boundary itself.
  files.forEach((f) => form.append("photos", f));
  return json<UploadDto>(await fetch(`${API}/api/uploads`, { method: "POST", body: form }));
}

export async function getUpload(id: string): Promise<UploadDto> {
  return json<UploadDto>(await fetch(`${API}/api/uploads/${id}`));
}

export async function deleteImage(uploadId: string, imageId: string): Promise<void> {
  const res = await fetch(`${API}/api/uploads/${uploadId}/images/${imageId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Could not remove image");
}