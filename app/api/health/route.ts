// app/api/health/route.ts
import { NextResponse } from "next/server";
import { validateEnvForProduction } from "@/lib/env-validation";
import { resolveProviders } from "@/lib/notifications/providers";
import { prisma } from "@/lib/db";

/** A queued message older than this has missed several cron runs and is not merely waiting. */
const STALLED_AFTER_MS = 30 * 60 * 1000;

export async function GET() {
  try {
    // The full production contract — the required variables plus the production-only
    // checks (secret length, absolute UPLOAD_DIR, cron secret, gateway key shape).
    validateEnvForProduction();

    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    /**
     * Beyond "is it up".
     *
     * On cPanel this endpoint is the only window into the deployment, and the failures that
     * matter most here are the quiet ones: an application that serves every page correctly
     * while no message leaves the outbox and no missed webhook is ever recovered. Both
     * depend on cron calling in, and neither shows up in a page load.
     *
     * These are reported, not thrown. A school collecting only cash and sending nothing is a
     * legitimate deployment, and a backlog that is thirty seconds old is a cron job about to
     * run rather than a fault. Turning either into "unhealthy" would teach whoever watches
     * this to ignore it.
     */
    const [providers, deadEvents, stalledMessages] = await Promise.all([
      Promise.resolve(resolveProviders()),
      prisma.gatewayEvent.count({ where: { status: "DEAD" } }),
      prisma.notificationOutbox.count({
        where: { status: "QUEUED", availableAt: { lte: new Date(Date.now() - STALLED_AFTER_MS) } },
      }),
    ]);

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      services: {
        database: "ok",
        notifications: {
          // False means messages are being written but nothing real can deliver them.
          providersConfigured: !providers.usingLogFallback,
          // True means the drain is not being called, or is failing every message.
          backlogStalled: stalledMessages > 0,
        },
        payments: {
          // True means at least one confirmed payment could not be posted and has stopped
          // retrying. Somebody has to look at it; nothing else will.
          eventsNeedingAttention: deadEvents > 0,
        },
      },
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
