// @next/env ships CommonJS, so the named import fails under this project's ESM setup.
import nextEnv from "@next/env";
import { seedSuperAdmin } from "../lib/seed-super-admin";
import { createPrismaClient } from "../lib/prisma-client";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const prisma = createPrismaClient();
seedSuperAdmin(prisma).catch((error) => {
  // The reason matters: "set SUPER_ADMIN_PASSWORD" and "the database is unreachable" need
  // different actions, and the generic message that used to print here told you neither.
  console.error("Super admin setup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
