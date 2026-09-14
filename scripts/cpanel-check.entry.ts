// Read-only production connection check. Compiled into deploy/cpanel-check.mjs.
import { createPrismaClient } from "../lib/prisma-client"

console.log("Diagnostic version: adapter-1")
const prisma = createPrismaClient()
try {
  await prisma.$queryRaw`SELECT 1`
  console.log("Database connection: OK")
  const rows = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
    SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
  `
  const names = new Set(rows.map((row) => row.TABLE_NAME))
  console.log("Table count:", names.size)
  console.log("Prisma migrations table present:", names.has("_prisma_migrations"))
  console.log("User table present:", names.has("users"))
  console.log("School table present:", names.has("School"))
  console.log("No database changes performed.")
} catch (error) {
  console.error("Database check failed. Error type:", error instanceof Error ? error.name : "Error")
  if (error && typeof error === "object" && "code" in error) {
    console.error("Error code:", String(error.code))
  }
  // Never print error.message: a driver can include DATABASE_URL or credentials.
  process.exitCode = 1
} finally {
  await prisma.$disconnect().catch(() => {})
}
