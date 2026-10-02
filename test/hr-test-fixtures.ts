import { createStaff } from "@/app/actions/hr"
import { prisma } from "@/lib/db"

/** Test fixture that follows the public HR-first hiring workflow. */
export async function createFinanceOfficer(input: { firstName: string; lastName: string; email: string; phone?: string }) {
  const result = await createStaff({ ...input, staffType: "ACCOUNTANT", department: "Finance", dateEmployed: new Date(), createLogin: true })
  if (!result.success) return result
  const staff = await prisma.staff.findUniqueOrThrow({ where: { id: result.data.id } })
  return { success: true as const, data: { userId: staff.userId!, defaultPassword: result.data.temporaryPassword!, staffNo: staff.staffNo } }
}
