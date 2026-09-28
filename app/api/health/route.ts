// app/api/health/route.ts
import { NextResponse } from "next/server";
import { validateEnvForProduction } from "@/lib/env-validation";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // The full production contract — the three required variables plus the
    // production-only checks (secret length, absolute UPLOAD_DIR).
    validateEnvForProduction();
    
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    });
  } catch (error: unknown) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "A required service is unavailable",
    }, { status: 500 });
  }
}
