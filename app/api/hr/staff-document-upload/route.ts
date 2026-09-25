import { NextResponse } from "next/server"

import { recordStaffDocument } from "@/app/actions/hr-onboarding"
import { AuthorizationError, assertSchoolAccess, requirePermission } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { UploadError, deleteStoredFile, storeUpload } from "@/lib/local-storage"
import { getActiveSchool } from "@/lib/school-context.server"

/**
 * Uploading a staff document — an appointment letter, an ID, a certificate.
 *
 * Mirrors `app/api/expenditure/receipt-upload/route.ts` deliberately, including the
 * write-then-record-then-clean-up-on-failure shape: the bytes are stored first, and if the
 * database row cannot be written the file is deleted again rather than left orphaned on
 * disk.
 *
 * Reading these back is guarded in `app/api/files/[...key]/route.ts`, which requires the
 * same permission and checks the document belongs to the reader's school. An unguessable
 * key is not an access control, and this is somebody's ID card.
 */
export async function POST(request: Request) {
  try {
    const actor = await requirePermission("payroll.manage")
    const schoolId =
      actor.schoolId || (actor.role === "SUPER_ADMIN" ? (await getActiveSchool())?.id : null)
    if (!schoolId) throw new AuthorizationError("Select a school before uploading staff documents")

    const form = await request.formData()
    const file = form.get("document")
    const staffId = form.get("staffId")
    const type = form.get("type")
    const title = form.get("title")
    const expiresAt = form.get("expiresAt")

    if (!(file instanceof File) || typeof staffId !== "string" || typeof type !== "string") {
      return NextResponse.json(
        { error: "A file, a staff member and a document type are required" },
        { status: 400 },
      )
    }

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { schoolId: true, employmentStatus: true },
    })
    if (!staff) return NextResponse.json({ error: "Staff record not found" }, { status: 404 })
    assertSchoolAccess(actor, staff.schoolId)

    const storageKey = await storeUpload(file, "staff-documents", schoolId)
    try {
      const result = await recordStaffDocument({
        staffId,
        type,
        title: typeof title === "string" && title.trim() ? title.trim() : file.name,
        storageKey,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        expiresAt: typeof expiresAt === "string" && expiresAt ? expiresAt : null,
      })

      if (!result.success) {
        await deleteStoredFile(storageKey)
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true, id: result.data.id })
    } catch (error) {
      await deleteStoredFile(storageKey)
      throw error
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("Staff document upload failed")
    return NextResponse.json({ error: "Could not upload that document" }, { status: 500 })
  }
}
