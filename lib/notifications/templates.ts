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
    emailSubject: "{{termName}} results are ready for {{studentName}}",
    email:
      "Dear Parent/Guardian,\n\n" +
      "{{termName}} results for {{studentName}} ({{className}}) have been released.\n\n" +
      "Sign in to the portal to view and download the report card:\n{{portalLink}}\n\n" +
      "Results are not included in this email for privacy.\n\n" +
      "{{schoolName}}",
  },
  "results.annual": {
    sms: "{{schoolName}}: {{sessionName}} annual result for {{studentName}} is ready. Sign in to view: {{portalLink}}",
    emailSubject: "{{sessionName}} annual result for {{studentName}}",
    email:
      "Dear Parent/Guardian,\n\n" +
      "The {{sessionName}} annual result for {{studentName}} ({{className}}) has been released.\n\n" +
      "Sign in to the portal to view the report card and the end-of-session decision:\n{{portalLink}}\n\n" +
      "{{schoolName}}",
  },
  "fees.reminder": {
    sms: "{{schoolName}}: {{termName}} fees for {{studentName}} show a balance of {{balance}}. Details: {{portalLink}}",
    emailSubject: "{{termName}} fees for {{studentName}}",
    email:
      "Dear Parent/Guardian,\n\n" +
      "{{termName}} fees for {{studentName}} ({{className}}) show an outstanding balance of {{balance}}.\n\n" +
      "You can see the full statement here:\n{{portalLink}}\n\n" +
      "If you have already paid, please ignore this message.\n\n" +
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
