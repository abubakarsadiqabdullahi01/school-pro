import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { writeFile, unlink } from "fs/promises"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("logo") as File
    const schoolId = formData.get("schoolId") as string

    if (!file || !schoolId) {
      return NextResponse.json({ error: "Missing file or school ID" }, { status: 400 })
    }

    // Verify admin can upload for this school
    const admin = await prisma.admin.findUnique({
      where: { userId: session.user.id },
    })

    if (!admin?.schoolId || admin.schoolId !== schoolId) {
      return NextResponse.json({ error: "You can only upload logos for your assigned school" }, { status: 403 })
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid file type. Please upload an image." }, { status: 400 })
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size too large. Maximum 5MB allowed." }, { status: 400 })
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), "public", "uploads", "school-logos")
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const fileExtension = file.name.split(".").pop()
    const fileName = `${schoolId}-${timestamp}.${fileExtension}`
    const filePath = join(uploadsDir, fileName)

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Generate URL for the uploaded file
    const logoUrl = `/uploads/school-logos/${fileName}`

    // Get current logo to delete old file
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { logoUrl: true },
    })

    // Update school with new logo URL
    await prisma.school.update({
      where: { id: schoolId },
      data: { logoUrl },
    })

    // Delete old logo file if it exists
    if (school?.logoUrl && school.logoUrl.startsWith("/uploads/school-logos/")) {
      const oldFilePath = join(process.cwd(), "public", school.logoUrl)
      try {
        if (existsSync(oldFilePath)) {
          await unlink(oldFilePath)
        }
      } catch (error) {
        console.error("Failed to delete old logo file:", error)
        // Don't fail the request if old file deletion fails
      }
    }

    return NextResponse.json({
      success: true,
      logoUrl,
      message: "Logo uploaded successfully",
    })
  } catch (error) {
    console.error("Logo upload error:", error)
    return NextResponse.json({ error: "Failed to upload logo" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { schoolId } = await request.json()

    if (!schoolId) {
      return NextResponse.json({ error: "Missing school ID" }, { status: 400 })
    }

    // Verify admin can delete logo for this school
    const admin = await prisma.admin.findUnique({
      where: { userId: session.user.id },
    })

    if (!admin?.schoolId || admin.schoolId !== schoolId) {
      return NextResponse.json({ error: "You can only manage logos for your assigned school" }, { status: 403 })
    }

    // Get current logo to delete file
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { logoUrl: true },
    })

    // Remove logo URL from database
    await prisma.school.update({
      where: { id: schoolId },
      data: { logoUrl: null },
    })

    // Delete logo file if it exists
    if (school?.logoUrl && school.logoUrl.startsWith("/uploads/school-logos/")) {
      const filePath = join(process.cwd(), "public", school.logoUrl)
      try {
        if (existsSync(filePath)) {
          await unlink(filePath)
        }
      } catch (error) {
        console.error("Failed to delete logo file:", error)
        // Don't fail the request if file deletion fails
      }
    }

    return NextResponse.json({
      success: true,
      message: "Logo removed successfully",
    })
  } catch (error) {
    console.error("Logo deletion error:", error)
    return NextResponse.json({ error: "Failed to remove logo" }, { status: 500 })
  }
}
