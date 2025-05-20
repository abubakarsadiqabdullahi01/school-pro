import { NextResponse } from "next/server";
import { getParentDetails } from "@/app/actions/parent-management";

export async function GET(request: Request, { params }: { params: { path: string[] } }) {
  const [parentId] = params.path;

  if (parentId) {
    const result = await getParentDetails(parentId);
    return NextResponse.json(result);
  }

  return NextResponse.json({ success: false, error: "Invalid resource" }, { status: 404 });
}