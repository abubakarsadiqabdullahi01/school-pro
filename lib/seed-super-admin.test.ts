import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { seedSuperAdmin } from "./seed-super-admin"

const tx = { credential: { findMany: vi.fn() }, user: { create: vi.fn() } }
const db = { $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("SUPER_ADMIN_PASSWORD", "first-test-password")
  vi.stubEnv("SECOND_SUPER_ADMIN_PASSWORD", "second-test-password")
  tx.credential.findMany.mockResolvedValue([])
})

afterEach(() => vi.unstubAllEnvs())

it("creates both requested super admins with profiles and hashed credentials", async () => {
  expect(await seedSuperAdmin(db)).toEqual({ created: 2, existing: 0 })
  expect(tx.user.create).toHaveBeenCalledTimes(2)
  const first = tx.user.create.mock.calls[0][0].data
  const second = tx.user.create.mock.calls[1][0].data
  expect(first).toMatchObject({
    firstName: "Abubakar Sadiq", lastName: "Abdullahi", role: "SUPER_ADMIN",
    gender: "MALE", state: "Gombe", lga: "Gombe North",
    address: "123 Government Road, Gombe", superAdmin: { create: {} },
    credentials: { create: { type: "EMAIL", value: "superadmin@schoolpro.ng", isPrimary: true } },
  })
  expect(second).toMatchObject({
    firstName: "Rabiu", lastName: "Muhammad", role: "SUPER_ADMIN",
    gender: "MALE", state: "Gombe", lga: "Gombe North",
    address: "456 Victoria Island, Gombe", superAdmin: { create: {} },
    credentials: { create: { type: "EMAIL", value: "admin@schoolpro.ng", isPrimary: true } },
  })
  expect(first.school).toBeUndefined()
  expect(second.school).toBeUndefined()
  expect(await bcrypt.compare("first-test-password", first.credentials.create.passwordHash)).toBe(true)
  expect(await bcrypt.compare("second-test-password", second.credentials.create.passwordHash)).toBe(true)
})

it("leaves existing super admin credentials unchanged while creating a missing account", async () => {
  tx.credential.findMany.mockResolvedValue([{
    value: "superadmin@schoolpro.ng", type: "EMAIL",
    user: { role: "SUPER_ADMIN", isActive: true, superAdmin: {} },
  }])
  expect(await seedSuperAdmin(db)).toEqual({ created: 1, existing: 1 })
  expect(tx.user.create).toHaveBeenCalledTimes(1)
  expect(tx.user.create.mock.calls[0][0].data.credentials.create.value).toBe("admin@schoolpro.ng")
})

it("does not alter existing accounts on a repeated run", async () => {
  tx.credential.findMany.mockResolvedValue(["superadmin@schoolpro.ng", "admin@schoolpro.ng"].map(value => ({
    value, type: "EMAIL", user: { role: "SUPER_ADMIN", isActive: true, superAdmin: {} },
  })))
  expect(await seedSuperAdmin(db)).toEqual({ created: 0, existing: 2 })
  expect(tx.user.create).not.toHaveBeenCalled()
})

it("does not elevate an existing ordinary user or create the other admin", async () => {
  tx.credential.findMany.mockResolvedValue([{
    value: "admin@schoolpro.ng", type: "EMAIL", user: { role: "ADMIN", isActive: true },
  }])
  await expect(seedSuperAdmin(db)).rejects.toThrow("incompatible")
  expect(tx.user.create).not.toHaveBeenCalled()
})

it("refuses missing credentials before touching the database", async () => {
  vi.stubEnv("SECOND_SUPER_ADMIN_PASSWORD", "")
  await expect(seedSuperAdmin(db)).rejects.toThrow("SECOND_SUPER_ADMIN_PASSWORD")
  expect(tx.credential.findMany).not.toHaveBeenCalled()
})
