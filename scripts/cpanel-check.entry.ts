// Read-only production connection check. Compiled into deploy/cpanel-check.mjs.
import { createPrismaClient } from "../lib/prisma-client"

console.log("Diagnostic version: adapter-1")
const prisma = createPrismaClient()
try {
  await prisma.$queryRaw`SELECT 1`
  console.log("Database connection: OK")
  // `CAST(... AS CHAR)` is not decoration. `information_schema.TABLES.TABLE_NAME`
  // comes back from the MariaDB driver as a binary-collated value, and Prisma's
  // raw-query serializer then rejects it with "Cannot serialize value of type
  // string as Bytes" — so this check reported "connection OK" followed by a bare
  // "check failed" on every MySQL 8 host, with the message deliberately withheld
  // and nothing to diagnose. The cast makes the column a plain string.
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT CAST(TABLE_NAME AS CHAR) AS name
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
  `
  const names = new Set(rows.map((row) => row.name))
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
  // The message is withheld on purpose: a driver can include DATABASE_URL and its
  // password. The code above is the part worth searching for.
  console.error("The connection succeeded above if it says so; this failure is the schema read.")
  // Never print error.message: a driver can include DATABASE_URL or credentials.
  process.exitCode = 1
} finally {
  await prisma.$disconnect().catch(() => {})
}
