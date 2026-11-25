# Photo upload and validation

Users upload photos; each one is validated asynchronously and sorted into **Accepted** or
**Rejected** with a specific reason.

**Live:** _URL_ · **API:** _URL_/api/health · **Walkthrough:** _Loom link_

## Stack

React + TypeScript + Tailwind (Vite) · Node + Express + TypeScript · PostgreSQL via Prisma ·
Supabase Storage · sharp + heic-convert

## Running locally

```bash
cd server && cp .env.example .env   # fill in Supabase values
npm install && npx prisma migrate dev && npm run dev

cd client && npm install && npm run dev
```

### Environment variables

`server/.env` — see `.env.example`:

```dotenv
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

# Supabase → Connect → ORM → Prisma gives you both of these.
# DATABASE_URL is pooled (app queries), DIRECT_URL is direct (migrations run
# through the pooler fail, so Prisma needs the direct connection).
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres"

# Supabase → Settings → API Keys. The secret key is server-side only —
# it bypasses row-level security and must never reach the browser.
SUPABASE_URL="https://xxxx.supabase.co"
SUPABASE_SERVICE_KEY="sb_secret_..."
SUPABASE_BUCKET="uploads"
```

`client` needs one variable, set in Vercel:

```dotenv
VITE_API_URL=https://your-api.onrender.com
```

Anything prefixed `VITE_` is compiled into the browser bundle, so only
non-secret values go there.

## How it works

1. `POST /api/uploads` streams files to object storage, writes an `Image` row per file with
   status `PENDING`, and returns **202 + uploadId immediately**.
2. A background processor validates each image in turn and updates its row.
3. The client polls `GET /api/uploads/:id` every 1.5s until nothing is pending, then renders
   the Accepted and Rejected sections.

The API never blocks on image processing, which is what makes the upload feel instant even
when validation takes seconds per file.

## Key decisions

- **Polling over WebSockets.** Jobs here are slow, not chatty. Polling survives a refresh and a
  flaky connection with zero extra infrastructure. At scale this becomes SSE or a socket.
- **Validation order is cheapest-first and short-circuits.** Format (magic bytes) → size →
  blur → duplicate → faces. There's no point running a Laplacian on a file that isn't an image.
- **Never trust the client's MIME type.** Browsers routinely send HEIC as
  `application/octet-stream`, and a content type is trivially spoofed, so the real format comes
  from the file header. The frontend check is a fast courtesy; the server check is the real one.
- **Storage keys are generated server-side** (`<uploadId>/<nanoid><ext>`), so a client can never
  influence a path we write to.
- **Storage behind an interface.** Supabase today; swapping to S3 touches one file and no routes.
- **Blur = variance of the Laplacian**, implemented directly rather than pulling in OpenCV. A
  sharp image has strong local intensity changes; a blurry one is locally flat. The threshold
  (100) was tuned by hand against test photos and is the most arbitrary number in the project.
- **Duplicates = dHash + Hamming distance.** A 64-bit perceptual hash survives resizing and
  re-compression, so near-identical photos collide while genuinely different ones don't.
  Distance ≤ 10 counts as a duplicate.
- **Indexes chosen from the query plan**, not habit: `(uploadId, status)` because the gallery
  always asks "images in this upload, by status", and `perceptualHash` because duplicate
  detection looks up by hash and would otherwise be a full scan on every upload.
- **Processing is sequential, deliberately.** Decoding and convolution are CPU-bound; running
  them in parallel on one Node process makes every image slower.

## What I cut, and why

- **Face detection (rules 5 and 6).** Implemented against a `detectFaces` interface and wired
  into the pipeline, but the detector itself is stubbed. A real one means face-api.js plus
  TensorFlow and model downloads, which wasn't a safe use of a 90-minute budget. It returns
  `null` — *not evaluated* — rather than silently passing, so the behaviour is honest.
- **Auth and per-user ownership.** Anyone with an upload id can read it. Ids are unguessable,
  but it's not access control.
- **A real queue.** Background work runs in the web process; see below.

## Known issues

- Background processing lives in the API process, so a restart mid-upload leaves images stuck
  in `PROCESSING`.
- No rate limiting on the upload endpoint.
- Duplicate detection compares within a single upload, not across all history.
- The storage bucket is public for simplicity; production would use signed URLs.

## Next steps

- **A day:** BullMQ worker on Redis so processing survives restarts and gets retries and
  concurrency limits; rate limiting; signed URLs instead of a public bucket.
- **A week:** real face detection; presigned direct-to-S3 uploads so files never pass through
  the API; cross-upload duplicate detection via a hash index; thumbnail generation for the grid.
