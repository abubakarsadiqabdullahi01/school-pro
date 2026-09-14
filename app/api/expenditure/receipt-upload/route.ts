import { NextResponse } from "next/server"
import { AuthorizationError, requirePermission } from "@/lib/authz"
import { getActiveSchool } from "@/lib/school-context.server"
import { prisma } from "@/lib/db"
import { storeUpload, deleteStoredFile, UploadError } from "@/lib/local-storage"
import { addExpenseAttachment } from "@/app/actions/expenditure"

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("expenditure.manage")
    const schoolId = actor.schoolId || (actor.role === "SUPER_ADMIN" ? (await getActiveSchool())?.id : null)
    if (!schoolId) throw new AuthorizationError("Select a school before uploading receipts")
    const form = await request.formData()
    const file = form.get("receipt")
    const expenseId = form.get("expenseId")
    if (!(file instanceof File) || typeof expenseId !== "string") return NextResponse.json({ error: "Receipt and expense are required" }, { status: 400 })
    const expense = await prisma.expense.findFirst({ where: { id: expenseId, schoolId }, select: { status: true } })
    if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 })
    if (expense.status === "CANCELLED" || expense.status === "REJECTED") return NextResponse.json({ error: "This expense cannot accept receipts" }, { status: 400 })
    const url = await storeUpload(file, "expense-receipts", schoolId)
    try {
      const result = await addExpenseAttachment({ expenseId, url, fileName: file.name, mimeType: file.type, sizeBytes: file.size })
      if (!result.success) {
        await deleteStoredFile(url)
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ success: true, id: result.data.id })
    } catch (error) { await deleteStoredFile(url); throw error }
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 })
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("Receipt upload failed")
    return NextResponse.json({ error: "Could not upload receipt" }, { status: 500 })
  }
}
