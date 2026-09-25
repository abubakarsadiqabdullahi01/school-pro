import { describe, expect, it } from "vitest"
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_VARIABLES,
  isTemplateKey,
  render,
  validateTemplate,
  variablesFor,
  variablesIn,
  type TemplateKey,
} from "@/lib/notifications/templates"
import { measureSms } from "@/lib/notifications/sms-segments"

/**
 * Rendering the wording a school typed.
 *
 * This is a small trust boundary: a template somebody entered, filled with values about a
 * particular child, sent to a particular family. The failures worth guarding are the ones
 * that would be invisible until four hundred messages had gone out.
 */

describe("variablesIn", () => {
  it("finds placeholders and tolerates the spacing people type", () => {
    expect(variablesIn("Hi {{name}}, {{ term }} is {{state}}")).toEqual(["name", "term", "state"])
  })

  it("reports each one once", () => {
    expect(variablesIn("{{a}} and {{a}} again")).toEqual(["a"])
  })

  it("finds none in a plain message", () => {
    expect(variablesIn("Fees are due on Friday.")).toEqual([])
  })
})

describe("render", () => {
  it("fills every placeholder", () => {
    const result = render("Hi {{name}}, {{term}} results are out.", {
      name: "Ada",
      term: "First Term",
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toBe("Hi Ada, First Term results are out.")
  })

  it("refuses a missing value rather than rendering a blank", () => {
    // "Dear , your child" is what silently substituting nothing produces, four hundred
    // times over.
    const result = render("Dear {{name}}, {{term}}", { name: "Ada" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.missing).toEqual(["term"])
  })

  it("does not re-scan what it substituted", () => {
    // A value that happens to contain a placeholder must be inserted literally. Otherwise
    // one learner's details could be made to pull in another value entirely.
    const result = render("Hello {{name}}", { name: "{{secret}}", secret: "leaked" })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toBe("Hello {{secret}}")
  })

  it("rejects a variable the trigger will never supply", () => {
    const result = render("Owing {{amount}}", { amount: "5000" }, ["studentName"])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.unknown).toEqual(["amount"])
  })

  it("accepts an empty string as a real value", () => {
    // Different from absent: a school may deliberately render nothing there.
    const result = render("Hi {{name}}.", { name: "" })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toBe("Hi .")
  })
})

describe("validateTemplate", () => {
  it("accepts wording that only uses what the trigger offers", () => {
    const body = "{{schoolName}}: results for {{studentName}} are ready. {{portalLink}}"
    expect(validateTemplate(body, "results.published", "SMS")).toEqual({ ok: true })
  })

  it("names every problem at once rather than one per round trip", () => {
    const result = validateTemplate("{{amount}} {{nonsense}}", "results.published", "SMS")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("{{amount}}")
      expect(result.errors.join(" ")).toContain("{{nonsense}}")
    }
  })

  it("refuses an empty message", () => {
    expect(validateTemplate("   ", "results.published", "SMS").ok).toBe(false)
  })

  it("refuses a text the provider would reject outright", () => {
    const result = validateTemplate("a".repeat(801), "results.published", "SMS")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain("under 800")
  })

  it("does not apply the SMS length limit to an email", () => {
    expect(validateTemplate("a".repeat(2000), "results.published", "EMAIL").ok).toBe(true)
  })

  it("tells the author what they may use", () => {
    const result = validateTemplate("{{wrong}}", "fees.reminder", "SMS")
    if (!result.ok) expect(result.errors.join(" ")).toContain("{{balance}}")
  })
})

describe("the defaults a school starts with", () => {
  const keys = Object.keys(TEMPLATE_VARIABLES) as TemplateKey[]

  it("covers every trigger", () => {
    for (const key of keys) {
      expect(DEFAULT_TEMPLATES[key]).toBeDefined()
    }
  })

  it.each(Object.keys(TEMPLATE_VARIABLES) as TemplateKey[])(
    "%s only uses variables its own trigger supplies",
    (key) => {
      const allowed = variablesFor(key)
      for (const body of [
        DEFAULT_TEMPLATES[key].sms,
        DEFAULT_TEMPLATES[key].email,
        DEFAULT_TEMPLATES[key].emailSubject,
      ]) {
        for (const name of variablesIn(body)) {
          expect(allowed).toContain(name)
        }
      }
    },
  )

  it("never puts a result in a message", () => {
    // A text sits on a lock screen and passes through a provider. A child's marks are not
    // ours to broadcast, so the default says results are ready and links to the portal.
    for (const key of keys) {
      const body = `${DEFAULT_TEMPLATES[key].sms} ${DEFAULT_TEMPLATES[key].email}`
      expect(body).not.toMatch(/\{\{\s*(score|grade|average|position|marks?)\s*\}\}/i)
    }
  })

  it("keeps every default SMS to a single segment once filled in", () => {
    // A default that costs three messages instead of one is a bill a school did not choose.
    const generous: Record<string, string> = {
      studentName: "Oluwaseun Adebayo-Williams",
      className: "JSS 2A",
      termName: "First Term",
      sessionName: "2025/2026",
      schoolName: "Brightfield Academy",
      portalLink: "https://sch.ng/r/ab12cd",
      amount: "NGN 45,000.00",
      balance: "NGN 45,000.00",
      receiptNo: "RCP-2026-0417",
      decision: "Promoted",
    }

    for (const key of keys) {
      const result = render(DEFAULT_TEMPLATES[key].sms, generous, variablesFor(key))
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(measureSms(result.text).segments).toBe(1)
      }
    }
  })
})

describe("isTemplateKey", () => {
  it("accepts a known trigger and rejects anything else", () => {
    expect(isTemplateKey("results.published")).toBe(true)
    expect(isTemplateKey("results.invented")).toBe(false)
    // Guards against a prototype property being mistaken for a template.
    expect(isTemplateKey("toString")).toBe(false)
  })
})
