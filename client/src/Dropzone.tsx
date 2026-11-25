import { useMemo, useState } from "react";

const MAX_MB = 15;
const MAX_FILES = 20;
const ACCEPTED_EXT = [".jpg", ".jpeg", ".png", ".heic", ".heif"];

type Props = { files: File[]; onChange: (files: File[]) => void; disabled?: boolean };

/**
 * Frontend validation is a fast first pass for the user's benefit. The server
 * re-checks everything from magic bytes, because a MIME type is trivially faked.
 */
function isAllowed(file: File) {
  const name = file.name.toLowerCase();
  const extOk = ACCEPTED_EXT.some((ext) => name.endsWith(ext));
  // HEIC often arrives with an empty or generic MIME type, so extension wins.
  const typeOk = ["image/jpeg", "image/png", "image/heic", "image/heif", "", "application/octet-stream"].includes(file.type);
  return extOk && typeOk;
}

export function Dropzone({ files, onChange, disabled }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const previews = useMemo(
    () => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    [files]
  );
  // Revoke on change so blob URLs don't leak.
  useMemo(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  function add(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const rejected = incoming.filter((f) => !isAllowed(f) || f.size > MAX_MB * 1024 * 1024);

    if (rejected.length) {
      setError(`${rejected.map((f) => f.name).join(", ")} — only JPEG, PNG and HEIC under ${MAX_MB} MB`);
    } else {
      setError(null);
    }

    const accepted = incoming.filter((f) => !rejected.includes(f));
    onChange([...files, ...accepted].slice(0, MAX_FILES));
  }

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-gray-400"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <input
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif"
          className="hidden"
          onChange={(e) => add(e.target.files)}
        />
        <p className="font-medium">Drop photos here, or click to choose</p>
        <p className="text-sm text-gray-500">JPEG, PNG or HEIC · up to {MAX_FILES} files · {MAX_MB} MB each</p>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {previews.map(({ file, url }, i) => {
            const isHeic = /\.hei[cf]$/i.test(file.name);
            return (
              <div key={url} className="relative">
                {isHeic ? (
                  // Browsers cannot render HEIC; show a placeholder until the
                  // server returns the converted JPEG.
                  <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-gray-100 p-2 text-center text-[11px] text-gray-500">
                    HEIC<br />preview after upload
                  </div>
                ) : (
                  <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-xs text-white"
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}