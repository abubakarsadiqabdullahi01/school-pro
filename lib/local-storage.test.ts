import { afterEach, describe, expect, it } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { deleteStoredFile, localFileKey, readStoredFile, storeUpload, validFileKey } from "./local-storage"

const original = process.env.UPLOAD_DIR
const roots: string[] = []
afterEach(async () => {
  if (original === undefined) delete process.env.UPLOAD_DIR
  else process.env.UPLOAD_DIR = original
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "school-storage-test-"))
  roots.push(root)
  process.env.UPLOAD_DIR = root
}
describe("local uploads", () => {
  it("stores persistent bytes under generated names and deletes only local files", async () => {
    await setup()
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2])
    const file = new File([bytes], "../../payload.php", { type: "image/png" })
    const url = await storeUpload(file, "school-logos", "school-1")
    expect(url).toMatch(/^\/api\/files\/school-logos\/school-1\/[a-f0-9-]+\.png$/)
    const key = localFileKey(url)!
    expect(await readStoredFile(key)).toEqual(bytes)
    await deleteStoredFile("https://example.com/" + key)
    expect(await readStoredFile(key)).toEqual(bytes)
    await deleteStoredFile(url)
    await expect(readStoredFile(key)).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("rejects traversal, encoded separators and arbitrary filesystem paths", () => {
    for (const key of ["../.env", "school-logos/../.env", "school-logos/%2e%2e/file.png", "C:/secrets", "/etc/passwd"]) {
      expect(validFileKey(key)).toBe(false)
    }
    expect(localFileKey("https://evil.test/api/files/school-logos/a/x.png")).toBeNull()
  })
  it("rejects forged images and oversized receipts", async () => {
    await setup()
    await expect(storeUpload(new File(["<script>bad</script>"], "x.png", { type: "image/png" }), "school-logos", "school-1")).rejects.toThrow("content")
    await expect(storeUpload(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "x.pdf", { type: "application/pdf" }), "expense-receipts", "school-1")).rejects.toThrow("size")
  })
})
