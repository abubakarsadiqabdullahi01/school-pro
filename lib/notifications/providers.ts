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
  send(to: string, subject: string, body: string): Promise<SendOutcome>
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

function readMessageId(body: unknown, ...keys: string[]): string | null {
  if (typeof body !== "object" || body === null) return null
  const record = body as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return null
}

function readError(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback
  const record = body as Record<string, unknown>
  for (const key of ["message", "error", "detail", "description"]) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return fallback
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

  async send(to: string, subject: string, body: string): Promise<SendOutcome> {
    const result = await postJson(
      `${this.baseUrl}/emails`,
      { Authorization: `Bearer ${this.apiKey}` },
      { from: this.from, to: [to], subject, text: body },
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

  const termiiKey = env.TERMII_API_KEY?.trim()
  const termiiSender = env.TERMII_SENDER_ID?.trim()
  const sms: SmsProvider =
    termiiKey && termiiSender ? new TermiiSmsProvider(termiiKey, termiiSender) : log

  const resendKey = env.RESEND_API_KEY?.trim()
  const resendFrom = env.RESEND_FROM?.trim()
  const email: EmailProvider =
    resendKey && resendFrom ? new ResendEmailProvider(resendKey, resendFrom) : log

  return { sms, email, usingLogFallback: sms.name === "log" || email.name === "log" }
}
