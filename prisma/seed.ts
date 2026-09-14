import { loadEnvConfig } from "@next/env";
import { seedSuperAdmin } from "../lib/seed-super-admin";
import { createPrismaClient } from "../lib/prisma-client";

loadEnvConfig(process.cwd());
const prisma = createPrismaClient();
seedSuperAdmin(prisma).catch(() => {
  console.error("Super admin setup failed. Check seed configuration, database connectivity, and that the database is fresh or already has this super admin.");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
