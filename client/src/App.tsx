import { useEffect, useState } from "react";
import { getUpload, uploadPhotos, type ImageDto, type UploadDto } from "./api";
import { Dropzone } from "./Dropzone";

const REASON_LABEL: Record<string, string> = {
  TOO_SMALL: "Too small",
  INVALID_FORMAT: "Unsupported format",
  DUPLICATE: "Too similar to another photo",
  BLURRY: "Too blurry",
  FACE_TOO_SMALL: "Face too small",
  MULTIPLE_FACES: "Multiple faces",
  PROCESSING_ERROR: "Could not process",
};

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [upload, setUpload] = useState<UploadDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadId = upload?.uploadId ?? null;
  const pending = upload?.counts?.pending ?? upload?.images.filter(i => i.status === "PENDING" || i.status === "PROCESSING").length ?? 0;

  // Poll while anything is still being validated. setTimeout chain rather than
  // setInterval so a slow response never stacks requests.
  useEffect(() => {
    if (!uploadId || pending === 0) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const next = await getUpload(uploadId);
        if (stopped) return;
        setUpload(next);
        if ((next.counts?.pending ?? 0) === 0) return;
      } catch { /* transient network error: keep polling */ }
      timer = setTimeout(tick, 1500);
    };

    timer = setTimeout(tick, 1500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [uploadId, pending]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setUpload(await uploadPhotos(files));
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const accepted = upload?.images.filter((i) => i.status === "ACCEPTED") ?? [];
  const rejected = upload?.images.filter((i) => i.status === "REJECTED") ?? [];
  const inFlight = upload?.images.filter((i) => i.status === "PENDING" || i.status === "PROCESSING") ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 sm:p-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Photo upload</h1>
        <p className="text-gray-600">
          Upload your photos. Each one is checked automatically and sorted into accepted or rejected.
        </p>
      </header>

      <Dropzone files={files} onChange={setFiles} disabled={busy} />

      {error && <p className="text-red-600">{error}</p>}

      <button
        disabled={files.length === 0 || busy}
        onClick={submit}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Uploading…" : `Upload ${files.length || ""} photo${files.length === 1 ? "" : "s"}`}
      </button>

      {upload && (
        <div className="space-y-8">
          {inFlight.length > 0 && (
            <section>
              <h2 className="mb-3 font-medium">Checking {inFlight.length}…</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {inFlight.map((img) => (
                  <div key={img.id} className="aspect-square animate-pulse rounded-lg bg-gray-200" />
                ))}
              </div>
            </section>
          )}

          <Section title="Accepted" tone="accepted" images={accepted} />
          <Section title="Rejected" tone="rejected" images={rejected} />
        </div>
      )}
    </main>
  );
}

function Section({ title, tone, images }: { title: string; tone: "accepted" | "rejected"; images: ImageDto[] }) {
  if (images.length === 0) return null;
  const accent = tone === "accepted" ? "text-green-700" : "text-red-700";

  return (
    <section>
      <h2 className={`mb-3 font-medium ${accent}`}>
        {title} · {images.length}
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {images.map((img) => (
          <figure key={img.id} className="space-y-1">
            <img
              src={img.url}
              alt={img.originalName}
              loading="lazy"
              className={`aspect-square w-full rounded-lg object-cover ${tone === "rejected" ? "opacity-60" : ""}`}
            />
            <figcaption className="space-y-0.5">
              <p className="truncate text-xs text-gray-600" title={img.originalName}>{img.originalName}</p>
              {img.width && <p className="text-[11px] text-gray-400">{img.width}×{img.height}</p>}
              {img.rejectionReason && (
                <>
                  <p className="text-xs font-medium text-red-700">{REASON_LABEL[img.rejectionReason] ?? img.rejectionReason}</p>
                  <p className="text-[11px] text-gray-500">{img.rejectionDetail}</p>
                </>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}