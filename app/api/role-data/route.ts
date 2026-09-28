import { type NextRequest, NextResponse } from "next/server"
import { AuthorizationError, requireActor } from "@/lib/authz"
import { getRoleData } from "@/lib/server-utils"

export async function GET(req: NextRequest) {
  try {
    // Get the user session
    const actor = await requireActor()

    // Get role-specific data
    const roleData = await getRoleData(actor.userId, actor.role)

    // Return the data
    return NextResponse.json({ data: roleData })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Error fetching role data:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
