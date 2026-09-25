import { prisma } from "@/lib/db"

/**
 * Removes the leftovers that integration runs leave behind.
 *
 * Every integration suite stamps the rows it creates with a `ZZ` prefix and deletes them in
 * `afterAll` — but a suite that fails in `beforeAll`, or is interrupted, never reaches its
 * clean-up. Those orphans then collide with the next run: "July 2019 has already been
 * generated", `UniqueConstraintViolation` on an expense category, a login already linked to
 * a staff record. The suite stops being a signal about the code and becomes a signal about
 * the database.
 *
 * Deliberately targeted rather than a `migrate reset`: this database holds a demo school
 * somebody is working against, and the fixtures are identifiable without destroying it.
 *
 *   npx tsx scripts/clean-test-fixtures.ts          # report only
 *   npx tsx scripts/clean-test-fixtures.ts --apply  # actually delete
 *
 * Also ensures a second school exists. Several suites assert that one school cannot reach
 * another's data, and with a single school in the database they fail in `beforeAll` with
 * "Need a second school to test the boundary" — a missing fixture reported as a failure.
 */

const APPLY = process.argv.includes("--apply")
const ZZ = "ZZ"
/**
 * The tenancy fixture's name.
 *
 * Deliberately not ZZ-prefixed: the clean-up above would otherwise delete the very school
 * the next run needs, and the boundary suites would go straight back to failing in
 * `beforeAll` with "Need a second school".
 */
const BOUNDARY_SCHOOL = "Boundary Test Academy"
/** The HR suite's deliberately implausible payroll period, plus the month after it. */
const TEST_PAYROLL_YEAR = 2019

type Step = { label: string; count: () => Promise<number>; remove: () => Promise<number> }

const steps: Step[] = [
  {
    label: "payroll runs for the test year (and everything frozen under them)",
    count: () => prisma.payrollRun.count({ where: { year: TEST_PAYROLL_YEAR } }),
    remove: async () =>
      (await prisma.payrollRun.deleteMany({ where: { year: TEST_PAYROLL_YEAR } })).count,
  },
  {
    label: "salary, allowance and deduction assignments for ZZ staff",
    count: () => prisma.staffSalary.count({ where: { staff: { firstName: { startsWith: ZZ } } } }),
    remove: async () => {
      const where = { staff: { firstName: { startsWith: ZZ } } }
      const [salaries, allowances, deductions] = await Promise.all([
        prisma.staffSalary.deleteMany({ where }),
        prisma.staffAllowance.deleteMany({ where }),
        prisma.staffDeduction.deleteMany({ where }),
      ])
      return salaries.count + allowances.count + deductions.count
    },
  },
  {
    label: "ZZ staff records",
    count: () =>
      prisma.staff.count({
        where: { OR: [{ firstName: { startsWith: ZZ } }, { staffNo: { startsWith: ZZ } }] },
      }),
    remove: async () =>
      (
        await prisma.staff.deleteMany({
          where: { OR: [{ firstName: { startsWith: ZZ } }, { staffNo: { startsWith: ZZ } }] },
        })
      ).count,
  },
  {
    label: "ZZ expenses, categories and payment accounts",
    count: () => prisma.expenseCategory.count({ where: { name: { startsWith: ZZ } } }),
    remove: async () => {
      const zzExpense = {
        OR: [
          { description: { startsWith: ZZ } },
          { category: { name: { startsWith: ZZ } } },
          { account: { name: { startsWith: ZZ } } },
        ],
      }

      // `AccountingReversal.expenseId` is ON DELETE RESTRICT — a correction must outlive a
      // careless delete of the thing it corrects. Clear those first or the expense refuses
      // to go, and the whole clean-up aborts on a ForeignKeyConstraintViolation.
      const reversals = await prisma.accountingReversal.deleteMany({
        where: { expense: zzExpense },
      })

      // Then expenses: a category with spending against it will not delete either.
      const expenses = await prisma.expense.deleteMany({ where: zzExpense })
      const [categories, accounts] = await Promise.all([
        prisma.expenseCategory.deleteMany({ where: { name: { startsWith: ZZ } } }),
        prisma.paymentAccount.deleteMany({ where: { name: { startsWith: ZZ } } }),
      ])
      return reversals.count + expenses.count + categories.count + accounts.count
    },
  },
  {
    label: "ZZ pay components and salary scales",
    count: () => prisma.salaryScale.count({ where: { name: { startsWith: ZZ } } }),
    remove: async () => {
      const [allowanceTypes, deductionTypes, scales] = await Promise.all([
        prisma.allowanceType.deleteMany({ where: { name: { startsWith: ZZ } } }),
        prisma.deductionType.deleteMany({ where: { name: { startsWith: ZZ } } }),
        prisma.salaryScale.deleteMany({ where: { name: { startsWith: ZZ } } }),
      ])
      return allowanceTypes.count + deductionTypes.count + scales.count
    },
  },
  {
    label: "ZZ fee setup",
    count: () => prisma.feeCategory.count({ where: { name: { startsWith: ZZ } } }),
    remove: async () => {
      // Order matters: FeeSchedule.categoryId is ON DELETE RESTRICT, so a category with any
      // schedule against it refuses to go. Schedules first, then structures, then the
      // categories they pointed at.
      const zzSchedule = {
        OR: [{ name: { startsWith: ZZ } }, { category: { name: { startsWith: ZZ } } }],
      }

      // A schedule is what raises charges, and a charge is what a payment is allocated
      // against, so the pile has to come apart from the bottom: allocations, then charges,
      // discounts and exemptions, and only then the schedule itself.
      const allocations = await prisma.paymentAllocation.deleteMany({
        where: { charge: { feeSchedule: zzSchedule } },
      })
      const [charges, discounts, exemptions] = await Promise.all([
        prisma.studentCharge.deleteMany({ where: { feeSchedule: zzSchedule } }),
        prisma.discount.deleteMany({ where: { feeSchedule: zzSchedule } }),
        prisma.feeExemption.deleteMany({ where: { feeSchedule: zzSchedule } }),
      ])

      const schedules = await prisma.feeSchedule.deleteMany({ where: zzSchedule })
      const beneath = allocations.count + charges.count + discounts.count + exemptions.count
      const structures = await prisma.feeStructure.deleteMany({
        where: { name: { startsWith: ZZ } },
      })
      const categories = await prisma.feeCategory.deleteMany({
        where: { name: { startsWith: ZZ } },
      })
      return beneath + schedules.count + structures.count + categories.count
    },
  },
  {
    label: "ZZ users (cascades to their teacher, student, parent and admin rows)",
    count: () => prisma.user.count({ where: { firstName: { startsWith: ZZ } } }),
    remove: async () =>
      (await prisma.user.deleteMany({ where: { firstName: { startsWith: ZZ } } })).count,
  },
  {
    label: "ZZ academic structure (subjects, classes, terms, sessions)",
    count: () => prisma.subject.count({ where: { name: { startsWith: ZZ } } }),
    remove: async () => {
      const subjects = await prisma.subject.deleteMany({ where: { name: { startsWith: ZZ } } })
      const classes = await prisma.class.deleteMany({ where: { name: { startsWith: ZZ } } })
      const terms = await prisma.term.deleteMany({ where: { name: { startsWith: ZZ } } })
      const sessions = await prisma.session.deleteMany({ where: { name: { startsWith: ZZ } } })
      return subjects.count + classes.count + terms.count + sessions.count
    },
  },
  {
    label: "ZZ grading systems",
    count: () => prisma.gradingSystem.count({ where: { name: { startsWith: ZZ } } }),
    remove: async () =>
      (await prisma.gradingSystem.deleteMany({ where: { name: { startsWith: ZZ } } })).count,
  },
  {
    label: "ZZ schools (cascades to everything beneath them)",
    count: () =>
      prisma.school.count({
        where: { OR: [{ name: { startsWith: ZZ } }, { code: { startsWith: ZZ } }] },
      }),
    remove: async () =>
      (
        await prisma.school.deleteMany({
          where: { OR: [{ name: { startsWith: ZZ } }, { code: { startsWith: ZZ } }] },
        })
      ).count,
  },
]

/**
 * A second school, so the tenancy-boundary suites have something to be refused by.
 *
 * Named without a ZZ prefix on purpose: the clean-up above would otherwise delete the very
 * fixture the next run needs, and these suites would go back to failing in `beforeAll`.
 */
async function ensureSecondSchool(): Promise<string> {
  const existing = await prisma.school.findFirst({
    where: { name: BOUNDARY_SCHOOL },
    select: { id: true, sessions: { select: { id: true }, take: 1 } },
  })

  const others = await prisma.school.count({ where: { name: { not: BOUNDARY_SCHOOL } } })
  if (!existing && others >= 2) return `${others} schools already present`

  if (!APPLY) {
    return existing
      ? "would top up the boundary school's academic structure"
      : "would create a second school (tenancy-boundary fixture)"
  }

  const schoolId =
    existing?.id ??
    (
      await prisma.school.create({
        data: {
          name: BOUNDARY_SCHOOL,
          code: `BTA-${Date.now().toString().slice(-6)}`,
          email: "boundary@example.test",
          address: "A second school, so tenancy tests have something to be refused by",
          phone: "08000000000",
          isActive: true,
        },
        select: { id: true },
      })
    ).id

  if (existing?.sessions.length) return "boundary school already has a session"

  // A bare school is not enough. Several suites reach into "the other school" for a term or
  // a class to aim a cross-tenant request at, and an empty one turns "this was correctly
  // refused" into "there was nothing to ask for" — a different failure wearing the same
  // red. So it gets the minimum structure those assertions need.
  const year = new Date().getFullYear()
  const session = await prisma.session.create({
    data: {
      schoolId,
      name: `${year}/${year + 1}`,
      startDate: new Date(Date.UTC(year, 8, 1)),
      endDate: new Date(Date.UTC(year + 1, 6, 31)),
    },
    select: { id: true },
  })
  const term = await prisma.term.create({
    data: {
      sessionId: session.id,
      name: "First Term",
      startDate: new Date(Date.UTC(year, 8, 1)),
      endDate: new Date(Date.UTC(year, 11, 15)),
    },
    select: { id: true },
  })
  const klass = await prisma.class.create({
    data: { schoolId, name: "Boundary Class", level: "JSS" },
    select: { id: true },
  })
  await prisma.classTerm.create({ data: { classId: klass.id, termId: term.id } })

  return existing
    ? "topped up the boundary school with a session, term and class"
    : "created the boundary school with a session, term and class"
}

async function main() {
  console.log(APPLY ? "Removing test leftovers.\n" : "Dry run - nothing will be deleted.\n")

  let total = 0
  let failed = 0
  for (const step of steps) {
    // One step failing must not abandon the rest. These are independent piles of rubbish,
    // and a foreign key nobody anticipated in one of them should cost that pile, not all
    // of them — with the reason printed rather than swallowed.
    try {
      const n = APPLY ? await step.remove() : await step.count()
      total += n
      console.log(`  ${n === 0 ? "-" : n} ${step.label}`)
    } catch (error) {
      failed += 1
      console.log(`  ! ${step.label}`)
      const text = error instanceof Error ? error.message : String(error)
      // Prisma puts the useful sentence several lines in, after the rendered query, so
      // print the first line that actually says something.
      const detail =
        text
          .split("\n")
          .map((line) => line.trim())
          .find((line) => /constraint|required|missing|Unknown|violation/i.test(line)) ??
        text.split("\n").find((line) => line.trim().length > 0) ??
        text
      console.log(`      ${detail}`)
    }
  }

  console.log(`\n${APPLY ? "Removed" : "Found"} ${total} row(s) by the counted measure.`)
  if (failed > 0) console.log(`${failed} step(s) could not complete - see above.`)
  console.log(await ensureSecondSchool())

  if (!APPLY) console.log("\nRe-run with --apply to delete.")
  await prisma.$disconnect()
}

void main()
