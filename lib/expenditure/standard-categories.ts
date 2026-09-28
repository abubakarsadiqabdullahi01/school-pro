import type { Prisma } from "@prisma/client"

/**
 * The expenditure headings every school starts with.
 *
 * A new school used to start with none, and the first thing that needed one was payroll:
 * paying a run refused with "create a Salaries category first", and then went looking for
 * any category whose name happened to contain "Salar". Every school also invented its own
 * headings, so no two budget summaries could be read the same way.
 *
 * These are a starting chart, not a lock. A school can rename, retire or add to them like
 * any other category - `ExpenseCategory` is unique per school by name and nothing else.
 */
export const SALARY_CATEGORY_NAME = "Salaries and Wages"
export const REIMBURSEMENT_CATEGORY_NAME = "Staff Reimbursements"

export const STANDARD_EXPENSE_CATEGORIES: ReadonlyArray<{ name: string; description: string }> = [
  { name: SALARY_CATEGORY_NAME, description: "Staff pay settled through payroll." },
  { name: REIMBURSEMENT_CATEGORY_NAME, description: "Money paid back to staff for approved spending on the school's behalf." },
  { name: "Utilities", description: "Electricity, water, internet and telephone." },
  { name: "Fuel and Generator", description: "Diesel, petrol and generator servicing." },
  { name: "Repairs and Maintenance", description: "Buildings, furniture and equipment." },
  { name: "Teaching and Learning Materials", description: "Textbooks, laboratory and classroom supplies." },
  { name: "Examinations", description: "Exam printing, papers and external examination fees." },
  { name: "Transport", description: "School buses, trips and logistics." },
  { name: "Office and Administration", description: "Stationery, printing and office supplies." },
  { name: "Cleaning and Sanitation", description: "Cleaning materials and sanitation services." },
  { name: "Security", description: "Guards, locks and security services." },
  { name: "Bank Charges", description: "Transfer fees, account maintenance and other bank charges." },
  { name: "Miscellaneous", description: "Spending that fits no other heading. Review it termly." },
]

type CategoryRow = { id: string; name: string; isActive: boolean }

function normal(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * The category salaries are booked under, from the school's own list, or null.
 *
 * In order: the standard heading; then "Salaries", which the demo data and early schools
 * used; then any active heading that mentions salary. Active before retired at every step,
 * so a school that replaced its old heading is not booked under the one it retired.
 */
export function pickSalaryCategory(categories: readonly CategoryRow[]): CategoryRow | null {
  const active = categories.filter((category) => category.isActive)
  const byName = (name: string) => active.find((category) => normal(category.name) === normal(name))

  return (
    byName(SALARY_CATEGORY_NAME) ??
    byName("Salaries") ??
    active.find((category) => /salar|wage/i.test(category.name)) ??
    null
  )
}

/**
 * The salary category, creating the standard one when the school has none.
 *
 * Payroll must not be blocked on a label. Refusing to pay staff until somebody found the
 * expenditure setup screen was the old behaviour, and a school discovering it on payday is
 * exactly the wrong moment. Upserted on the (school, name) unique key, so two runs paid at
 * once cannot create it twice.
 */
export async function salaryCategoryFor(
  client: Prisma.TransactionClient,
  schoolId: string,
): Promise<{ id: string; name: string }> {
  const categories = await client.expenseCategory.findMany({
    where: { schoolId },
    select: { id: true, name: true, isActive: true },
  })
  const picked = pickSalaryCategory(categories)
  if (picked) return { id: picked.id, name: picked.name }

  const standard = STANDARD_EXPENSE_CATEGORIES[0]
  return client.expenseCategory.upsert({
    where: { schoolId_name: { schoolId, name: standard.name } },
    create: { schoolId, name: standard.name, description: standard.description },
    // A retired "Salaries and Wages" is brought back: it is the only salary heading left,
    // and a payroll booked under a retired heading would vanish from the setup screens.
    update: { isActive: true },
    select: { id: true, name: true },
  })
}

/**
 * Adds whichever standard headings a school does not already have, by name.
 *
 * Used when a school is created, and safe to run again: an existing heading of the same
 * name - active or retired - is left exactly as the school has it.
 */
export async function ensureStandardExpenseCategories(
  client: Prisma.TransactionClient,
  schoolId: string,
): Promise<number> {
  const existing = await client.expenseCategory.findMany({
    where: { schoolId },
    select: { name: true },
  })
  const taken = new Set(existing.map((category) => normal(category.name)))
  const missing = STANDARD_EXPENSE_CATEGORIES.filter((category) => !taken.has(normal(category.name)))
  if (missing.length === 0) return 0

  const created = await client.expenseCategory.createMany({
    data: missing.map((category) => ({ schoolId, name: category.name, description: category.description })),
    skipDuplicates: true,
  })
  return created.count
}
