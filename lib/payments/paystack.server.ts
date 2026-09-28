import { z } from "zod"

import type {
  CreateDedicatedAccountInput,
  CreateGatewaySplitInput,
  CustomerIdentificationInput,
  GatewaySplit,
  CreateGatewayCustomerInput,
  CreateGatewaySubaccountInput,
  GatewayCustomer,
  GatewayDedicatedAccount,
  GatewayBank,
  GatewaySubaccount,
  GatewayDisputeEvidenceInput,
  GatewayRefund,
  GatewaySettlement,
  GatewaySettlementTransaction,
  InitializeGatewayPaymentInput,
  InitializedGatewayPayment,
  PaymentGatewayAdapter,
  ResolvedBankAccount,
  UpdateGatewaySubaccountInput,
  VerifiedGatewayPayment,
} from "./contracts"
import type { PaystackConnectionConfig } from "./paystack-config.server"

const PAYSTACK_API_ORIGIN = "https://api.paystack.co"
const REFERENCE_PATTERN = /^[A-Za-z0-9.=-]+$/

const envelopeSchema = z.object({
  status: z.boolean(),
  message: z.string().default(""),
  data: z.unknown().optional(),
  type: z.string().optional(),
  code: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
})

const initializedSchema = z.object({
  authorization_url: z.string().url().refine((value) => {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "checkout.paystack.com"
  }, "Paystack returned an untrusted checkout URL"),
  access_code: z.string().min(1),
  reference: z.string().min(1),
})

const verifiedSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    domain: z.enum(["test", "live"]),
    status: z.string().min(1),
    reference: z.string().min(1),
    amount: z.number().int().nonnegative(),
    requested_amount: z.number().int().nonnegative(),
    fees: z.number().int().nonnegative().nullable().optional(),
    currency: z.string().min(3),
    paid_at: z.string().datetime({ offset: true }).nullable().optional(),
    channel: z.string().nullable().optional(),
    subaccount: z
      .object({
        subaccount_code: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    // Paystack returns {} when no split applied, so every field is optional.
    split: z.object({ split_code: z.string().optional() }).passthrough().nullable().optional(),
  })
  .passthrough()

const bankSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1),
  code: z.string().min(1),
  slug: z.string().optional(),
  active: z.boolean().optional(),
})

const resolvedBankSchema = z.object({
  account_number: z.string().min(1),
  account_name: z.string().min(1),
})

const subaccountSchema = z
  .object({
    subaccount_code: z.string().min(1),
    business_name: z.string().min(1),
    is_verified: z.boolean().optional(),
    active: z.boolean().optional(),
    settlement_schedule: z.string().optional(),
  })
  .passthrough()

const refundSchema = z.object({
  id: z.union([z.string(), z.number()]), status: z.string(), amount: z.number().int().nonnegative(),
  currency: z.string().min(3), expected_at: z.string().nullable().optional(),
  transaction: z.object({ reference: z.string().optional() }).passthrough().nullable().optional(),
}).passthrough()

const settlementSchema = z.object({
  id: z.union([z.string(), z.number()]), status: z.string(), currency: z.string().min(3),
  total_amount: z.number().int(), total_fees: z.number().int(), total_processed: z.number().int(),
  settlement_date: z.string().nullable().optional(),
}).passthrough()

const settlementTransactionSchema = z.object({
  id: z.union([z.string(), z.number()]), reference: z.string(), amount: z.number().int().nonnegative(),
  fees: z.number().int().nonnegative().nullable().optional(),
}).passthrough()

type FetchImplementation = typeof fetch
type RequestMethod = "GET" | "POST" | "PUT" | "DELETE"

const splitSchema = z.object({
  id: z.union([z.string(), z.number()]),
  split_code: z.string().regex(/^SPL_[A-Za-z0-9]+$/),
}).passthrough()

const customerSchema = z.object({
  customer_code: z.string().regex(/^CUS_[A-Za-z0-9]+$/),
  email: z.string(),
}).passthrough()

const dedicatedAccountSchema = z.object({
  id: z.union([z.string(), z.number()]),
  account_name: z.string().min(1),
  account_number: z.string().regex(/^\d{10}$/),
  active: z.boolean().optional(),
  bank: z.object({ name: z.string().min(1), slug: z.string().optional() }).passthrough(),
  customer: z.object({ customer_code: z.string().min(1) }).passthrough(),
}).passthrough()

export class PaystackApiError extends Error {
  readonly httpStatus?: number
  readonly code?: string
  readonly errorType?: string
  readonly requestId?: string
  readonly retryAt?: Date
  readonly retryable: boolean

  constructor(
    message: string,
    details: {
      httpStatus?: number
      code?: string
      errorType?: string
      requestId?: string
      retryAt?: Date
      retryable?: boolean
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: details.cause })
    this.name = "PaystackApiError"
    this.httpStatus = details.httpStatus
    this.code = details.code
    this.errorType = details.errorType
    this.requestId = details.requestId
    this.retryAt = details.retryAt
    this.retryable = details.retryable ?? false
  }
}

function requireReference(reference: string): string {
  const value = reference.trim()
  if (!value || value.length > 191 || !REFERENCE_PATTERN.test(value)) {
    throw new Error("Paystack reference may contain only letters, numbers, period, equals, and hyphen")
  }
  return value
}

function requireKobo(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer in kobo`)
  return value
}

function requireShare(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("A split share must be a whole percentage from 1 to 100")
  return value
}

function requirePercentage(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("percentageCharge must be between 0 and 100")
  }
  return value
}

function safeProviderId(value: string | number | undefined): string | undefined {
  if (typeof value === "string" && /^\d+$/.test(value)) return value
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value)
  return undefined
}

function retryAtFromHeaders(headers: Headers): Date | undefined {
  const reset = headers.get("x-ratelimit-reset")
  if (reset && /^\d+$/.test(reset)) {
    const numeric = Number(reset)
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1_000
    const date = new Date(milliseconds)
    if (!Number.isNaN(date.getTime())) return date
  }

  const retryAfter = headers.get("retry-after")
  if (retryAfter && /^\d+$/.test(retryAfter)) return new Date(Date.now() + Number(retryAfter) * 1_000)
  return undefined
}

export class PaystackAdapter implements PaymentGatewayAdapter {
  private readonly fetcher: FetchImplementation

  constructor(
    private readonly config: PaystackConnectionConfig,
    options: { fetcher?: FetchImplementation } = {},
  ) {
    this.fetcher = options.fetcher ?? fetch
  }

  private async requestEnvelope(method: RequestMethod, path: string, body?: Record<string, unknown>): Promise<{ data: unknown; meta?: Record<string, unknown> }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)

    let response: Response
    try {
      response = await this.fetcher(`${PAYSTACK_API_ORIGIN}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.config.secretKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      })
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError"
      throw new PaystackApiError(timedOut ? "Paystack request timed out" : "Paystack is unavailable", {
        cause: error,
        retryable: method === "GET",
      })
    } finally {
      clearTimeout(timeout)
    }

    const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-paystack-request-id") ?? undefined
    let decoded: unknown
    try {
      decoded = JSON.parse(await response.text())
    } catch (error) {
      throw new PaystackApiError("Paystack returned an invalid response", {
        httpStatus: response.status,
        requestId,
        cause: error,
      })
    }

    const envelope = envelopeSchema.safeParse(decoded)
    if (!envelope.success) {
      throw new PaystackApiError("Paystack returned an unexpected response", {
        httpStatus: response.status,
        requestId,
        cause: envelope.error,
      })
    }

    if (!response.ok || !envelope.data.status) {
      throw new PaystackApiError(response.status === 429 ? "Paystack rate limit reached" : "Paystack request failed", {
        httpStatus: response.status,
        requestId,
        code: envelope.data.code,
        errorType: envelope.data.type,
        retryAt: retryAtFromHeaders(response.headers),
        // Read-only lookups are safe for a scheduled retry. Never automatically retry a
        // write: an initialize/create response may have been lost after Paystack accepted it.
        retryable: method === "GET" && [408, 425, 429, 500, 502, 503, 504].includes(response.status),
      })
    }

    return { data: envelope.data.data, meta: envelope.data.meta }
  }

  private async request(method: RequestMethod, path: string, body?: Record<string, unknown>): Promise<unknown> {
    return (await this.requestEnvelope(method, path, body)).data
  }

  async initializePayment(input: InitializeGatewayPaymentInput): Promise<InitializedGatewayPayment> {
    const callback = new URL(input.callbackUrl)
    if (callback.origin !== this.config.applicationOrigin) {
      throw new Error("Payment callback URL must use the configured application origin")
    }
    const amount = requireKobo(input.amountKobo, "amountKobo")
    const transactionCharge = input.transactionChargeKobo
      ? requireKobo(input.transactionChargeKobo, "transactionChargeKobo")
      : undefined

    const data = initializedSchema.parse(
      await this.request("POST", "/transaction/initialize", {
        email: z.string().trim().toLowerCase().email().parse(input.email),
        amount: String(amount),
        reference: requireReference(input.reference),
        callback_url: callback.toString(),
        currency: input.currency,
        channels: input.channels,
        ...(input.subaccountCode ? { subaccount: input.subaccountCode } : {}),
        ...(transactionCharge ? { transaction_charge: transactionCharge } : {}),
        ...(input.feeBearer ? { bearer: input.feeBearer } : {}),
        ...(input.metadata ? { metadata: JSON.stringify(input.metadata) } : {}),
      }),
    )

    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    }
  }

  async verifyPayment(reference: string): Promise<VerifiedGatewayPayment> {
    const expectedReference = requireReference(reference)
    const data = verifiedSchema.parse(
      await this.request("GET", `/transaction/verify/${encodeURIComponent(expectedReference)}`),
    )
    if (data.reference !== expectedReference) throw new PaystackApiError("Paystack returned the wrong reference")

    return {
      providerTransactionId: safeProviderId(data.id),
      reference: data.reference,
      environment: data.domain,
      status: data.status,
      currency: data.currency,
      amountKobo: data.amount,
      requestedAmountKobo: data.requested_amount,
      feesKobo: data.fees ?? 0,
      channel: data.channel ?? undefined,
      subaccountCode: data.subaccount?.subaccount_code,
      splitCode: data.split?.split_code || undefined,
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
    }
  }

  async listBanks(): Promise<GatewayBank[]> {
    const data = z.array(bankSchema).parse(
      await this.request("GET", "/bank?country=nigeria&currency=NGN&enabled_for_verification=true"),
    )
    return data
  }

  async resolveBankAccount(accountNumber: string, bankCode: string): Promise<ResolvedBankAccount> {
    const account = z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit account number").parse(accountNumber)
    const code = z.string().trim().min(1).max(20).parse(bankCode)
    const params = new URLSearchParams({ account_number: account, bank_code: code })
    const data = resolvedBankSchema.parse(await this.request("GET", `/bank/resolve?${params.toString()}`))
    return { accountNumber: data.account_number, accountName: data.account_name, bankCode: code }
  }

  async createSubaccount(input: CreateGatewaySubaccountInput): Promise<GatewaySubaccount> {
    const data = subaccountSchema.parse(
      await this.request("POST", "/subaccount", {
        business_name: z.string().trim().min(2).max(191).parse(input.businessName),
        settlement_bank: z.string().trim().min(1).max(20).parse(input.settlementBankCode),
        account_number: z.string().trim().regex(/^\d{10}$/).parse(input.accountNumber),
        percentage_charge: requirePercentage(input.percentageCharge),
        ...(input.primaryContactEmail ? { primary_contact_email: z.string().email().parse(input.primaryContactEmail) } : {}),
        ...(input.primaryContactName ? { primary_contact_name: input.primaryContactName.trim() } : {}),
        ...(input.primaryContactPhone ? { primary_contact_phone: input.primaryContactPhone.trim() } : {}),
        ...(input.settlementSchedule ? { settlement_schedule: input.settlementSchedule } : {}),
        ...(input.metadata ? { metadata: JSON.stringify(input.metadata) } : {}),
      }),
    )
    return this.mapSubaccount(data)
  }

  async updateSubaccount(
    subaccountCode: string,
    input: UpdateGatewaySubaccountInput,
  ): Promise<GatewaySubaccount> {
    const code = z.string().trim().startsWith("ACCT_").parse(subaccountCode)
    const body: Record<string, unknown> = {}
    if (input.businessName !== undefined) body.business_name = z.string().trim().min(2).max(191).parse(input.businessName)
    // Paystack's update endpoint documents bank_code, while create uses settlement_bank.
    if (input.settlementBankCode !== undefined) body.bank_code = z.string().trim().min(1).max(20).parse(input.settlementBankCode)
    if (input.accountNumber !== undefined) body.account_number = z.string().trim().regex(/^\d{10}$/).parse(input.accountNumber)
    if (input.percentageCharge !== undefined) body.percentage_charge = requirePercentage(input.percentageCharge)
    if (input.primaryContactEmail !== undefined) body.primary_contact_email = z.string().email().parse(input.primaryContactEmail)
    if (input.primaryContactName !== undefined) body.primary_contact_name = input.primaryContactName.trim()
    if (input.primaryContactPhone !== undefined) body.primary_contact_phone = input.primaryContactPhone.trim()
    if (input.settlementSchedule !== undefined) body.settlement_schedule = input.settlementSchedule
    if (input.metadata !== undefined) body.metadata = JSON.stringify(input.metadata)
    if (input.active !== undefined) body.active = input.active
    if (Object.keys(body).length === 0) throw new Error("Provide at least one subaccount field to update")

    const data = subaccountSchema.parse(
      await this.request("PUT", `/subaccount/${encodeURIComponent(code)}`, body),
    )
    return this.mapSubaccount(data)
  }

  private mapSubaccount(data: z.infer<typeof subaccountSchema>): GatewaySubaccount {
    return {
      subaccountCode: data.subaccount_code,
      businessName: data.business_name,
      isVerified: data.is_verified,
      active: data.active,
      settlementSchedule: data.settlement_schedule,
    }
  }

  async createRefund(transaction: string, amountKobo: number, reason: string): Promise<GatewayRefund> {
    const data = refundSchema.parse(await this.request("POST", "/refund", {
      transaction: requireReference(transaction),
      amount: requireKobo(amountKobo, "amountKobo"),
      currency: "NGN",
      merchant_note: z.string().trim().min(5).max(500).parse(reason),
    }))
    return {
      providerRefundId: safeProviderId(data.id) ?? String(data.id), status: data.status,
      amountKobo: data.amount, currency: data.currency,
      transactionReference: data.transaction?.reference,
      expectedAt: data.expected_at ? new Date(data.expected_at) : undefined,
    }
  }

  async submitDisputeEvidence(disputeId: string, input: GatewayDisputeEvidenceInput): Promise<void> {
    const id = z.string().trim().regex(/^\d+$/).parse(disputeId)
    await this.request("POST", `/dispute/${encodeURIComponent(id)}/evidence`, {
      customer_email: z.string().email().parse(input.customerEmail),
      customer_name: z.string().trim().min(2).max(191).parse(input.customerName),
      customer_phone: z.string().trim().min(7).max(30).parse(input.customerPhone),
      service_details: z.string().trim().min(10).max(2000).parse(input.serviceDetails),
      ...(input.deliveryAddress ? { delivery_address: input.deliveryAddress.trim() } : {}),
      ...(input.deliveryDate ? { delivery_date: input.deliveryDate } : {}),
    })
  }

  async resolveDispute(disputeId: string, resolution: "merchant-accepted" | "declined", message: string, refundAmountKobo: number): Promise<void> {
    const id = z.string().trim().regex(/^\d+$/).parse(disputeId)
    await this.request("PUT", `/dispute/${encodeURIComponent(id)}/resolve`, {
      resolution, message: z.string().trim().min(5).max(500).parse(message),
      refund_amount: Number.isSafeInteger(refundAmountKobo) && refundAmountKobo >= 0 ? refundAmountKobo : (() => { throw new Error("refundAmountKobo must be a non-negative integer") })(),
    })
  }

  async listSettlements(from?: Date, to?: Date): Promise<GatewaySettlement[]> {
    const params = new URLSearchParams({ perPage: "100", page: "1" })
    if (from) params.set("from", from.toISOString().slice(0, 10))
    if (to) params.set("to", to.toISOString().slice(0, 10))
    const rows: z.infer<typeof settlementSchema>[] = []
    for (;;) {
      const page = await this.requestEnvelope("GET", `/settlement?${params}`)
      const chunk = z.array(settlementSchema).parse(page.data); rows.push(...chunk)
      const pageNumber = Number(page.meta?.page ?? params.get("page")); const pageCount = Number(page.meta?.pageCount ?? pageNumber)
      if (chunk.length === 0 || !Number.isFinite(pageCount) || pageNumber >= pageCount) break
      params.set("page", String(pageNumber + 1))
    }
    return rows.map((row) => ({
      providerSettlementId: safeProviderId(row.id) ?? String(row.id), status: row.status, currency: row.currency,
      totalAmountKobo: row.total_amount, totalFeesKobo: row.total_fees, totalProcessedKobo: row.total_processed,
      settlementDate: row.settlement_date ? new Date(row.settlement_date) : undefined,
    }))
  }

  async listSettlementTransactions(settlementId: string): Promise<GatewaySettlementTransaction[]> {
    const id = z.string().trim().regex(/^\d+$/).parse(settlementId)
    const rows: z.infer<typeof settlementTransactionSchema>[] = []
    let pageNumber = 1
    for (;;) {
      const page = await this.requestEnvelope("GET", `/settlement/${encodeURIComponent(id)}/transactions?perPage=100&page=${pageNumber}`)
      const chunk = z.array(settlementTransactionSchema).parse(page.data); rows.push(...chunk)
      const pageCount = Number(page.meta?.pageCount ?? pageNumber)
      if (chunk.length === 0 || !Number.isFinite(pageCount) || pageNumber >= pageCount) break
      pageNumber += 1
    }
    return rows.map((row) => ({ providerTransactionId: safeProviderId(row.id) ?? String(row.id), reference: row.reference, amountKobo: row.amount, feesKobo: row.fees ?? 0 }))
  }

  /**
   * Creates (or, for an email Paystack already knows, returns) the customer a dedicated
   * account hangs off. Paystack keys customers by email, which is why each student carries
   * its own synthetic address rather than a parent's.
   */
  async createCustomer(input: CreateGatewayCustomerInput): Promise<GatewayCustomer> {
    const data = customerSchema.parse(
      await this.request("POST", "/customer", {
        email: z.string().trim().toLowerCase().email().parse(input.email),
        first_name: z.string().trim().min(1).max(100).parse(input.firstName),
        last_name: z.string().trim().min(1).max(100).parse(input.lastName),
        phone: z.string().trim().regex(/^\+?\d{10,15}$/, "Enter a valid phone number").parse(input.phone),
        ...(input.metadata ? { metadata: JSON.stringify(input.metadata) } : {}),
      }),
    )
    return { customerCode: data.customer_code, email: data.email }
  }

  async createDedicatedAccount(input: CreateDedicatedAccountInput): Promise<GatewayDedicatedAccount> {
    const data = dedicatedAccountSchema.parse(
      await this.request("POST", "/dedicated_account", {
        customer: z.string().regex(/^CUS_[A-Za-z0-9]+$/).parse(input.customerCode),
        preferred_bank: z.string().trim().regex(/^[a-z0-9-]+$/).parse(input.preferredBank),
        ...(input.splitCode
          ? { split_code: z.string().regex(/^SPL_[A-Za-z0-9]+$/).parse(input.splitCode) }
          : input.subaccountCode ? { subaccount: input.subaccountCode } : {}),
      }),
    )
    if (data.customer.customer_code !== input.customerCode) {
      throw new PaystackApiError("Paystack assigned the account to a different customer")
    }
    return {
      providerAccountId: String(data.id),
      accountNumber: data.account_number,
      accountName: data.account_name,
      bankName: data.bank.name,
      bankSlug: data.bank.slug,
      customerCode: data.customer.customer_code,
      active: data.active ?? true,
    }
  }

  async deactivateDedicatedAccount(providerAccountId: string): Promise<void> {
    const id = z.string().regex(/^\d+$/).parse(providerAccountId)
    await this.request("DELETE", `/dedicated_account/${id}`)
  }

  /**
   * A percentage split whose only subaccount is the school: the school takes its share,
   * DigiSchool's main account keeps the remainder, and the school's subaccount bears
   * Paystack's fee. Without a split, a dedicated account's fee would fall on DigiSchool.
   */
  async createSplit(input: CreateGatewaySplitInput): Promise<GatewaySplit> {
    const share = requireShare(input.subaccountShare)
    const data = splitSchema.parse(
      await this.request("POST", "/split", {
        name: z.string().trim().min(2).max(100).parse(input.name),
        type: "percentage",
        currency: "NGN",
        subaccounts: [{ subaccount: input.subaccountCode, share }],
        bearer_type: "subaccount",
        bearer_subaccount: input.subaccountCode,
      }),
    )
    return { splitId: String(data.id), splitCode: data.split_code }
  }

  async updateSplitShare(splitId: string, subaccountCode: string, share: number): Promise<void> {
    const id = z.string().regex(/^\d+$/).parse(splitId)
    await this.request("POST", `/split/${id}/subaccount/add`, { subaccount: subaccountCode, share: requireShare(share) })
  }

  /** Paystack answers asynchronously with customeridentification.success or .failed. */
  async validateCustomer(customerCode: string, input: CustomerIdentificationInput): Promise<void> {
    const code = z.string().regex(/^CUS_[A-Za-z0-9]+$/).parse(customerCode)
    await this.request("POST", `/customer/${code}/identification`, {
      country: "NG",
      type: "bank_account",
      first_name: z.string().trim().min(1).max(100).parse(input.firstName),
      last_name: z.string().trim().min(1).max(100).parse(input.lastName),
      bvn: z.string().regex(/^\d{11}$/, "A BVN is 11 digits").parse(input.bvn),
      bank_code: z.string().trim().min(1).max(20).parse(input.bankCode),
      account_number: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit account number").parse(input.accountNumber),
    })
  }

  /** For a transfer payment Paystack cannot refund without the payer's bank account. */
  async retryRefundWithCustomerDetails(providerRefundId: string, accountNumber: string, bankId: string): Promise<void> {
    const id = z.string().regex(/^\d+$/).parse(providerRefundId)
    await this.request("POST", `/refund/retry_with_customer_details/${id}`, {
      refund_account_details: {
        currency: "NGN",
        account_number: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit account number").parse(accountNumber),
        bank_id: z.string().regex(/^\d+$/).parse(bankId),
      },
    })
  }
}
