import { prisma } from "@/lib/db"
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
