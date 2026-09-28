import { prisma } from "../lib/db"
import { runIntegrityChecks } from "../lib/integrity-checks"

async function main() {
  const schools = await prisma.school.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      admins: {
        where: { user: { isActive: true } },
        take: 1,
        select: { userId: true },
      },
    },
  })
  const fallback = await prisma.superAdmin.findFirst({
    where: { user: { isActive: true } },
    select: { userId: true },
  })

  for (const school of schools) {
    const runBy = school.admins[0]?.userId ?? fallback?.userId
    if (!runBy) throw new Error(`No active administrator can own the integrity report for ${school.name}`)
    const report = await runIntegrityChecks(school.id, runBy)
    console.log(`${school.name}: ${report.issues.length} issue(s)`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
