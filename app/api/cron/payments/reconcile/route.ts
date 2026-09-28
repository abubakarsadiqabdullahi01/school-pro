import { recordAudit } from "@/lib/audit"
import {
  RECONCILIATION_AUDIT_ACTION,
  reconcileSchoolSettlements,
  schoolsToReconcile,
} from "@/lib/payments/reconciliation.server"
import { verifyBearerSecret } from "@/lib/payments/webhook-security"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * The daily settlement reconciliation, for the hosting scheduler.
 *
 * Same work as the finance screen's "Run reconciliation" button, for every school with an
 * enabled connection. One school failing (a revoked key, a Paystack outage) is reported and
 * the rest still run, so one bad connection cannot hide another school's exceptions.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYMENT_CRON_SECRET ?? ""
  if (!verifyBearerSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const results: Array<{ schoolId: string; ok: boolean; issues?: number; error?: string }> = []
  for (const schoolId of await schoolsToReconcile()) {
    try {
      const summary = await reconcileSchoolSettlements(schoolId)
      await recordAudit({
        actor: { userId: "system:payment-cron", role: "SUPER_ADMIN", name: "Scheduled reconciliation", schoolId, teacherId: null },
        schoolId,
        action: RECONCILIATION_AUDIT_ACTION,
        entityType: "School",
        entityId: schoolId,
        summary: `Scheduled run reconciled ${summary.settlements} settlements and found ${summary.issues} exceptions`,
        after: summary,
      })
      results.push({ schoolId, ok: true, issues: summary.issues })
    } catch (error) {
      console.error("Scheduled payment reconciliation failed", { schoolId, error })
      results.push({ schoolId, ok: false, error: error instanceof Error ? error.message : "Reconciliation failed" })
    }
  }

  const failed = results.filter((result) => !result.ok).length
  return Response.json({ ok: failed === 0, schools: results.length, failed, results }, { status: failed === 0 ? 200 : 207 })
}
