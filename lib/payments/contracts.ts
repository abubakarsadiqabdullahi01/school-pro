export type GatewayEnvironment = "test" | "live"
export type GatewayProvider = "PAYSTACK"
export type GatewayChannel = "card" | "bank_transfer"
export type GatewayFeeBearer = "account" | "subaccount"

export type InitializeGatewayPaymentInput = {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  currency: "NGN"
  channels: GatewayChannel[]
  subaccountCode?: string
  transactionChargeKobo?: number
  feeBearer?: GatewayFeeBearer
  metadata?: Record<string, string | number | boolean | null>
}

export type InitializedGatewayPayment = {
  authorizationUrl: string
  accessCode: string
  reference: string
}

export type VerifiedGatewayPayment = {
  providerTransactionId?: string
  reference: string
  environment: GatewayEnvironment
  status: string
  currency: string
  amountKobo: number
  requestedAmountKobo: number
  feesKobo: number
  channel?: string
  subaccountCode?: string
  /** Present when the transaction settled through a Paystack split. */
  splitCode?: string
  paidAt?: Date
}

export type GatewayBank = {
  /** Paystack's numeric bank id, which the refund-retry endpoint wants instead of the code. */
  id?: number
  name: string
  code: string
  slug?: string
  active?: boolean
}

export type ResolvedBankAccount = {
  accountNumber: string
  accountName: string
  bankCode: string
}

export type CreateGatewaySubaccountInput = {
  businessName: string
  settlementBankCode: string
  accountNumber: string
  percentageCharge: number
  primaryContactEmail?: string
  primaryContactName?: string
  primaryContactPhone?: string
  settlementSchedule?: "auto" | "weekly" | "monthly" | "manual"
  metadata?: Record<string, string | number | boolean | null>
}

export type UpdateGatewaySubaccountInput = Partial<CreateGatewaySubaccountInput> & {
  active?: boolean
}

export type GatewaySubaccount = {
  subaccountCode: string
  businessName: string
  isVerified?: boolean
  active?: boolean
  settlementSchedule?: string
}

export type GatewayRefund = {
  providerRefundId: string
  status: string
  amountKobo: number
  currency: string
  transactionReference?: string
  expectedAt?: Date
}

export type GatewayDisputeEvidenceInput = {
  customerEmail: string
  customerName: string
  customerPhone: string
  serviceDetails: string
  deliveryAddress?: string
  deliveryDate?: string
}

export type GatewaySettlement = {
  providerSettlementId: string
  status: string
  currency: string
  totalAmountKobo: number
  totalFeesKobo: number
  totalProcessedKobo: number
  settlementDate?: Date
}

export type GatewaySettlementTransaction = {
  providerTransactionId: string
  reference: string
  amountKobo: number
  feesKobo: number
}

export type CreateGatewayCustomerInput = {
  email: string
  firstName: string
  lastName: string
  phone: string
  metadata?: Record<string, string | number | boolean | null>
}

export type GatewayCustomer = {
  customerCode: string
  email: string
}

export type CreateDedicatedAccountInput = {
  customerCode: string
  /** Paystack's bank slug, e.g. "wema-bank" or "titan-paystack"; "test-bank" in test mode. */
  preferredBank: string
  /** Settle to a school's subaccount when collecting through the platform account. */
  subaccountCode?: string
  /** Settle through a split instead (takes precedence over subaccountCode). */
  splitCode?: string
}

export type CreateGatewaySplitInput = {
  name: string
  subaccountCode: string
  /** The school's percentage; DigiSchool's main account keeps the rest. */
  subaccountShare: number
}

export type GatewaySplit = { splitId: string; splitCode: string }

export type CustomerIdentificationInput = {
  firstName: string
  lastName: string
  bvn: string
  bankCode: string
  accountNumber: string
}

export type GatewayDedicatedAccount = {
  providerAccountId: string
  accountNumber: string
  accountName: string
  bankName: string
  bankSlug?: string
  customerCode: string
  active: boolean
}

export interface PaymentGatewayAdapter {
  initializePayment(input: InitializeGatewayPaymentInput): Promise<InitializedGatewayPayment>
  verifyPayment(reference: string): Promise<VerifiedGatewayPayment>
  listBanks(): Promise<GatewayBank[]>
  resolveBankAccount(accountNumber: string, bankCode: string): Promise<ResolvedBankAccount>
  createSubaccount(input: CreateGatewaySubaccountInput): Promise<GatewaySubaccount>
  updateSubaccount(subaccountCode: string, input: UpdateGatewaySubaccountInput): Promise<GatewaySubaccount>
  createRefund(transaction: string, amountKobo: number, reason: string): Promise<GatewayRefund>
  submitDisputeEvidence(disputeId: string, input: GatewayDisputeEvidenceInput): Promise<void>
  resolveDispute(disputeId: string, resolution: "merchant-accepted" | "declined", message: string, refundAmountKobo: number): Promise<void>
  listSettlements(from?: Date, to?: Date): Promise<GatewaySettlement[]>
  listSettlementTransactions(settlementId: string): Promise<GatewaySettlementTransaction[]>
  createCustomer(input: CreateGatewayCustomerInput): Promise<GatewayCustomer>
  createDedicatedAccount(input: CreateDedicatedAccountInput): Promise<GatewayDedicatedAccount>
  deactivateDedicatedAccount(providerAccountId: string): Promise<void>
  createSplit(input: CreateGatewaySplitInput): Promise<GatewaySplit>
  updateSplitShare(splitId: string, subaccountCode: string, share: number): Promise<void>
  validateCustomer(customerCode: string, input: CustomerIdentificationInput): Promise<void>
  retryRefundWithCustomerDetails(providerRefundId: string, accountNumber: string, bankId: string): Promise<void>
}
