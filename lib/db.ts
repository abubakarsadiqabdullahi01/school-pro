import { PrismaClient } from "@prisma/client"
import { createPrismaClient } from "./prisma-client"

declare global {
  var prisma: PrismaClient | undefined
}

const globalForPrisma = global as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  createPrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

// Test connection
prisma.$connect().catch((err) => {
  console.error("Failed to connect to database:", err)
})
