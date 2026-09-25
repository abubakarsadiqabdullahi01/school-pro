import bcrypt from "bcryptjs"

import { prisma } from "@/lib/db"

/**
 * Creates or removes a short-lived admin login, for walking the UI in a browser.
 *
 *   npx tsx scripts/temp-review-login.ts create
 *   npx tsx scripts/temp-review-login.ts remove
 *
 * Deliberately not a fixture anything depends on, and deliberately easy to delete. It
 * exists so a person - or an agent - can see a screen actually render rather than trusting
 * that it compiled. `remove` takes the whole thing away again, including the login history
 * the session leaves behind.
 *
 * It never touches an existing account. Resetting a real administrator's password to look
 * at a page would be a worse trade than making a throwaway one.
 */

const EMAIL = "temp.review@example.test"
const PASSWORD = "ReviewOnly123"

async function create() {
  const existing = await prisma.credential.findUnique({
    where: { value: EMAIL },
    select: { userId: true },
  })
  if (existing) {
    console.log(`Already present. Sign in as ${EMAIL} / ${PASSWORD}`)
    return
  }

  const school = await prisma.school.findFirstOrThrow({
    where: { isActive: true, admins: { some: {} } },
    select: { id: true, name: true },
  })

  const user = await prisma.user.create({
    data: {
      firstName: "Temporary",
      lastName: "Reviewer",
      role: "ADMIN",
      isActive: true,
      // `Admin.permissions` is a legacy required string; the real grid is resolved from
      // the role and any assigned PermissionProfile, so an empty list is correct here.
      admin: { create: { schoolId: school.id, permissions: "[]" } },
      credentials: {
        create: {
          type: "EMAIL",
          value: EMAIL,
          passwordHash: await bcrypt.hash(PASSWORD, 12),
          isPrimary: true,
        },
      },
    },
    select: { id: true },
  })

  console.log(`Created ${user.id} on ${school.name}`)
  console.log(`Sign in as ${EMAIL} / ${PASSWORD}`)
  console.log("Remove it again with: npx tsx scripts/temp-review-login.ts remove")
}

async function remove() {
  const credential = await prisma.credential.findUnique({
    where: { value: EMAIL },
    select: { userId: true },
  })
  if (!credential) {
    console.log("Nothing to remove.")
    return
  }

  // Sessions and attempts cascade from the user, but they are cleared explicitly so the
  // removal is complete whatever the cascade rules happen to be.
  await prisma.loginSession.deleteMany({ where: { userId: credential.userId } })
  await prisma.loginAttempt.deleteMany({ where: { userId: credential.userId } })
  await prisma.credential.deleteMany({ where: { userId: credential.userId } })
  await prisma.admin.deleteMany({ where: { userId: credential.userId } })
  await prisma.user.delete({ where: { id: credential.userId } })

  console.log("Removed.")
}

async function main() {
  const command = process.argv[2]
  if (command === "create") await create()
  else if (command === "remove") await remove()
  else console.log("Usage: temp-review-login.ts create|remove")
  await prisma.$disconnect()
}

void main()
