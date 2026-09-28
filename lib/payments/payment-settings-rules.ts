export type GatewayActivationInput = {
  environment: "TEST" | "LIVE"
  accountMode: "PLATFORM_MANAGED" | "SCHOOL_OWNED"
  status: "DRAFT" | "PENDING_VERIFICATION" | "READY" | "SUSPENDED" | "DISABLED"
  verifiedAt: Date | null
  subaccountCode: string | null
  hasCredential: boolean
  allowedChannels: string[]
  testConfigurationReady: boolean
  /** Slice 8: the platform owner has approved this school for live money. */
  liveApproved: boolean
}

const SUPPORTED_CHANNELS = new Set(["card", "bank_transfer"])

export function gatewayActivationProblems(input: GatewayActivationInput): string[] {
  const problems: string[] = []

  if (input.status !== "READY" || !input.verifiedAt) {
    problems.push("Verify the Paystack connection before enabling online payments")
  }
  if (input.accountMode === "PLATFORM_MANAGED" && !input.subaccountCode) {
    problems.push("The school settlement subaccount is missing")
  }
  if (input.accountMode === "SCHOOL_OWNED" && !input.hasCredential) {
    problems.push("The school's Paystack credentials are missing")
  }
  if (!input.allowedChannels.some((channel) => SUPPORTED_CHANNELS.has(channel))) {
    problems.push("Choose at least one supported payment channel")
  }
  if (input.environment === "LIVE" && !input.testConfigurationReady) {
    problems.push("Verify the test connection before enabling live payments")
  }
  if (input.environment === "LIVE" && !input.liveApproved) {
    problems.push("DigiSchool has not yet approved this school for live payments")
  }

  return problems
}
