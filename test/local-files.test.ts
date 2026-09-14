import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ permission: vi.fn(), attachment: vi.fn(), read: vi.fn() }))
vi.mock("@/lib/authz", async () => {
  const scope = await import("@/lib/authz-scope")
  return { ...scope, requirePermission: mocks.permission }
})
vi.mock("@/lib/db", () => ({ prisma: { expenseAttachment: { findFirst: mocks.attachment } } }))
vi.mock("@/lib/local-storage", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/local-storage")>(), readStoredFile: mocks.read }))
import { GET } from "@/app/api/files/[...key]/route"
import { AuthorizationError } from "@/lib/authz-scope"
const key = ["expense-receipts", "school-a", "12345678-1234-1234-1234-123456789012.pdf"]
beforeEach(() => { vi.resetAllMocks(); mocks.read.mockResolvedValue(Buffer.from("%PDF-test")) })
describe("receipt downloads", () => {
  it("does not read private bytes for anonymous users", async () => {
    mocks.permission.mockRejectedValue(new AuthorizationError("Login required"))
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ key }) })).status).toBe(403)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it("refuses another school's receipt", async () => {
    mocks.permission.mockResolvedValue({ role: "ADMIN", schoolId: "school-b" })
    mocks.attachment.mockResolvedValue({ expense: { schoolId: "school-a" } })
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ key }) })).status).toBe(403)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it("serves an authorized receipt without public caching", async () => {
    mocks.permission.mockResolvedValue({ role: "ADMIN", schoolId: "school-a" })
    mocks.attachment.mockResolvedValue({ expense: { schoolId: "school-a" } })
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ key }) })
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await response.text()).toBe("%PDF-test")
  })
  it("refuses detached receipts", async () => {
    mocks.permission.mockResolvedValue({ role: "ADMIN", schoolId: "school-a" })
    mocks.attachment.mockResolvedValue(null)
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ key }) })).status).toBe(404)
    expect(mocks.read).not.toHaveBeenCalled()
  })
})
