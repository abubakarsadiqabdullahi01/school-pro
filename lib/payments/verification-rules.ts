import type { VerifiedGatewayPayment } from "./contracts"

export type LocalGatewayVerification = {
  reference: string
  environment: "TEST" | "LIVE"
  requestedAmountKobo: number
  expectedSchoolFeesKobo: number
  allocationTotalKobo: number
  accountMode: "PLATFORM_MANAGED" | "SCHOOL_OWNED"
  expectedSubaccountCode: string | null
  feePolicy: "SCHOOL_PAYS" | "PLATFORM_PAYS" | "PARENT_PAYS_GROSS_UP"
  disclosedProcessingFeeKobo: number
}

export function gatewayVerificationIdentityProblems(
  local: Pick<LocalGatewayVerification, "reference" | "environment">,
  verified: Pick<VerifiedGatewayPayment, "reference" | "environment" | "currency">,
): string[] {
  const problems: string[] = []
  if (verified.reference !== local.reference) problems.push("Provider reference does not match")
  if (verified.environment !== local.environment.toLowerCase()) problems.push("Provider environment does not match")
  if (verified.currency !== "NGN") problems.push("Provider currency does not match")
  return problems
}

export function gatewayVerificationProblems(
  local: LocalGatewayVerification,
  verified: VerifiedGatewayPayment,
): string[] {
  const problems = gatewayVerificationIdentityProblems(local, verified)
  if (verified.status !== "success") problems.push("Provider status is not successful")
  if (verified.requestedAmountKobo !== local.requestedAmountKobo) problems.push("Requested amount does not match")
  if (verified.amountKobo !== local.requestedAmountKobo) problems.push("Charged amount differs from the disclosed checkout total")
  if (local.allocationTotalKobo !== local.expectedSchoolFeesKobo) problems.push("Allocation total does not match school fees")
  if (local.accountMode === "PLATFORM_MANAGED" && verified.subaccountCode !== local.expectedSubaccountCode) {
    problems.push("Settlement subaccount does not match")
  }
  if (local.feePolicy === "PARENT_PAYS_GROSS_UP"
    && verified.feesKobo !== local.disclosedProcessingFeeKobo) {
    problems.push("Provider fee differs from the disclosed processing fee")
  }
  return problems
}
