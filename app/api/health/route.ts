// app/api/health/route.ts
import { NextResponse } from "next/server";
import { validateEnv } from "@/lib/env-validation";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // Validate environment
    validateEnv();
    
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error.message,
    }, { status: 500 });
  }
}