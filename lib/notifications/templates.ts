/**
 * The wording of a message, and the values dropped into it.
 *
 * A school words its own reminders, so the body is data rather than code. That makes the
 * renderer a small trust boundary: it is handed a template somebody typed and a bag of
 * values, and it must not be able to leak one learner's details into another's message, or
 * send a body still containing `{{amount}}` because a caller forgot to pass it.
 *
 * Three rules, each of which exists because the alternative is worse:
 *
 *  1. **An unknown placeholder is an error, not an empty string.** Silently rendering
 *     nothing sends "Dear , your child" to four hundred families.
 *  2. **Values are never re-scanned.** A learner legitimately named `{{amount}}` must not
 *     cause a second substitution pass.
 *  3. **Templates declare what they need.** A screen can then refuse to save a template
 *     using a variable its trigger will never supply, rather than finding out at send time.
 */

export type TemplateChannel = "SMS" | "EMAIL"

/** A value a template may reference. Strings only — formatting happens before this. */
export type TemplateValues = Record<string, string>

export type RenderResult =
  | { ok: true; text: string; used: string[] }
  | { ok: false; missing: string[]; unknown: string[] }

/** `{{ name }}` — whitespace tolerated, because people type it. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g

/** Every placeholder a template refers to, in first-seen order, without duplicates. */
export function variablesIn(template: string): string[] {
  const found: string[] = []
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1]
    if (!found.includes(name)) found.push(name)
  }
  return found
}

/**
 * Fills a template.
 *
 * Substitution is done in a single pass over the original string, so a value that happens
 * to contain `{{...}}` is inserted literally and never interpreted — see rule 2.
 */
export function render(
  template: string,
  values: TemplateValues,
  allowed?: readonly string[],
): RenderResult {
  const referenced = variablesIn(template)
  const missing = referenced.filter((name) => values[name] === undefined)
  const unknown = allowed ? referenced.filter((name) => !allowed.includes(name)) : []

  if (missing.length > 0 || unknown.length > 0) return { ok: false, missing, unknown }

  const text = template.replace(PLACEHOLDER, (_match, name: string) => values[name])
  return { ok: true, text, used: referenced }
}

/**
 * What each kind of message is allowed to talk about.
 *
 * Declared per trigger rather than globally: the variables available when results are
 * published are not the ones available when a fee falls due, and a template that mentions
 * `{{amount}}` in a results notice should be rejected when it is written, not silently
 * blanked when four hundred of them go out.
 */
export const TEMPLATE_VARIABLES = {
  "results.published": [
    "studentName",
    "className",
    "termName",
    "sessionName",
    "schoolName",
    "portalLink",
  ],
  "results.annual": [
    "studentName",
    "className",
    "sessionName",
    "decision",
    "schoolName",
    "portalLink",
  ],
  "fees.reminder": [
    "studentName",
    "className",
    "termName",
    "amount",
    "balance",
    "schoolName",
    "portalLink",
  ],
  "payment.received": [
    "studentName",
    "amount",
    "receiptNo",
    "balance",
    "schoolName",
    "portalLink",
    "payerName",
    "admissionNo",
    "className",
    "paidFor",
    "paymentMethod",
    "paymentDate",
    "reference",
  ],
  "payment.refunded": [
    "studentName",
    "admissionNo",
    "amount",
    "receiptNo",
    "reason",
    "balance",
    "schoolName",
    "portalLink",
  ],
  announcement: [
    "title",
    "message",
    "recipientName",
    "schoolName",
    "portalLink",
  ],
} as const

export type TemplateKey = keyof typeof TEMPLATE_VARIABLES

export function variablesFor(key: TemplateKey): readonly string[] {
  return TEMPLATE_VARIABLES[key]
}

export function isTemplateKey(value: string): value is TemplateKey {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_VARIABLES, value)
}

/**
 * The wording a school starts with.
 *
 * Two rules shape every one of these, both from the plan for this module:
 *
 *  - **A result never goes in the message.** A text is not private — it sits on a lock
 *    screen and passes through a provider — and a child's marks are not ours to broadcast.
 *    The message says results are ready and links to the portal, where the reader has to
 *    sign in.
 *  - **SMS stays short.** Every one of these fits a single segment once the values are
 *    filled in, so the default costs a school one message rather than three.
 */
export const DEFAULT_TEMPLATES: Record<
  TemplateKey,
  { sms: string; emailSubject: string; email: string }
> = {
  "results.published": {
    sms: "{{schoolName}}: {{termName}} results for {{studentName}} are ready. Sign in to view: {{portalLink}}",
    emailSubject: "{{schoolName}}: {{termName}} results are ready for {{studentName}}",
    email:
      "Dear Parent/Guardian,\n\n" +
      "{{schoolName}} has released the {{termName}} results for {{studentName}}.\n\n" +
      "RESULT RELEASE\n" +
      "Student:  {{studentName}}\n" +
      "Class:    {{className}}\n" +
      "Term:     {{termName}}, {{sessionName}}\n\n" +
      "Sign in to the parent portal to view and download the report card:\n{{portalLink}}\n\n" +
      "For your child's privacy, scores are never included in emails or text messages.\n\n" +
      "{{schoolName}}",
  },
  "results.annual": {
    sms: "{{schoolName}}: {{sessionName}} annual result for {{studentName}} is ready. Sign in to view: {{portalLink}}",
    emailSubject: "{{schoolName}}: {{sessionName}} annual result for {{studentName}}",
    email:
      "Dear Parent/Guardian,\n\n" +
      "{{schoolName}} has released the {{sessionName}} annual (end-of-session) result for {{studentName}}.\n\n" +
      "ANNUAL RESULT RELEASE\n" +
      "Student:  {{studentName}}\n" +
      "Class:    {{className}}\n" +
      "Session:  {{sessionName}}\n\n" +
      "Sign in to the parent portal to view the annual report card and the end-of-session decision:\n{{portalLink}}\n\n" +
      "For your child's privacy, results are never included in emails or text messages.\n\n" +
      "{{schoolName}}",
  },
  "fees.reminder": {
    sms: "{{schoolName}}: reminder, {{studentName}} has an outstanding fee balance of {{balance}}. Pay or view: {{portalLink}}",
    emailSubject: "{{schoolName}}: fee reminder for {{studentName}}",
    email:
      "Dear Parent/Guardian,\n\n" +
      "This is a friendly reminder from {{schoolName}} about school fees for {{studentName}}.\n\n" +
      "FEE REMINDER\n" +
      "Student:                {{studentName}}\n" +
      "Class:                  {{className}}\n" +
      "Term:                   {{termName}}\n" +
      "This term outstanding:  {{amount}}\n" +
      "Total outstanding:      {{balance}}\n\n" +
      "Sign in to view the full statement or pay online:\n{{portalLink}}\n\n" +
      "If you have paid recently, please ignore this reminder. Payments can take a short while to appear.\n\n" +
      "{{schoolName}}",
  },
  "payment.received": {
    sms: "{{schoolName}}: payment of {{amount}} received for {{studentName}}. Receipt {{receiptNo}}. Balance {{balance}}.",
    emailSubject: "{{schoolName}}: payment received for {{studentName}} (receipt {{receiptNo}})",
    email:
      "Dear {{payerName}},\n\n" +
      "Thank you. {{schoolName}} has received your payment for {{studentName}}.\n\n" +
      "PAYMENT RECEIPT\n" +
      "Receipt number:  {{receiptNo}}\n" +
      "Student:         {{studentName}} ({{admissionNo}})\n" +
      "Class:           {{className}}\n" +
      "Amount paid:     {{amount}}\n" +
      "Paid for:        {{paidFor}}\n" +
      "Payment method:  {{paymentMethod}}\n" +
      "Date:            {{paymentDate}}\n" +
      "Reference:       {{reference}}\n\n" +
      "Outstanding balance for {{studentName}}: {{balance}}\n\n" +
      "Sign in to view or download the official receipt:\n{{portalLink}}\n\n" +
      "Please keep this email for your records.\n\n" +
      "{{schoolName}}",
  },
  "payment.refunded": {
    sms: "{{schoolName}}: {{amount}} on receipt {{receiptNo}} for {{studentName}} has been refunded. Balance {{balance}}.",
    emailSubject: "{{schoolName}}: refund for {{studentName}} (receipt {{receiptNo}})",
    email:
      "Dear Parent/Guardian,\n\n" +
      "{{schoolName}} has refunded a payment for {{studentName}}.\n\n" +
      "REFUND\n" +
      "Student:          {{studentName}} ({{admissionNo}})\n" +
      "Receipt:          {{receiptNo}}\n" +
      "Amount refunded:  {{amount}}\n" +
      "Reason:           {{reason}}\n\n" +
      "Outstanding balance for {{studentName}} is now {{balance}}.\n\n" +
      "Sign in to view the statement:\n{{portalLink}}\n\n" +
      "{{schoolName}}",
  },
  announcement: {
    sms: "{{schoolName}}: {{title}}. {{message}}",
    emailSubject: "{{schoolName}}: {{title}}",
    email:
      "Dear {{recipientName}},\n\n" +
      "{{message}}\n\n" +
      "{{schoolName}}",
  },
}

/**
 * Checks a template a school has typed, before it is saved.
 *
 * Returns every problem at once rather than the first: somebody editing wording wants the
 * whole list, not one round trip per mistake.
 */
export function validateTemplate(
  body: string,
  key: TemplateKey,
  channel: TemplateChannel,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const allowed = variablesFor(key)

  if (body.trim().length === 0) {
    errors.push("The message cannot be empty.")
  }

  const unknown = variablesIn(body).filter((name) => !allowed.includes(name))
  if (unknown.length > 0) {
    errors.push(
      `${unknown.map((name) => `{{${name}}}`).join(", ")} ${unknown.length === 1 ? "is" : "are"} ` +
        `not available here. Use: ${allowed.map((name) => `{{${name}}}`).join(", ")}.`,
    )
  }

  // A hard ceiling rather than a nudge: the provider will reject beyond this anyway, and
  // finding out at send time means a half-delivered batch.
  if (channel === "SMS" && body.length > 800) {
    errors.push("A text message this long will be rejected. Keep it under 800 characters.")
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
