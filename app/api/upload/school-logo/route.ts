// app/api/upload/school-logo/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { assertSchoolAccess, AuthorizationError, requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { storeUpload, deleteStoredFile, UploadError } from "@/lib/local-storage";



// Allowed image types and max size
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    // Same tier as `app/api/s3/delete`: whoever may remove a logo may replace one.
    const actor = await requireRole("SUPER_ADMIN", "ADMIN");

    const formData = await request.formData();
    const file = formData.get("logo") as File;
    const schoolId = formData.get("schoolId") as string;

    if (!(file instanceof File) || typeof schoolId !== "string" || !schoolId) {
      return NextResponse.json({ error: "Missing file or school ID" }, { status: 400 });
    }

    // Scope is checked against the school record itself, not against the id in the form.
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, logoUrl: true } });
    if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });
    assertSchoolAccess(actor, school.id);

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ 
        error: `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}` 
      }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `File size too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB allowed.` 
      }, { status: 400 });
    }

    const logoUrl = await storeUpload(file, "school-logos", school.id);

    try {
      await prisma.school.update({ where: { id: school.id }, data: { logoUrl } });
    } catch (error) { await deleteStoredFile(logoUrl); throw error; }

    if (school.logoUrl) {
      try {
        await deleteStoredFile(school.logoUrl);
      } catch (err) {
        console.error("Failed to delete old locally stored logo:", err);
      }
    }

    return NextResponse.json({
      success: true,
      logoUrl,
      message: "Logo uploaded successfully",
    });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: "Failed to upload logo" }, { status: 500 });
  }
}
