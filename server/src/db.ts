import { PrismaClient } from "@prisma/client";

// Single instance: `tsx watch` re-imports modules on every save, and a fresh
// client per reload would exhaust the Postgres connection pool within minutes.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
