import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveProviders, SmartSmsSolutionsEmailProvider, SmartSmsSolutionsSmsProvider } from "./providers"

afterEach(() => vi.unstubAllGlobals())

describe("SmartSMSSolutions providers", () => {
  it("submits SMS using the documented form fields and normalizes E.164", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => new Response(JSON.stringify({ code: 1000, successful: "2348012345678", message_id: "msg-1", comment: "Completed Successfully" }), { status: 200, headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetcher)
    const outcome = await new SmartSmsSolutionsSmsProvider("secret-token", "DigiSchool", "3").send("+2348012345678", "Fees received")
    expect(outcome).toEqual({ ok: true, providerMessageId: "msg-1" })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toContain("/io/api/client/v1/sms/")
    const form = init.body as FormData
    expect(Object.fromEntries(form.entries())).toMatchObject({ token: "secret-token", sender: "DigiSchool", to: "2348012345678", message: "Fees received", type: "0", routing: "3" })
  })

  it("reports SmartSMS's own reason when an SMS is refused with HTTP 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 1004, comment: "Insufficient balance" }), { status: 200, headers: { "Content-Type": "application/json" } })))
    await expect(new SmartSmsSolutionsSmsProvider("t", "Digisoft").send("2348012345678", "Hi"))
      .resolves.toEqual({ ok: false, error: "Insufficient balance (code 1004)", retryable: false })
  })

  it("treats a completed request that left the number out as a failed message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 1000, successful: "", insufficient_unit: "2348012345678", comment: "Completed Successfully" }), { status: 200, headers: { "Content-Type": "application/json" } })))
    await expect(new SmartSmsSolutionsSmsProvider("t", "Digisoft").send("2348012345678", "Hi"))
      .resolves.toEqual({ ok: false, error: "Insufficient SMS units in the SmartSMS wallet", retryable: false })
  })

  it("sends transactional email and HTML-escapes the plain outbox body", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ status: "success", data: { message_id: 5842 } }), { status: 200, headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetcher)
    const outcome = await new SmartSmsSolutionsEmailProvider("secret-token").send("parent@example.com", "Result ready", "Open <portal> & view")
    expect(outcome).toEqual({ ok: true, providerMessageId: "5842" })
    const params = fetcher.mock.calls[0]![1]!.body as URLSearchParams
    expect(params.get("message_type")).toBe("transactional")
    expect(params.get("html")).toContain("Open &lt;portal&gt; &amp; view")
  })

  it("treats HTTP 200 provider errors as non-retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "error", message: ["Email address is suppressed."] }), { status: 200, headers: { "Content-Type": "application/json" } })))
    await expect(new SmartSmsSolutionsEmailProvider("secret-token").send("parent@example.com", "Notice", "Body"))
      .resolves.toEqual({ ok: false, error: "Email address is suppressed.", retryable: false })
  })

  it("reconciles email delivery through the documented status endpoint", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ status: "success", data: { message_id: 5842, status: "delivered" } }), { status: 200, headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetcher)
    const outcome = await new SmartSmsSolutionsEmailProvider("secret-token").getStatus("5842")
    expect(outcome).toEqual({ ok: true, status: "delivered" })
    expect(fetcher.mock.calls[0]![0]).toContain("/email/message/status/")
    expect((fetcher.mock.calls[0]![1].body as URLSearchParams).get("message_id")).toBe("5842")
  })

  it("selects SmartSMS for both channels only when SMS has a sender identity", () => {
    const both = resolveProviders({ NODE_ENV: "test", SMARTSMS_API_TOKEN: "token", SMARTSMS_SENDER_ID: "DigiSchool" })
    expect(both.sms.name).toBe("smartsms-sms"); expect(both.email.name).toBe("smartsms-email"); expect(both.usingLogFallback).toBe(false)
    const emailOnly = resolveProviders({ NODE_ENV: "test", SMARTSMS_API_TOKEN: "token" })
    expect(emailOnly.sms.name).toBe("log"); expect(emailOnly.email.name).toBe("smartsms-email")
  })
})
