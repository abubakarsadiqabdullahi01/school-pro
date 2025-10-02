// app/api/s3/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { S3 } from "@/lib/S3Client";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { schoolId } = await request.json();
    if (!schoolId) return NextResponse.json({ error: "Missing school ID" }, { status: 400 });

    const admin = await prisma.admin.findUnique({ where: { userId: session.user.id } });
    if (!admin?.schoolId || admin.schoolId !== schoolId) {
      return NextResponse.json({ error: "You can only manage logos for your assigned school" }, { status: 403 });
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { logoUrl: true } });
    await prisma.school.update({ where: { id: schoolId }, data: { logoUrl: null } });

    if (school?.logoUrl) {
      try {
        const oldUrl = new URL(school.logoUrl);
        const key = oldUrl.pathname.substring(1);
        await S3.send(new DeleteObjectCommand({ Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!, Key: key }));
      } catch (err) {
        console.error("Failed to delete logo from S3:", err);
      }
    }

    return NextResponse.json({ success: true, message: "Logo removed successfully" });
  } catch (error) {
    console.error("Logo deletion error:", error);
    return NextResponse.json({ error: "Failed to remove logo" }, { status: 500 });
  }
}
