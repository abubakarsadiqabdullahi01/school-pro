// app/api/s3/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteStoredFile } from "@/lib/local-storage";

import { assertSchoolAccess, AuthorizationError, requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";

export async function DELETE(request: NextRequest) {
  try {
    // A super admin spans every school; an admin is confined to their own by the
    // assertSchoolAccess below. Both arrive through the one authorization boundary, so a
    // deactivated account or a revoked session is refused before anything is deleted.
    const actor = await requireRole("SUPER_ADMIN", "ADMIN");

    const { schoolId } = await request.json();
    if (!schoolId) return NextResponse.json({ error: "Missing school ID" }, { status: 400 });

    // Scope is checked against the school record itself, not against the id in the body.
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, logoUrl: true } });
    if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });
    assertSchoolAccess(actor, school.id);

    await prisma.school.update({ where: { id: school.id }, data: { logoUrl: null } });

    if (school.logoUrl) {
      try {
        await deleteStoredFile(school.logoUrl);
      } catch (err) {
        console.error("Failed to delete logo from S3:", err);
      }
    }

    return NextResponse.json({ success: true, message: "Logo removed successfully" });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Logo deletion error:", error);
    return NextResponse.json({ error: "Failed to remove logo" }, { status: 500 });
  }
}
