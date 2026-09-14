/**
 * Gate 1 pre-flight check.
 *
 * Run this against every database before applying the Gate 1 migration. It is read-only —
 * it reports what the migration will collide with and changes nothing.
 *
 *   npx tsx scripts/gate1-preflight.ts
 *
 * The migration adds two unique constraints and converts two money columns. A unique
 * constraint refuses to build if the table already violates it, so duplicates have to be
 * resolved first. Anything reported as BLOCKING here must be cleared before migrating.
 */

import { createPrismaClient } from "../lib/prisma-client"

const prisma = createPrismaClient()

type Row = Record<string, unknown>

let blocking = 0

function report(label: string, count: number, isBlocking: boolean, note: string) {
  const status = count === 0 ? "OK  " : isBlocking ? "STOP" : "NOTE"
  if (count > 0 && isBlocking) blocking++
  console.log(`${status}  ${label.padEnd(46)} ${String(count).padStart(6)}  ${note}`)
}

/**
 * True once the Gate 1 migration has run — `FeeStructure.classId` is the column it drops.
 * Checked so this script reports "already migrated" instead of failing on a missing column
 * when someone runs it twice.
 */
async function alreadyMigrated(): Promise<boolean> {
  const columns = await prisma.$queryRaw<Row[]>`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FeeStructure'
      AND COLUMN_NAME = 'classId'
  `
  return columns.length === 0
}

async function main() {
  console.log("\nGate 1 pre-flight — read-only\n")

  if (await alreadyMigrated()) {
    console.log("This database has already had the Gate 1 migration applied.")
    console.log("`FeeStructure.classId` is gone, so there is nothing left to check here.")
    console.log("Confirm with: npx prisma migrate status\n")
    return
  }

  console.log("      check                                          count  note")
  console.log("      " + "-".repeat(88))

  // 1.1 — the Assessment unique key drops teacherId. Any student/subject/term with more
  // than one row today will violate the new constraint.
  const dupAssessments = await prisma.$queryRaw<Row[]>`
    SELECT studentId, subjectId, termId, COUNT(*) AS dupCount
    FROM assessments
    GROUP BY studentId, subjectId, termId
    HAVING COUNT(*) > 1
  `
  report(
    "duplicate assessments (student+subject+term)",
    dupAssessments.length,
    true,
    dupAssessments.length ? "resolve before migrating — see below" : "new unique key will build",
  )

  // 1.3 — Attendance gains @@unique([studentId, date]).
  const dupAttendance = await prisma.$queryRaw<Row[]>`
    SELECT studentId, \`date\`, COUNT(*) AS dupCount
    FROM Attendance
    GROUP BY studentId, \`date\`
    HAVING COUNT(*) > 1
  `
  report(
    "duplicate attendance (student+date)",
    dupAttendance.length,
    true,
    dupAttendance.length ? "keep one row per student per day" : "new unique key will build",
  )

  // 1.3 — status becomes an enum. Anything outside the three values would be truncated.
  const badStatus = await prisma.$queryRaw<Row[]>`
    SELECT DISTINCT status
    FROM Attendance
    WHERE status NOT IN ('PRESENT', 'ABSENT', 'LATE')
  `
  report(
    "attendance rows with an unexpected status",
    badStatus.length,
    true,
    badStatus.length ? `found: ${badStatus.map((r) => r.status).join(", ")}` : "all values fit the enum",
  )

  // 1.5 — FeeStructure moves from classId+termId onto classTermId. Existing rows need a
  // matching ClassTerm to point at.
  const feeStructures = await prisma.feeStructure.count()
  const payments = await prisma.payment.count()
  report("fee structures to re-key onto ClassTerm", feeStructures, false, "each needs a matching ClassTerm")
  report("payment rows to backfill school/term on", payments, false, "backfilled through feeStructure")

  if (feeStructures > 0) {
    const orphans = await prisma.$queryRaw<Row[]>`
      SELECT fs.id
      FROM FeeStructure fs
      LEFT JOIN ClassTerm ct ON ct.classId = fs.classId AND ct.termId = fs.termId
      WHERE ct.id IS NULL
    `
    report(
      "fee structures with no matching ClassTerm",
      orphans.length,
      true,
      orphans.length ? "create the ClassTerm or delete the fee" : "every fee maps cleanly",
    )
  }

  // 1.2 — Float to Decimal(12,2). Anything with more than two decimal places will be
  // rounded, and anything above the precision would fail outright.
  if (feeStructures > 0 || payments > 0) {
    const overPrecision = await prisma.$queryRaw<Row[]>`
      SELECT 'FeeStructure' AS tbl, id, amount FROM FeeStructure
        WHERE amount <> ROUND(amount, 2) OR ABS(amount) >= 10000000000
      UNION ALL
      SELECT 'Payment' AS tbl, id, amount FROM Payment
        WHERE amount <> ROUND(amount, 2) OR ABS(amount) >= 10000000000
    `
    report(
      "amounts that will round or overflow Decimal(12,2)",
      overPrecision.length,
      false,
      overPrecision.length ? "these will be rounded to 2dp" : "every amount converts exactly",
    )
  }

  // Context for the duplicate-assessment fix.
  if (dupAssessments.length > 0) {
    console.log("\n  Duplicate assessments — the rows the new unique key would reject:\n")
    const detail = await prisma.$queryRaw<Row[]>`
      SELECT a.studentId, a.subjectId, a.termId, a.id, a.teacherId,
             a.ca1, a.ca2, a.ca3, a.exam, a.updatedAt
      FROM assessments a
      JOIN (
        SELECT studentId, subjectId, termId
        FROM assessments
        GROUP BY studentId, subjectId, termId
        HAVING COUNT(*) > 1
      ) d ON d.studentId = a.studentId AND d.subjectId = a.subjectId AND d.termId = a.termId
      ORDER BY a.studentId, a.subjectId, a.termId, a.updatedAt DESC
    `
    console.table(detail)
    console.log(
      "  Decide per group which row is authoritative. Most recently updated is the usual\n" +
      "  answer, but check for a group where an earlier row has scores and the later one is\n" +
      "  empty — that is the duplicate-insert bug, and the earlier row is the real one.\n",
    )
  }

  console.log("")
  if (blocking > 0) {
    console.error(`${blocking} blocking issue(s). Resolve these before applying the Gate 1 migration.\n`)
    process.exit(1)
  }
  console.log("No blocking issues. The Gate 1 migration can be applied to this database.\n")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
