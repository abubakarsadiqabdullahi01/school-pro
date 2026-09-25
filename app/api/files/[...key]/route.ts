import { NextResponse } from "next/server"
import { AuthorizationError, assertSchoolAccess, requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { FILE_URL_PREFIX, fileContentType, readStoredFile, validFileKey } from "@/lib/local-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const key = (await params).key.join("/")
    if (!validFileKey(key)) return new NextResponse("Not found", { status: 404 })
    const receipt = key.startsWith("expense-receipts/")
    if (receipt) {
      const actor = await requirePermission("expenditure.manage")
      const attachment = await prisma.expenseAttachment.findFirst({
        where: { url: `${FILE_URL_PREFIX}${key}` }, select: { expense: { select: { schoolId: true } } },
      })
      if (!attachment) return new NextResponse("Not found", { status: 404 })
      assertSchoolAccess(actor, attachment.expense.schoolId)
    }
    // A staff member's ID card, contract or medical report. Guarded like a receipt and for
    // stronger reasons: this is personal data about an employee, and an unguessable key is
    // not an access control.
    const staffDocument = key.startsWith("staff-documents/")
    if (staffDocument) {
      const actor = await requirePermission("payroll.manage")
      const document = await prisma.staffDocument.findFirst({
        where: { storageKey: `${FILE_URL_PREFIX}${key}` },
        select: { staff: { select: { schoolId: true } } },
      })
      if (!document) return new NextResponse("Not found", { status: 404 })
      assertSchoolAccess(actor, document.staff.schoolId)
    }
    const private_ = receipt || staffDocument
    const bytes = await readStoredFile(key)
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": fileContentType(key),
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": `${private_ ? "attachment" : "inline"}; filename="${key.split("/").pop()}"`,
      "Cache-Control": private_ ? "private, no-store" : "public, max-age=3600",
    } })
  } catch (error) {
    if (error instanceof AuthorizationError) return new NextResponse("Forbidden", { status: 403 })
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new NextResponse("Not found", { status: 404 })
    console.error("Stored file could not be read")
    return new NextResponse("File unavailable", { status: 500 })
  }
}
