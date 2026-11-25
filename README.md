# Photo upload and validation

Users upload photos; each one is validated asynchronously and sorted into **Accepted** or **Rejected**
with a specific reason.

Live: _TBD_ · Walkthrough: _TBD_

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React + TypeScript + Tailwind (Vite) |
| Backend | Node + Express + TypeScript |
| Database | PostgreSQL (Supabase) via Prisma |
| Object storage | Supabase Storage (S3-equivalent) |
| Image processing | sharp, heic-convert |

## Running locally

```bash
# server
cd server && cp .env.example .env   # fill in Supabase values
npm install
npx prisma migrate dev
npm run dev                          # http://localhost:4000/api/health

# client
cd client && npm install && npm run dev   # http://localhost:5173
```

## Key decisions

_TBD — filled in as the build progresses._

## Known issues

_TBD_

## Next steps

_TBD_
