import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ success: false, error: "Invalid resource" }, { status: 404 });
}
