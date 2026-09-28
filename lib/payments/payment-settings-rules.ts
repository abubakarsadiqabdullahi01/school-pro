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
  /**
   * A different provider already collecting for this school in this environment, if any.
   *
   * A school may hold a configuration for every gateway it has ever set up, but only one
   * may take money at a time. Two live at once and nothing decides which a checkout uses —
   * and a transaction must stay with the provider that created it, because that is the only
   * one that can verify, refund or defend it later.
   */
  otherEnabledProvider?: string | null
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
  if (input.otherEnabledProvider) {
    // Refused rather than silently switched: turning off whichever gateway is currently
    // collecting, on the way to turning on another, would cut off payments mid-term
    // without anyone deciding to.
    problems.push(
      `${input.otherEnabledProvider} is already collecting ${input.environment.toLowerCase()} `
      + "payments for this school. Turn it off before enabling another gateway.",
    )
  }

  return problems
}
