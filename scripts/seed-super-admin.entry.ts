// Entry point for the seed that ships inside the deploy bundle.
//
// prisma/seed.ts is run locally through `tsx`, which is a devDependency and so
// is absent from the bundle — there is no way to execute TypeScript on the
// cPanel host. package-deploy.mjs bundles this file to
// deploy/seed-super-admin.mjs so the server can run it with plain node (cPanel's
// "Run JS Script" button does exactly that), while lib/seed-super-admin.ts
// stays the single source of truth for the logic.
import { createPrismaClient } from "../lib/prisma-client"
import { seedSuperAdmin } from "../lib/seed-super-admin"

const prisma = createPrismaClient()

seedSuperAdmin(prisma)
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    console.error(
      "Super admin setup failed. Check SUPER_ADMIN_PASSWORD and SECOND_SUPER_ADMIN_PASSWORD, that DATABASE_URL points at the right database, and that migrations have been applied."
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
