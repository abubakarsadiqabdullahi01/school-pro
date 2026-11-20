import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

import { sharePdf } from "@/lib/pdf/share-pdf"

/**
 * Share must never be a dead end: whatever the browser does, the user either gets the share
 * sheet, a one-tap retry, or the file on disk to send themselves.
 */

const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" })
let click: ReturnType<typeof vi.fn>

function browser(share: () => Promise<void>, canShare = true) {
  vi.stubGlobal("navigator", { canShare: () => canShare, share: vi.fn(share) })
}

function named(name: string) {
  return Object.assign(new Error(name), { name })
}

beforeEach(() => {
  click = vi.fn()
  vi.stubGlobal("document", { createElement: () => ({ click }) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("sharePdf", () => {
  it("opens the share sheet with the PDF attached", async () => {
    browser(async () => {})
    await sharePdf(blob, "receipt.pdf", "Receipt")
    const [data] = vi.mocked(navigator.share).mock.calls[0]!
    expect(data?.files?.[0]?.name).toBe("receipt.pdf")
    expect(data?.files?.[0]?.type).toBe("application/pdf")
    expect(click).not.toHaveBeenCalled()
  })

  it("downloads when the browser cannot share files", async () => {
    browser(async () => {}, false)
    await sharePdf(blob, "receipt.pdf")
    expect(click).toHaveBeenCalledOnce()
    expect(toast.info).toHaveBeenCalledOnce()
  })

  it("does nothing when the user closes the share sheet", async () => {
    browser(() => Promise.reject(named("AbortError")))
    await sharePdf(blob, "receipt.pdf")
    expect(click).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("offers a one-tap Share when the click went stale while the PDF was building", async () => {
    browser(() => Promise.reject(named("NotAllowedError")))
    await sharePdf(blob, "cards.pdf")
    expect(click).not.toHaveBeenCalled()
    const options = toast.success.mock.calls[0]![1] as { action: { onClick: () => void } }

    vi.mocked(navigator.share).mockResolvedValueOnce(undefined)
    options.action.onClick()
    await vi.waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(2))
  })

  it("downloads on any other share failure", async () => {
    browser(() => Promise.reject(named("DataError")))
    await sharePdf(blob, "receipt.pdf")
    expect(click).toHaveBeenCalledOnce()
  })
})
