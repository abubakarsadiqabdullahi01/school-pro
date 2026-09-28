import { prisma } from "@/lib/db"
import { decimalNairaToKobo, koboToDecimalNaira } from "./checkout-rules"
import { adapterForPaymentConfiguration } from "./payment-settings.server"

export type ReconciliationSummary = { settlements: number; transactions: number; issues: number }

/** The audit action that marks a completed reconciliation; the monitor reads the latest one. */
export const RECONCILIATION_AUDIT_ACTION = "payment_gateway.reconciliation_run"

/**
 * Imports the last 31 days of Paystack settlements for one school and raises an exception
 * for every settled transaction the ledger cannot account for. It reports differences only;
 * it never edits a receipt or balance to make the two sides agree.
 *
 * Shared by the finance screen's button and the daily cron so both do exactly the same work.
 */
export async function reconcileSchoolSettlements(schoolId: string): Promise<ReconciliationSummary> {
  const configurations = await prisma.schoolPaymentConfiguration.findMany({
    where: { schoolId, isEnabled: true, status: "READY" }, select: { id: true, environment: true },
  })
  let settlements = 0; let transactions = 0; let issues = 0
  const from = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
  for (const configuration of configurations) {
    const adapter = await adapterForPaymentConfiguration(configuration.id)
    for (const providerSettlement of await adapter.listSettlements(from, new Date())) {
      settlements += 1
      const settlement = await prisma.gatewaySettlement.upsert({
        where: { provider_environment_providerSettlementId: { provider: "PAYSTACK", environment: configuration.environment, providerSettlementId: providerSettlement.providerSettlementId } },
        create: { schoolId, configurationId: configuration.id, environment: configuration.environment,
          providerSettlementId: providerSettlement.providerSettlementId, status: providerSettlement.status,
          currency: providerSettlement.currency, totalAmount: koboToDecimalNaira(providerSettlement.totalAmountKobo),
          totalFees: koboToDecimalNaira(providerSettlement.totalFeesKobo), totalProcessed: koboToDecimalNaira(providerSettlement.totalProcessedKobo),
          settlementDate: providerSettlement.settlementDate },
        update: { status: providerSettlement.status, totalAmount: koboToDecimalNaira(providerSettlement.totalAmountKobo),
          totalFees: koboToDecimalNaira(providerSettlement.totalFeesKobo), totalProcessed: koboToDecimalNaira(providerSettlement.totalProcessedKobo),
          settlementDate: providerSettlement.settlementDate, importedAt: new Date() },
      })
      for (const row of await adapter.listSettlementTransactions(providerSettlement.providerSettlementId)) {
        transactions += 1
        const local = await prisma.gatewayTransaction.findFirst({ where: { schoolId, configurationId: configuration.id,
          OR: [{ reference: row.reference }, { providerTransactionId: row.providerTransactionId }] } })
        const problem = !local ? { kind: "PROVIDER_TRANSACTION_UNMATCHED", severity: "ERROR", text: `Settlement transaction ${row.reference} has no local gateway record` }
          : local.status !== "SUCCEEDED" && local.status !== "REFUNDED" ? { kind: "LEDGER_STATUS_MISMATCH", severity: "ERROR", text: `${row.reference} settled while local status is ${local.status}` }
            : decimalNairaToKobo(local.amountCharged ?? local.amountRequested ?? local.amountExpected) !== row.amountKobo
              ? { kind: "SETTLEMENT_AMOUNT_MISMATCH", severity: "ERROR", text: `${row.reference} provider amount differs from the local confirmed amount` } : null
        if (problem) {
          issues += 1
          const dedupeKey = `${schoolId}:${configuration.environment}:${providerSettlement.providerSettlementId}:${row.providerTransactionId}:${problem.kind}`
          await prisma.gatewayReconciliationIssue.upsert({
            where: { dedupeKey },
            create: { schoolId, settlementId: settlement.id, gatewayTransactionId: local?.id, dedupeKey,
              kind: problem.kind, severity: problem.severity, message: problem.text, detail: { reference: row.reference, providerTransactionId: row.providerTransactionId, amountKobo: row.amountKobo } },
            update: { status: "OPEN", lastSeenAt: new Date(), resolvedAt: null, message: problem.text },
          })
        }
      }
    }
  }
  return { settlements, transactions, issues }
}

/** Schools with at least one enabled, verified connection — the ones the daily job visits. */
export async function schoolsToReconcile(): Promise<string[]> {
  const rows = await prisma.schoolPaymentConfiguration.findMany({
    where: { isEnabled: true, status: "READY" }, select: { schoolId: true }, distinct: ["schoolId"],
  })
  return rows.map((row) => row.schoolId)
}
