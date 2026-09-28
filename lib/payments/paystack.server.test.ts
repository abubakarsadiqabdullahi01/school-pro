import { describe, expect, it, vi } from "vitest"

import type { PaystackConnectionConfig } from "./paystack-config.server"
import { PaystackAdapter, PaystackApiError } from "./paystack.server"

const config: PaystackConnectionConfig = {
  secretKey: "sk_test_example-not-a-real-secret",
  publicKey: "pk_test_example-not-a-real-key",
  environment: "test",
  applicationOrigin: "https://schoolpro.digisoft.com.ng",
  webhookUrl: "https://schoolpro.digisoft.com.ng/api/webhooks/paystack/",
  timeoutMs: 1_000,
}

function response(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

function adapterReturning(payload: unknown, status = 200, headers?: HeadersInit) {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    response(payload, status, headers),
  )
  return { adapter: new PaystackAdapter(config, { fetcher: fetcher as unknown as typeof fetch }), fetcher }
}

describe("PaystackAdapter", () => {
  it("initializes a checkout with exact kobo, reference and school split fields", async () => {
    const { adapter, fetcher } = adapterReturning({
      status: true,
      message: "Authorization URL created",
      data: {
        authorization_url: "https://checkout.paystack.com/example",
        access_code: "access-example",
        reference: "school-transaction-1",
      },
    })

    const result = await adapter.initializePayment({
      email: "Parent@Example.com",
      amountKobo: 5_250_000,
      reference: "school-transaction-1",
      callbackUrl: "https://schoolpro.digisoft.com.ng/payments/paystack/callback",
      currency: "NGN",
      channels: ["card", "bank_transfer"],
      subaccountCode: "ACCT_school",
      transactionChargeKobo: 10_000,
      feeBearer: "subaccount",
      metadata: { gatewayTransactionId: "transaction-1" },
    })

    expect(result.reference).toBe("school-transaction-1")
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe("https://api.paystack.co/transaction/initialize")
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${config.secretKey}` })
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({
      email: "parent@example.com",
      amount: "5250000",
      reference: "school-transaction-1",
      subaccount: "ACCT_school",
      transaction_charge: 10_000,
      bearer: "subaccount",
    })
    expect(JSON.parse(body.metadata)).toEqual({ gatewayTransactionId: "transaction-1" })
  })

  it("rejects a callback URL on another origin before making a request", async () => {
    const { adapter, fetcher } = adapterReturning({ status: true, data: {} })

    await expect(
      adapter.initializePayment({
        email: "parent@example.com",
        amountKobo: 10_000,
        reference: "transaction-2",
        callbackUrl: "https://attacker.example/return",
        currency: "NGN",
        channels: ["card"],
      }),
    ).rejects.toThrow("configured application origin")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("rejects an authorization URL outside Paystack checkout", async () => {
    const { adapter } = adapterReturning({
      status: true,
      data: {
        authorization_url: "https://lookalike.example/pay",
        access_code: "access-example",
        reference: "transaction-redirect",
      },
    })
    await expect(adapter.initializePayment({
      email: "parent@example.com",
      amountKobo: 10_000,
      reference: "transaction-redirect",
      callbackUrl: "https://schoolpro.digisoft.com.ng/payments/callback",
      currency: "NGN",
      channels: ["card"],
    })).rejects.toThrow("untrusted checkout URL")
  })

  it("maps requested amount separately from the total amount and drops an unsafe numeric id", async () => {
    const { adapter } = adapterReturning({
      status: true,
      message: "Verification successful",
      data: {
        id: 9_007_199_254_740_992,
        domain: "test",
        status: "success",
        reference: "transaction-3",
        amount: 4_033_300,
        requested_amount: 3_005_000,
        fees: 1_028_300,
        currency: "NGN",
        channel: "bank_transfer",
        paid_at: "2026-09-25T06:00:00.000Z",
        subaccount: { subaccount_code: "ACCT_school" },
      },
    })

    const result = await adapter.verifyPayment("transaction-3")
    expect(result.requestedAmountKobo).toBe(3_005_000)
    expect(result.amountKobo - result.requestedAmountKobo).toBe(result.feesKobo)
    expect(result.providerTransactionId).toBeUndefined()
    expect(result.subaccountCode).toBe("ACCT_school")
  })

  it("treats HTTP 200 with Paystack status false as a failure", async () => {
    const { adapter } = adapterReturning({
      status: false,
      message: "Transaction reference not found",
      code: "transaction_not_found",
    })

    await expect(adapter.verifyPayment("missing-reference")).rejects.toMatchObject({
      name: "PaystackApiError",
      code: "transaction_not_found",
    })
  })

  it("reports rate limiting without leaking request data", async () => {
    const { adapter } = adapterReturning(
      { status: false, message: "Too many requests", code: "rate_limit" },
      429,
      { "retry-after": "30", "x-request-id": "request-1" },
    )

    const error = await adapter.listBanks().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PaystackApiError)
    expect(error).toMatchObject({
      message: "Paystack rate limit reached",
      httpStatus: 429,
      code: "rate_limit",
      requestId: "request-1",
      retryable: true,
    })
    expect((error as PaystackApiError).retryAt).toBeInstanceOf(Date)
    expect(JSON.stringify(error)).not.toContain(config.secretKey)
  })

  it("uses settlement_bank to create and bank_code to update a subaccount", async () => {
    const responses = [
      response({
          status: true,
          message: "Created",
          data: { subaccount_code: "ACCT_school", business_name: "Example School", is_verified: true },
        }),
      response({
          status: true,
          message: "Updated",
          data: { subaccount_code: "ACCT_school", business_name: "Example School", is_verified: true },
        }),
    ]
    let responseIndex = 0
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      const next = responses[responseIndex]
      responseIndex += 1
      if (!next) throw new Error("Unexpected request")
      return next
    })
    const adapter = new PaystackAdapter(config, { fetcher: fetcher as unknown as typeof fetch })

    await adapter.createSubaccount({
      businessName: "Example School",
      settlementBankCode: "058",
      accountNumber: "0123456789",
      percentageCharge: 0,
    })
    await adapter.updateSubaccount("ACCT_school", { settlementBankCode: "044" })

    const createBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
    const updateBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))
    expect(createBody.settlement_bank).toBe("058")
    expect(createBody.bank_code).toBeUndefined()
    expect(updateBody.bank_code).toBe("044")
    expect(updateBody.settlement_bank).toBeUndefined()
  })

  it("creates an exact full refund in kobo without retry metadata", async () => {
    const { adapter, fetcher } = adapterReturning({ status: true, data: {
      id: "1234567890123456789", status: "pending", amount: 5_250_000,
      currency: "NGN", expected_at: "2026-09-30T12:00:00.000Z", transaction: { reference: "DSP-refund-1" },
    } })
    const result = await adapter.createRefund("DSP-refund-1", 5_250_000, "Duplicate parent payment")
    expect(result.providerRefundId).toBe("1234567890123456789")
    expect(result.status).toBe("pending")
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe("https://api.paystack.co/refund")
    expect(JSON.parse(String(init?.body))).toMatchObject({ transaction: "DSP-refund-1", amount: 5_250_000, currency: "NGN" })
  })

  it("preserves 64-bit settlement and transaction ids as strings", async () => {
    const responses = [
      response({ status: true, data: [{ id: "18446744073709551615", status: "success", currency: "NGN", total_amount: 100000, total_fees: 1500, total_processed: 98500, settlement_date: "2026-09-26T00:00:00.000Z" }] }),
      response({ status: true, data: [{ id: "9223372036854775808", reference: "DSP-settlement-1", amount: 100000, fees: 1500 }] }),
    ]
    let index = 0
    const fetcher = vi.fn(async () => responses[index++]!)
    const adapter = new PaystackAdapter(config, { fetcher: fetcher as unknown as typeof fetch })
    const settlements = await adapter.listSettlements()
    const transactions = await adapter.listSettlementTransactions(settlements[0]!.providerSettlementId)
    expect(settlements[0]!.providerSettlementId).toBe("18446744073709551615")
    expect(transactions[0]!.providerTransactionId).toBe("9223372036854775808")
  })
})

describe("PaystackAdapter dedicated accounts", () => {
  it("creates a customer with a normalized email and phone", async () => {
    const { adapter, fetcher } = adapterReturning({ status: true, message: "Customer created", data: { customer_code: "CUS_abc123", email: "student-1@students.example.ng" } })
    const result = await adapter.createCustomer({ email: "Student-1@Students.Example.ng", firstName: "Ada", lastName: "Obi", phone: "08031234567" })
    expect(result).toEqual({ customerCode: "CUS_abc123", email: "student-1@students.example.ng" })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe("https://api.paystack.co/customer")
    expect(JSON.parse(String(init?.body))).toMatchObject({ email: "student-1@students.example.ng", first_name: "Ada", last_name: "Obi", phone: "08031234567" })
  })

  it("creates a dedicated account settling to a subaccount", async () => {
    const { adapter, fetcher } = adapterReturning({ status: true, message: "NUBAN successfully created", data: {
      id: 253, account_name: "KAROKART/ADA OBI", account_number: "9930000737", active: true,
      bank: { name: "Test Bank", slug: "test-bank" }, customer: { customer_code: "CUS_abc123" },
    } })
    const result = await adapter.createDedicatedAccount({ customerCode: "CUS_abc123", preferredBank: "test-bank", subaccountCode: "ACCT_school" })
    expect(result).toEqual({ providerAccountId: "253", accountNumber: "9930000737", accountName: "KAROKART/ADA OBI",
      bankName: "Test Bank", bankSlug: "test-bank", customerCode: "CUS_abc123", active: true })
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ customer: "CUS_abc123", preferred_bank: "test-bank", subaccount: "ACCT_school" })
  })

  it("refuses an account Paystack assigned to a different customer", async () => {
    const { adapter } = adapterReturning({ status: true, message: "ok", data: {
      id: 1, account_name: "X", account_number: "9930000737", bank: { name: "Test Bank" }, customer: { customer_code: "CUS_other" },
    } })
    await expect(adapter.createDedicatedAccount({ customerCode: "CUS_abc123", preferredBank: "test-bank" })).rejects.toThrow(/different customer/)
  })

  it("deactivates by numeric id with DELETE", async () => {
    const { adapter, fetcher } = adapterReturning({ status: true, message: "Managed Account Successfully Unassigned", data: {} })
    await adapter.deactivateDedicatedAccount("253")
    expect(fetcher.mock.calls[0]![0]).toBe("https://api.paystack.co/dedicated_account/253")
    expect(fetcher.mock.calls[0]![1]?.method).toBe("DELETE")
    await expect(adapter.deactivateDedicatedAccount("../customer")).rejects.toThrow()
  })
})

describe("PaystackAdapter splits, identification and transfer refunds", () => {
  it("creates a percentage split where the school's subaccount bears the fee", async () => {
    const { adapter, fetcher } = adapterReturning({ status: true, message: "Split created", data: { id: 4896895, split_code: "SPL_abc123" } })
    expect(await adapter.createSplit({ name: "DigiSchool DVA ABC", subaccountCode: "ACCT_school", subaccountShare: 98 }))
      .toEqual({ splitId: "4896895", splitCode: "SPL_abc123" })
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      name: "DigiSchool DVA ABC", type: "percentage", currency: "NGN",
      subaccounts: [{ subaccount: "ACCT_school", share: 98 }], bearer_type: "subaccount", bearer_subaccount: "ACCT_school",
    })
    await expect(adapter.createSplit({ name: "x y", subaccountCode: "ACCT_school", subaccountShare: 98.5 })).rejects.toThrow(/whole percentage/)
  })

  it("updates a split share and assigns a DVA through the split", async () => {
    const { adapter, fetcher } = adapterReturning({ status: true, message: "ok", data: {} })
    await adapter.updateSplitShare("4896895", "ACCT_school", 97)
    expect(fetcher.mock.calls[0]![0]).toBe("https://api.paystack.co/split/4896895/subaccount/add")
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ subaccount: "ACCT_school", share: 97 })
  })

  it("sends a customer identification without echoing anything back", async () => {
    const { adapter, fetcher } = adapterReturning({ status: true, message: "Customer Identification in progress" })
    await adapter.validateCustomer("CUS_abc123", { firstName: "Ngozi", lastName: "Eze", bvn: "22212345678", bankCode: "058", accountNumber: "0123456789" })
    expect(fetcher.mock.calls[0]![0]).toBe("https://api.paystack.co/customer/CUS_abc123/identification")
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      country: "NG", type: "bank_account", first_name: "Ngozi", last_name: "Eze", bvn: "22212345678", bank_code: "058", account_number: "0123456789",
    })
    await expect(adapter.validateCustomer("CUS_abc123", { firstName: "N", lastName: "E", bvn: "123", bankCode: "058", accountNumber: "0123456789" })).rejects.toThrow(/11 digits/)
  })

  it("retries a needs-attention refund with the payer's account", async () => {
    const { adapter, fetcher } = adapterReturning({ status: true, message: "Refund retried", data: {} })
    await adapter.retryRefundWithCustomerDetails("15581137", "0123456789", "9")
    expect(fetcher.mock.calls[0]![0]).toBe("https://api.paystack.co/refund/retry_with_customer_details/15581137")
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ refund_account_details: { currency: "NGN", account_number: "0123456789", bank_id: "9" } })
  })
})
