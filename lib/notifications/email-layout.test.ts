import { describe, expect, it } from "vitest"

import { bodyToHtml, renderEmailHtml } from "./email-layout"

describe("school email layout", () => {
  it("lays a receipt out as a table, a heading and a button", () => {
    const html = bodyToHtml(
      "Dear Maryam Ibrahim,\n\nPAYMENT RECEIPT\nReceipt number:  RCPT-2026-00163\nAmount paid:     ₦45,000.00\n\nSign in to view:\nhttps://school.example/auth/login",
    )
    expect(html).toContain(">PAYMENT RECEIPT<")
    expect(html).toContain(">Receipt number<")
    expect(html).toContain(">RCPT-2026-00163<")
    expect(html).toContain('href="https://school.example/auth/login"')
    expect(html).toContain("Open the portal")
  })

  it("escapes everything that came from the message", () => {
    const html = renderEmailHtml({ schoolName: "A <b>School</b>" }, "Hi & bye", "Note: <script>alert(1)</script>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("A &lt;b&gt;School&lt;/b&gt;")
  })

  it("only shows an https logo", () => {
    expect(renderEmailHtml({ schoolName: "S", logoUrl: "http://x/logo.png" }, "s", "b")).not.toContain("<img")
    expect(renderEmailHtml({ schoolName: "S", logoUrl: "https://x/logo.png" }, "s", "b")).toContain('<img src="https://x/logo.png"')
  })

  it("is mobile ready", () => {
    const html = renderEmailHtml({ schoolName: "S" }, "s", "b")
    expect(html).toContain('name="viewport"')
    expect(html).toContain("max-width:600px")
  })
})
