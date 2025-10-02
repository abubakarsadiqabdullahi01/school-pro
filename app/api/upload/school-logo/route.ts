// app/api/upload/school-logo/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { S3 } from "@/lib/S3Client";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

// Allowed image types and max size
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("logo") as File;
    const schoolId = formData.get("schoolId") as string;

    if (!file || !schoolId) {
      return NextResponse.json({ error: "Missing file or school ID" }, { status: 400 });
    }

    // Verify admin can upload for this school
    const admin = await prisma.admin.findUnique({ where: { userId: session.user.id } });
    if (!admin?.schoolId || admin.schoolId !== schoolId) {
      return NextResponse.json({ error: "You can only upload logos for your assigned school" }, { status: 403 });
    }

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

    // Generate unique key
    const fileExtension = file.name.split('.').pop() || 'bin';
    const key = `school-logos/${schoolId}-${uuidv4()}.${fileExtension}`;

    // Upload to S3
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const command = new PutObjectCommand({
      Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    });
    
    await S3.send(command);

    // Public URL
     const endpointUrl = new URL(process.env.AWS_ENDPOINT_URL_S3!);
    const logoUrl = endpointUrl.host.includes("storage.dev")
      ? `${endpointUrl.protocol}//${process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES}.${endpointUrl.host}/${key}`
      : `${process.env.AWS_ENDPOINT_URL_S3}/${process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES}/${key}`;

    const old = await prisma.school.findUnique({ where: { id: schoolId }, select: { logoUrl: true } });
    await prisma.school.update({ where: { id: schoolId }, data: { logoUrl } });

    if (old?.logoUrl) {
      try {
        const oldUrl = new URL(old.logoUrl);
        const oldKey = oldUrl.pathname.substring(1);
        await S3.send(new DeleteObjectCommand({ Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!, Key: oldKey }));
      } catch (err) {
        console.error("Failed to delete old logo from S3:", err);
      }
    }

    return NextResponse.json({
      success: true,
      logoUrl,
      message: "Logo uploaded successfully",
    });
  } catch (error: any) {
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: "Failed to upload logo" }, { status: 500 });
  }
}