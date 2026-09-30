import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { canViewResults } from "./withholding-rules"
import { WITHHOLD_RESULTS_KEY } from "@/lib/system-config"

/**
 * Whether this school holds results against unpaid fees.
 *
 * Absent row means off, which is what every school had before the setting existed. A
 * failed read also means off: if the settings table cannot be reached, showing a parent
 * their child's marks is the safer wrong answer than telling a family who has paid that
 * they owe money.
 */
export async function schoolWithholdsResults(schoolId: string): Promise<boolean> {
  try {
    const row = await prisma.systemConfiguration.findFirst({
      where: { schoolId, configKey: WITHHOLD_RESULTS_KEY, isActive: true },
      select: { configValue: true },
    })
    return row?.configValue === "true"
  } catch (error) {
    console.error("Could not read the results-withholding setting:", error)
    return false
  }
}

/**
 * Whether a family may see one term's released results on an overview page: the same
 * question the history page and the report card ask. The overviews once skipped it, so a
 * school holding results against unpaid fees still showed every score on the dashboard.
 * Returns the reason to show instead, or null when the results may be shown.
 */
export async function termResultsWithheldReason(
  schoolId: string,
  termId: string,
  charges: ReadonlyArray<{ termId: string | null; balance: Prisma.Decimal.Value }>,
  periodLabel?: string,
): Promise<string | null> {
  const owing = charges
    .filter((charge) => charge.termId === termId)
    .reduce((sum, charge) => sum.plus(charge.balance), new Prisma.Decimal(0))
  const access = canViewResults({ withholdEnabled: await schoolWithholdsResults(schoolId), balanceOwing: owing.toNumber(), periodLabel })
  return access.allowed ? null : access.reason
}
