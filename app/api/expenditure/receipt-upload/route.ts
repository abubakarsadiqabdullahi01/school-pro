import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { NextResponse } from "next/server"
import { v4 as uuid } from "uuid"

import { AuthorizationError, requireRole } from "@/lib/authz"
import { S3 } from "@/lib/S3Client"

/**
 * Presigned upload for an expense receipt.
 *
 * Separate from `app/api/s3/upload` on purpose. That route hardcodes a `school-logos/` key
 * prefix, caps uploads at 1MB, and accepts images only — none of which suits a scanned
 * invoice. It also performs no authorization, which this route must not copy.
 *
 * The flow: the client asks here for a presigned URL, PUTs the file straight to storage,
 * then calls `addExpenseAttachment` with the returned `publicUrl`. The file itself never
 * passes through the server.
 */

/** A receipt is a photo or a scan. Anything else is not a receipt. */
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]

/** Large enough for a phone photo of an invoice, small enough to refuse a video. */
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  try {
    // Same tier that may record an expense. An upload URL is a write.
    const actor = await requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT")

    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES
    const endpoint = process.env.AWS_ENDPOINT_URL_S3
    if (!bucket || !endpoint) {
      console.error("Receipt upload is not configured: missing NEXT_PUBLIC_S3_BUCKET_IMAGES or AWS_ENDPOINT_URL_S3")
      return NextResponse.json({ success: false, error: "File storage is not configured" }, { status: 500 })
    }

    const body = await request.json()
    const fileName = typeof body?.fileName === "string" ? body.fileName : ""
    const contentType = typeof body?.contentType === "string" ? body.contentType : ""
    const size = Number(body?.size)

    if (!fileName || !contentType || !Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ success: false, error: "fileName, contentType and size are required" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { success: false, error: "A receipt must be an image or a PDF" },
        { status: 400 },
      )
    }
    if (size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "Receipts are limited to 10MB" }, { status: 400 })
    }

    // Keyed by school so one tenant's receipts are not interleaved with another's, and the
    // random name means an uploaded filename can never traverse or collide.
    const extension = fileName.includes(".") ? fileName.split(".").pop() : "bin"
    const key = `expense-receipts/${actor.schoolId ?? "platform"}/${uuid()}.${extension}`

    const presignedUrl = await getSignedUrl(
      S3,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size }),
      { expiresIn: 600 },
    )

    const endpointUrl = new URL(endpoint)
    const publicUrl = endpointUrl.host.includes("storage.dev")
      ? `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}/${key}`
      : `${endpoint}/${bucket}/${key}`

    return NextResponse.json({ success: true, presignedUrl, key, publicUrl })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 })
    }
    console.error("Failed to presign an expense receipt upload", error)
    return NextResponse.json({ success: false, error: "Could not start the upload" }, { status: 500 })
  }
}
