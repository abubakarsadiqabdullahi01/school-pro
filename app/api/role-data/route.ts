import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getRoleData } from "@/lib/server-utils"

export async function GET(req: NextRequest) {
  try {
    // Get the user session
    const session = await auth()

    // Check if user is authenticated
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get role-specific data
    const roleData = await getRoleData(session.user.id, session.user.role)

    // Return the data
    return NextResponse.json({ data: roleData })
  } catch (error) {
    console.error("Error fetching role data:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

