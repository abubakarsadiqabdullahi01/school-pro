/**
 * The school-branded HTML around every email the platform sends.
 *
 * Message bodies stay plain text — that is what a school edits and what the outbox stores —
 * and are laid out here at send time:
 *
 *  - a line on its own that is a web address becomes a button;
 *  - a run of `Label:  value` lines becomes a two-column table, so a receipt reads as one;
 *  - a short line in capitals becomes a section heading;
 *  - everything else is a paragraph.
 *
 * Table-based with inline styles, because that is what renders the same in Gmail, Outlook
 * and a phone's mail app. Everything from the body is HTML-escaped before it is placed.
 */

export type EmailBranding = {
  schoolName: string
  logoUrl?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
}

const ACCENT = "#1e40af"

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;")
}

const URL_LINE = /^https?:\/\/\S+$/
const FIELD_LINE = /^([A-Za-z][A-Za-z0-9 ()/'.-]{1,40}):\s{1,}(.+)$/
const HEADING_LINE = /^[A-Z][A-Z0-9 &'-]{2,40}$/

function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:${ACCENT};text-decoration:underline;word-break:break-all">${url}</a>`)
}

function button(url: string): string {
  const safe = escapeHtml(url)
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 16px"><tr><td style="border-radius:6px;background:${ACCENT}">`
    + `<a href="${safe}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">Open the portal</a>`
    + `</td></tr></table><p style="margin:0 0 16px;font-size:12px;color:#6b7280">Or copy this link: <span style="word-break:break-all">${safe}</span></p>`
}

function fieldTable(rows: Array<[string, string]>): string {
  const cells = rows.map(([label, value], index) =>
    `<tr style="background:${index % 2 === 0 ? "#f9fafb" : "#ffffff"}">`
    + `<td style="padding:8px 12px;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>`
    + `<td style="padding:8px 12px;font-size:14px;color:#111827;font-weight:600">${escapeHtml(value)}</td></tr>`).join("")
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;overflow:hidden;margin:4px 0 18px">${cells}</table>`
}

/** Turns a plain-text body into the inner HTML blocks described above. */
export function bodyToHtml(body: string): string {
  const blocks: string[] = []
  const paragraphs = body.replace(/\r\n/g, "\n").split(/\n{2,}/)
  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim().length > 0)
    let fields: Array<[string, string]> = []
    let text: string[] = []
    const flushText = () => {
      if (text.length) blocks.push(`<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937">${text.map((line) => linkify(escapeHtml(line))).join("<br>")}</p>`)
      text = []
    }
    const flushFields = () => {
      if (fields.length) blocks.push(fieldTable(fields))
      fields = []
    }
    for (const raw of lines) {
      const line = raw.trim()
      if (URL_LINE.test(line)) { flushText(); flushFields(); blocks.push(button(line)); continue }
      if (HEADING_LINE.test(line) && lines.length > 1) {
        flushText(); flushFields()
        blocks.push(`<p style="margin:8px 0 8px;font-size:12px;letter-spacing:.08em;font-weight:700;color:${ACCENT}">${escapeHtml(line)}</p>`)
        continue
      }
      const field = FIELD_LINE.exec(line)
      if (field) { flushText(); fields.push([field[1]!.trim(), field[2]!.trim()]); continue }
      flushFields(); text.push(line)
    }
    flushText(); flushFields()
  }
  return blocks.join("\n")
}

export function renderEmailHtml(branding: EmailBranding, subject: string, body: string): string {
  const name = escapeHtml(branding.schoolName)
  const logo = branding.logoUrl && /^https:\/\//.test(branding.logoUrl)
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${name}" width="48" height="48" style="display:block;border:0;border-radius:8px;margin:0 auto 10px">`
    : ""
  const contact = [branding.address, branding.phone, branding.email].filter(Boolean).map((part) => escapeHtml(String(part))).join(" · ")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${escapeHtml(subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">`
    + `<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(subject)}</span>`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">`
    + `<tr><td align="center" style="background:${ACCENT};padding:24px 20px">${logo}<p style="margin:0;font-size:20px;font-weight:700;color:#ffffff">${name}</p></td></tr>`
    + `<tr><td style="padding:28px 24px 8px">${bodyToHtml(body)}</td></tr>`
    + `<tr><td style="padding:16px 24px 24px;border-top:1px solid #e5e7eb"><p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;text-align:center">${name}${contact ? `<br>${contact}` : ""}<br>Sent through DigiSchool-Pro. Please do not reply to this automated message.</p></td></tr>`
    + `</table></td></tr></table></body></html>`
}
