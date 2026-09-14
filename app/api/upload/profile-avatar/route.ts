// app/api/upload/profile-avatar/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireActor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { storeUpload, deleteStoredFile, UploadError } from "@/lib/local-storage";



const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    // Any signed-in role may change their own avatar. Routed through requireActor rather
    // than a bare auth() so a deactivated or signed-out session is refused here too.
    const actor = await requireActor();
    const userId = actor.userId;

    const formData = await request.formData();
    const file = formData.get("avatar") as File;

    if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Invalid type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
    }

    const avatarUrl = await storeUpload(file, "profile-avatars", userId);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    try {
      await prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    } catch (error) { await deleteStoredFile(avatarUrl); throw error; }

    if (user?.avatarUrl) {
      try {
        await deleteStoredFile(user.avatarUrl);
      } catch (err) {
        console.error("Failed to delete old avatar:", err);
      }
    }

    return NextResponse.json({ success: true, avatarUrl, message: "Avatar uploaded successfully" });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Avatar upload error:", error);
    return NextResponse.json({ error: "Failed to upload avatar" }, { status: 500 });
  }
}
