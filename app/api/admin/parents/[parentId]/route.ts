import { NextResponse, type NextRequest } from "next/server";
import { getParentDetails } from "@/app/actions/parent-management";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ parentId: string }> },
) {
  const { parentId } = await context.params;

  if (!parentId) {
    return NextResponse.json(
      { success: false, error: "Parent ID is required" },
      { status: 400 },
    );
  }

  const result = await getParentDetails(parentId);
  return NextResponse.json(result, { status: result.success ? 200 : 404 });
}
