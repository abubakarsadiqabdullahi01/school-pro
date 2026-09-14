import { NextResponse } from "next/server"
import { AuthorizationError, requireRole } from "@/lib/authz"

// Legacy endpoint: clients upload multipart files to /api/upload/school-logo now.
export async function POST() {
  try {
    await requireRole("SUPER_ADMIN", "ADMIN")
    return NextResponse.json({ success: false, error: "Use /api/upload/school-logo to upload a logo" }, { status: 410 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 })
    return NextResponse.json({ error: "Upload unavailable" }, { status: 500 })
  }
}
