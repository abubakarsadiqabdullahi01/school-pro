// app/api/upload/profile-avatar/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { S3 } from "@/lib/S3Client";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File;
    const userId = session.user.id;

    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Invalid type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
    }

    const fileExtension = file.name.split('.').pop() || 'bin';
    const key = `profile-avatars/${userId}-${uuidv4()}.${fileExtension}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await S3.send(new PutObjectCommand({
      Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }));

    // ✅ Fix URL
    const endpointUrl = new URL(process.env.AWS_ENDPOINT_URL_S3!);
    const avatarUrl = endpointUrl.host.includes("storage.dev")
      ? `${endpointUrl.protocol}//${process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES}.${endpointUrl.host}/${key}`
      : `${process.env.AWS_ENDPOINT_URL_S3}/${process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES}/${key}`;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl } });

    if (user?.avatarUrl && user.avatarUrl.includes(process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!)) {
      try {
        const oldUrl = new URL(user.avatarUrl);
        const oldKey = oldUrl.pathname.substring(1);
        await S3.send(new DeleteObjectCommand({ Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!, Key: oldKey }));
      } catch (err) {
        console.error("Failed to delete old avatar:", err);
      }
    }

    return NextResponse.json({ success: true, avatarUrl, message: "Avatar uploaded successfully" });
  } catch (error: any) {
    console.error("Avatar upload error:", error);
    return NextResponse.json({ error: "Failed to upload avatar" }, { status: 500 });
  }
}
