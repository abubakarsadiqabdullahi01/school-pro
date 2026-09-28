import { type NextRequest, NextResponse } from "next/server"
import { AuthorizationError, requireActor } from "@/lib/authz"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    // Await the params to get the userId
    const { userId } = await params

    // Verify the current user is authorized to view this login history
    const actor = await requireActor()
    if (actor.userId !== userId && actor.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Get the login history for the user
    const loginAttempts = await prisma.loginAttempt.findMany({
      where: { userId },
      orderBy: { attemptTime: "desc" },
      take: 10, // Limit to the 10 most recent attempts
    })

    return NextResponse.json(loginAttempts)
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Error fetching login history:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
