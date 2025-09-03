// app/api/upload/profile-avatar/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { S3 } from "@/lib/S3Client";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

// Allowed image types and max size
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB for profile avatars

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File;
    const userId = session.user.id;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
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
    const key = `profile-avatars/${userId}-${uuidv4()}.${fileExtension}`;

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

    // Generate public URL based on S3 provider
    let avatarUrl: string;
    
    if (process.env.AWS_ENDPOINT_URL_S3?.includes('tigris')) {
      const endpointUrl = new URL(process.env.AWS_ENDPOINT_URL_S3);
      avatarUrl = `${endpointUrl.protocol}//${process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES}.${endpointUrl.host}/${key}`;
    } else {
      avatarUrl = `${process.env.AWS_ENDPOINT_URL_S3}/${process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES}/${key}`;
    }

    // Get old avatar for cleanup
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    // Update DB with new avatar
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    // Delete old avatar from S3 if it exists and is from our S3 bucket
    if (user?.avatarUrl && user.avatarUrl.includes(process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!)) {
      try {
        const oldUrl = new URL(user.avatarUrl);
        const oldKey = oldUrl.pathname.substring(1); // Remove leading slash
        
        await S3.send(new DeleteObjectCommand({
          Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!,
          Key: oldKey,
        }));
      } catch (err) {
        console.error("Failed to delete old avatar from S3:", err);
        // Continue even if old avatar deletion fails
      }
    }

    return NextResponse.json({
      success: true,
      avatarUrl,
      message: "Avatar uploaded successfully",
    });
  } catch (error: any) {
    console.error("Avatar upload error:", error);
    
    let errorMessage = "Failed to upload avatar";
    if (error.name === "AccessDenied") {
      errorMessage = "Storage access denied. Please contact administrator.";
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get current avatar
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    // Update DB to remove avatar
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    // Delete from S3 if it exists and is from our S3 bucket
    if (user?.avatarUrl && user.avatarUrl.includes(process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!)) {
      try {
        const oldUrl = new URL(user.avatarUrl);
        const oldKey = oldUrl.pathname.substring(1);
        
        await S3.send(new DeleteObjectCommand({
          Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!,
          Key: oldKey,
        }));
      } catch (err) {
        console.error("Failed to delete avatar from S3:", err);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Avatar removed successfully",
    });
  } catch (error) {
    console.error("Avatar deletion error:", error);
    return NextResponse.json({ error: "Failed to remove avatar" }, { status: 500 });
  }
}