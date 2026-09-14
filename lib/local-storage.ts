import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile, unlink, lstat } from "node:fs/promises"
import path from "node:path"

export const FILE_URL_PREFIX = "/api/files/"
export const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
export const receiptTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "application/pdf"]
const extensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/gif": "gif",
  "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf",
}
export class UploadError extends Error {}

export function storageRoot() {
  const configured = process.env.UPLOAD_DIR
  if (configured && !path.isAbsolute(configured)) throw new Error("UPLOAD_DIR must be absolute")
  if (!configured && process.env.NODE_ENV === "production") throw new Error("UPLOAD_DIR is required in production")
  return configured || path.resolve("storage", "uploads")
}

// Only generated names in known categories can ever resolve to disk paths.
export function validFileKey(key: string) {
  return /^(school-logos|profile-avatars|expense-receipts)\/[a-zA-Z0-9_-]{1,100}\/[a-f0-9-]{36}\.(jpg|png|gif|webp|heic|pdf)$/.test(key)
}
export function localFileKey(url: string): string | null {
  if (!url.startsWith(FILE_URL_PREFIX)) return null
  const key = url.slice(FILE_URL_PREFIX.length)
  return validFileKey(key) ? key : null
}
export function fileContentType(key: string) {
  const extension = path.extname(key).slice(1)
  return Object.entries(extensions).find(([, value]) => value === extension)?.[0] || "application/octet-stream"
}
async function filePath(key: string, create = false) {
  if (!validFileKey(key)) throw new UploadError("Invalid file reference")
  const root = storageRoot()
  const parent = path.join(root, path.dirname(key))
  if (create) await mkdir(parent, { recursive: true, mode: 0o700 })
  // Refuse symlinks in the managed tree; even valid keys must stay in storage.
  let current = root
  for (const segment of ["", ...key.split("/")]) {
    if (segment) current = path.join(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new UploadError("Invalid storage path")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return path.join(root, key)
}

function matchesType(bytes: Buffer, type: string) {
  if (type === "image/jpeg" || type === "image/jpg") return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (type === "image/gif") return /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())
  if (type === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
  if (type === "application/pdf") return bytes.subarray(0, 5).toString() === "%PDF-"
  if (type === "image/heic") return bytes.subarray(4, 8).toString() === "ftyp" && /^(heic|heix|hevc|hevx|mif1)$/.test(bytes.subarray(8, 12).toString())
  return false
}
export async function storeUpload(file: File, category: "school-logos" | "profile-avatars" | "expense-receipts", owner: string) {
  const allowed = category === "expense-receipts" ? receiptTypes : imageTypes
  const max = (category === "profile-avatars" ? 2 : category === "school-logos" ? 5 : 10) * 1024 * 1024
  if (!allowed.includes(file.type) || !file.size || file.size > max) throw new UploadError("Invalid file type or size")
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length > max || !matchesType(bytes, file.type)) throw new UploadError("File content does not match its type")
  const key = `${category}/${owner}/${randomUUID()}.${extensions[file.type]}`
  await writeFile(await filePath(key, true), bytes, { flag: "wx", mode: 0o600 })
  return `${FILE_URL_PREFIX}${key}`
}
export async function readStoredFile(key: string) {
  return readFile(await filePath(key))
}
export async function deleteStoredFile(url: string) {
  const key = localFileKey(url)
  if (!key) return // Never delete an arbitrary path or an old remote object.
  try { await unlink(await filePath(key)) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}
