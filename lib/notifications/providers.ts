/**
 * The seam between this application and whoever actually carries a message.
 *
 * Deliberately a small interface rather than a vendor's SDK. Nigerian SMS providers get
 * acquired, change pricing, and lose DND routes; a school that has to change provider
 * should be changing one adapter, not unpicking the send path. The same reasoning applies
 * to email.
 *
 * Every adapter here speaks plain HTTP through `fetch`, which is why this whole feature
 * adds no dependency to the project.
 *
 * The one thing an adapter must get right is `retryable`. A provider that is momentarily
 * down deserves another attempt; a number that is not a real phone number does not, and
 * retrying it three times turns one wasted message into three.
 */

export type SendOutcome =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean }

export interface SmsProvider {
  readonly name: string
  send(to: string, body: string): Promise<SendOutcome>
}

export interface EmailProvider {
  readonly name: string
  /** `html` is the finished, school-branded document; `body` stays the plain-text alternative. */
  send(to: string, subject: string, body: string, html?: string): Promise<SendOutcome>
  getStatus?(providerMessageId: string): Promise<{ ok: true; status: string } | { ok: false; error: string; retryable: boolean }>
}

/** Network trouble is worth another go; a refusal on content is not. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

async function postJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  timeoutMs = 15_000,
): Promise<{ status: number; body: unknown } | { networkError: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      // A provider that never answers must not hold a worker batch open indefinitely.
      signal: AbortSignal.timeout(timeoutMs),
    })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    return { status: response.status, body }
  } catch (error) {
    return { networkError: error instanceof Error ? error.message : "Request failed" }
  }
}

async function postForm(
  url: string,
  payload: Record<string, string>,
  encoding: "multipart" | "urlencoded",
  timeoutMs = 15_000,
): Promise<{ status: number; body: unknown } | { networkError: string }> {
  try {
    const body = encoding === "multipart"
      ? Object.entries(payload).reduce((form, [key, value]) => { form.append(key, value); return form }, new FormData())
      : new URLSearchParams(payload)
    const response = await fetch(url, {
      method: "POST",
      headers: encoding === "urlencoded" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    })
    let decoded: unknown = null
    try { decoded = await response.json() } catch { decoded = null }
    return { status: response.status, body: decoded }
  } catch (error) {
    return { networkError: error instanceof Error ? error.message : "Request failed" }
  }
}

function readMessageId(body: unknown, ...keys: string[]): string | null {
  if (typeof body !== "object" || body === null) return null
  const record = body as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return null
}

function readNestedMessageId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  const data = (body as Record<string, unknown>).data
  if (typeof data !== "object" || data === null) return null
  const value = (data as Record<string, unknown>).message_id
  return typeof value === "string" || typeof value === "number" ? String(value) : null
}

function readError(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback
  const record = body as Record<string, unknown>
  // SmartSMS SMS puts its reason in `comment`, even on an HTTP 200 refusal.
  for (const key of ["message", "error", "detail", "description", "comment"]) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(" ")
  }
  return fallback
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;")
}

export class SmartSmsSolutionsSmsProvider implements SmsProvider {
  readonly name = "smartsms-sms"

  constructor(
    private readonly apiToken: string,
    private readonly senderId: string,
    private readonly routing = "3",
    private readonly endpoint = "https://app.smartsmssolutions.com/io/api/client/v1/sms/",
  ) {}

  async send(to: string, body: string): Promise<SendOutcome> {
    const reference = `dsp-${crypto.randomUUID().replaceAll("-", "")}`
    const result = await postForm(this.endpoint, {
      token: this.apiToken, sender: this.senderId, to: to.replace(/^\+/, ""), message: body,
      type: "0", routing: this.routing, ref_id: reference, dlr_timeout: "48",
    }, "multipart")
    if ("networkError" in result) return { ok: false, error: result.networkError, retryable: true }
    const record = typeof result.body === "object" && result.body !== null ? result.body as Record<string, unknown> : null
    if (result.status >= 200 && result.status < 300 && Number(record?.code) === 1000) {
      // A completed request can still leave this number out: SmartSMS lists it under the
      // reason instead of `successful`. That is a failed message, not a sent one.
      const listed = (key: string) => typeof record?.[key] === "string" && (record[key] as string).length > 0
      if (!listed("successful")) {
        const reason = listed("insufficient_unit") ? "Insufficient SMS units in the SmartSMS wallet"
          : listed("invalid") ? "SmartSMS rejected the phone number as invalid"
            : listed("flooding") ? "SmartSMS held the message as flooding (too many to this number)"
              : listed("failed") ? "SmartSMS could not deliver to this number"
                : readError(result.body, "SmartSMS did not accept this number")
        return { ok: false, error: reason, retryable: false }
      }
      return { ok: true, providerMessageId: readMessageId(result.body, "message_id", "ref_id") }
    }
    const code = record?.code === undefined ? "" : ` (code ${String(record.code)})`
    return { ok: false, error: `${readError(result.body, `SmartSMS SMS returned ${result.status}`)}${code}`, retryable: RETRYABLE_STATUS.has(result.status) }
  }
}

export class SmartSmsSolutionsEmailProvider implements EmailProvider {
  readonly name = "smartsms-email"

  constructor(
    private readonly apiToken: string,
    private readonly endpoint = "https://app.smartsmssolutions.com/io/api/client/v1/email/send/",
  ) {}

  async send(to: string, subject: string, body: string, branded?: string): Promise<SendOutcome> {
    const html = branded ?? `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(body)}</div>`
    const result = await postForm(this.endpoint, {
      token: this.apiToken, to_email: to, message_type: "transactional", subject, html,
    }, "urlencoded")
    if ("networkError" in result) return { ok: false, error: result.networkError, retryable: true }
    const record = typeof result.body === "object" && result.body !== null ? result.body as Record<string, unknown> : null
    if (result.status >= 200 && result.status < 300 && record?.status === "success") {
      return { ok: true, providerMessageId: readNestedMessageId(result.body) }
    }
    return { ok: false, error: readError(result.body, `SmartSMS Email returned ${result.status}`), retryable: RETRYABLE_STATUS.has(result.status) }
  }

  async getStatus(providerMessageId: string): Promise<{ ok: true; status: string } | { ok: false; error: string; retryable: boolean }> {
    if (!/^\d+$/.test(providerMessageId)) return { ok: false, error: "Invalid SmartSMS email message id", retryable: false }
    const endpoint = this.endpoint.replace(/send\/$/, "message/status/")
    const result = await postForm(endpoint, { token: this.apiToken, message_id: providerMessageId }, "urlencoded")
    if ("networkError" in result) return { ok: false, error: result.networkError, retryable: true }
    const record = typeof result.body === "object" && result.body !== null ? result.body as Record<string, unknown> : null
    const data = record?.data
    const status = typeof data === "object" && data !== null ? (data as Record<string, unknown>).status : null
    if (result.status >= 200 && result.status < 300 && record?.status === "success" && typeof status === "string") return { ok: true, status }
    return { ok: false, error: readError(result.body, `SmartSMS Email status returned ${result.status}`), retryable: RETRYABLE_STATUS.has(result.status) }
  }
}

/**
 * Writes the message to the log instead of sending it.
 *
 * The default when nothing is configured, and the reason the whole feature is usable before
 * a school has a provider account: results publication queues messages, the worker drains
 * them, and the outbox shows exactly what would have gone to whom. Sender ID registration
 * and DND approval take weeks, and none of the rest of this should wait on them.
 *
 * It never reports failure, because a failure here would be a lie about the provider.
 */
export class LogProvider implements SmsProvider, EmailProvider {
  readonly name = "log"

  async send(to: string, bodyOrSubject: string, maybeBody?: string): Promise<SendOutcome> {
    const body = maybeBody ?? bodyOrSubject
    const subject = maybeBody === undefined ? null : bodyOrSubject
    console.info(
      `[notifications:log] to=${to}${subject ? ` subject=${JSON.stringify(subject)}` : ""} ` +
        `body=${JSON.stringify(body)}`,
    )
    return { ok: true, providerMessageId: null }
  }
}

/**
 * Termii, the provider the plan for this module recommends.
 *
 * Two Nigerian specifics are worth knowing and are not obvious from the API:
 *
 *  - **`channel: "dnd"`** is what reaches subscribers on the Do Not Disturb list, which is
 *    most of them. On the ordinary route those messages are accepted, charged for, and
 *    never delivered - no error, no bounce.
 *  - **The sender ID must be registered** with the networks first. An unregistered
 *    alphanumeric sender is rejected or silently dropped.
 */
export class TermiiSmsProvider implements SmsProvider {
  readonly name = "termii"

  constructor(
    private readonly apiKey: string,
    private readonly senderId: string,
    private readonly baseUrl = "https://api.ng.termii.com",
  ) {}

  async send(to: string, body: string): Promise<SendOutcome> {
    const result = await postJson(`${this.baseUrl}/api/sms/send`, {}, {
      to,
      from: this.senderId,
      sms: body,
      type: "plain",
      // See the note above: this is the route that actually arrives.
      channel: "dnd",
      api_key: this.apiKey,
    })

    if ("networkError" in result) {
      return { ok: false, error: result.networkError, retryable: true }
    }
    if (result.status >= 200 && result.status < 300) {
      return { ok: true, providerMessageId: readMessageId(result.body, "message_id", "messageId") }
    }
    return {
      ok: false,
      error: readError(result.body, `Termii returned ${result.status}`),
      retryable: RETRYABLE_STATUS.has(result.status),
    }
  }
}

/**
 * Resend, over its HTTP API.
 *
 * Chosen over SMTP because it needs no dependency and no long-lived connection, which
 * matters on cPanel where the worker is a short cron process. A school that would rather
 * use its own SMTP server needs a different adapter and a mail library; that is a decision
 * with a dependency attached, so it is not taken here.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend"

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly baseUrl = "https://api.resend.com",
  ) {}

  async send(to: string, subject: string, body: string, html?: string): Promise<SendOutcome> {
    const result = await postJson(
      `${this.baseUrl}/emails`,
      { Authorization: `Bearer ${this.apiKey}` },
      { from: this.from, to: [to], subject, text: body, ...(html ? { html } : {}) },
    )

    if ("networkError" in result) {
      return { ok: false, error: result.networkError, retryable: true }
    }
    if (result.status >= 200 && result.status < 300) {
      return { ok: true, providerMessageId: readMessageId(result.body, "id") }
    }
    return {
      ok: false,
      error: readError(result.body, `Resend returned ${result.status}`),
      retryable: RETRYABLE_STATUS.has(result.status),
    }
  }
}

/**
 * Which adapters this deployment has.
 *
 * Credentials come from the environment, never from the database: an API key in a table is
 * an API key in every backup and every database export. A school configures its *sender
 * ID* and its wording through the application; the key stays with the deployment.
 */
export function resolveProviders(env: NodeJS.ProcessEnv = process.env): {
  sms: SmsProvider
  email: EmailProvider
  /** True when either channel is only pretending, so screens can say so plainly. */
  usingLogFallback: boolean
} {
  const log = new LogProvider()

  const smartSmsToken = env.SMARTSMS_API_TOKEN?.trim()
  const smartSmsSender = env.SMARTSMS_SENDER_ID?.trim()
  const smartSmsRouting = env.SMARTSMS_SMS_ROUTING?.trim() || "3"
  const termiiKey = env.TERMII_API_KEY?.trim()
  const termiiSender = env.TERMII_SENDER_ID?.trim()
  const sms: SmsProvider =
    smartSmsToken && smartSmsSender
      ? new SmartSmsSolutionsSmsProvider(smartSmsToken, smartSmsSender, smartSmsRouting)
      : termiiKey && termiiSender ? new TermiiSmsProvider(termiiKey, termiiSender) : log

  const resendKey = env.RESEND_API_KEY?.trim()
  const resendFrom = env.RESEND_FROM?.trim()
  const email: EmailProvider = smartSmsToken
    ? new SmartSmsSolutionsEmailProvider(smartSmsToken)
    : resendKey && resendFrom ? new ResendEmailProvider(resendKey, resendFrom) : log

  return { sms, email, usingLogFallback: sms.name === "log" || email.name === "log" }
}
