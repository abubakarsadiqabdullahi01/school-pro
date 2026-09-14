import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient, type Prisma as PrismaNamespace } from "@prisma/client"

export function createPrismaClient(options: { log?: PrismaNamespace.LogLevel[] } = {}) {
  const value = process.env.DATABASE_URL
  if (!value) throw new Error("DATABASE_URL is required")

  const url = new URL(value)
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://")
  const database = decodeURIComponent(url.pathname.slice(1))
  if (!database || !url.hostname || !url.username) {
    throw new Error("DATABASE_URL must contain a host, user, and database")
  }

  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: 3,
  })
  return new PrismaClient({ adapter, ...options })
}
