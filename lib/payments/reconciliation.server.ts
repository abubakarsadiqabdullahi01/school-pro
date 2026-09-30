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
    where: { schoolId, isEnabled: true, status: "READY" }, select: { id: true, environment: true, accountMode: true, subaccountCode: true },
  })
  let settlements = 0; let transactions = 0; let issues = 0
  const from = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
  for (const configuration of configurations) {
    const adapter = await adapterForPaymentConfiguration(configuration.id)
    // A platform-managed school is reconciled through the platform's key, which sees every
    // school's settlements and the platform's own. Only a settlement Paystack labels with this
    // school's subaccount is the school's: an unlabelled one is paid to the platform's main
    // account. Filing either under this school raised another school's transactions as its
    // "unmatched" issues, and a settlement is stored against the first school to import it.
    // Filtered here rather than by a query parameter, whose meaning Paystack does not pin down.
    const ownSubaccount = configuration.accountMode === "PLATFORM_MANAGED" ? configuration.subaccountCode : null
    if (configuration.accountMode === "PLATFORM_MANAGED" && !ownSubaccount) continue
    const listed = await adapter.listSettlements(from, new Date())
    const own = ownSubaccount ? listed.filter((settlement) => settlement.subaccountCode === ownSubaccount) : listed
    if (ownSubaccount) await flagMissingSettlements(schoolId, configuration.id, configuration.environment, ownSubaccount, listed.length, own.length, from)
    for (const providerSettlement of own) {
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

/**
 * A platform-managed school whose settlements never show up would otherwise reconcile as
 * "0 settlements, 0 exceptions" for ever, which reads as clean. When Paystack lists
 * settlements but none carries this school's subaccount, while the school has payments old
 * enough to have settled, that is raised as an exception to look at. It clears itself once
 * the school's settlements are found.
 */
async function flagMissingSettlements(
  schoolId: string,
  configurationId: string,
  environment: "TEST" | "LIVE",
  subaccountCode: string,
  listedCount: number,
  ownCount: number,
  from: Date,
) {
  const dedupeKey = `${schoolId}:${environment}:settlements-not-found`
  if (ownCount > 0) {
    await prisma.gatewayReconciliationIssue.updateMany({ where: { dedupeKey, status: { not: "RESOLVED" } }, data: { status: "RESOLVED", resolvedAt: new Date() } })
    return
  }
  const settledBy = new Date(Date.now() - SETTLEMENT_GRACE_DAYS * 24 * 60 * 60 * 1000)
  const due = await prisma.gatewayTransaction.count({
    where: { schoolId, configurationId, status: "SUCCEEDED", paidAt: { gte: from, lte: settledBy } },
  })
  if (listedCount === 0 || due === 0) return
  const message = `Paystack listed ${listedCount} settlement(s) on the platform account and none was labelled with this school's `
    + `subaccount ${subaccountCode}, although ${due} payment(s) should have settled by now. Check the subaccount code, `
    + "and compare the school's settlements in the Paystack dashboard."
  await prisma.gatewayReconciliationIssue.upsert({
    where: { dedupeKey },
    create: { schoolId, dedupeKey, kind: "SETTLEMENTS_NOT_FOUND", severity: "WARNING", message, detail: { subaccountCode, listedCount, due } },
    update: { status: "OPEN", lastSeenAt: new Date(), resolvedAt: null, message },
  })
}

/** Paystack settles most payments the next working day; this allows for weekends. */
const SETTLEMENT_GRACE_DAYS = 4

/** Schools with at least one enabled, verified connection — the ones the daily job visits. */
export async function schoolsToReconcile(): Promise<string[]> {
  const rows = await prisma.schoolPaymentConfiguration.findMany({
    where: { isEnabled: true, status: "READY" }, select: { schoolId: true }, distinct: ["schoolId"],
  })
  return rows.map((row) => row.schoolId)
}
