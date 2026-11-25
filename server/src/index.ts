import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { prisma } from "./db.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "*" }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  // Touch the database so health reflects the whole stack, not just the process.
  const uploads = await prisma.upload.count();
  res.json({ ok: true, uploads });
});

// Errors become JSON, never an HTML stack trace the client can't parse.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(400).json({ error: err.message });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API on http://localhost:${port}`));
