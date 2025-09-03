// app/api/s3/upload/route.ts
import { S3 } from "@/lib/S3Client"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

// Validate environment variables
function validateEnv() {
  const required = [
    'NEXT_PUBLIC_S3_BUCKET_IMAGES',
    'AWS_ENDPOINT_URL_S3'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

// Allowed image types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp'
];

export async function POST(request: Request) {
  try {
    validateEnv();
    
    const body = await request.json();
    const { fileName, contentType, size, isImage } = body;

    // Validate required fields
    if (!fileName || !contentType || !size) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    // Validate file size (1MB limit)
    if (size > 1 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "File size too large. Maximum 1MB allowed." }, { status: 400 });
    }

    // Validate content type for images
    if (isImage) {
      if (!contentType.startsWith("image/")) {
        return NextResponse.json(
          { success: false, error: "Invalid file type. Only images are allowed." },
          { status: 400 },
        );
      }
      
      // Check against allowed types
      if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
        return NextResponse.json(
          { success: false, error: `File type not allowed. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}` },
          { status: 400 },
        );
      }
    }

    // Generate unique key
    const fileExtension = fileName.split('.').pop() || 'bin';
    const key = `school-logos/${uuidv4()}.${fileExtension}`;

    // Create presigned URL
    const command = new PutObjectCommand({
      Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES!,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });

    const presignedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 });

    // Generate public URL
    const publicUrl = `${process.env.AWS_ENDPOINT_URL_S3}/${process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES}/${key}`;

    return NextResponse.json({
      success: true,
      presignedUrl,
      key,
      publicUrl,
    });
  } catch (error: any) {
    console.error("Error generating presigned URL:", error);
    
    if (error.message.includes('Missing environment variables')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: false, error: "Failed to generate upload URL" }, { status: 500 });
  }
}