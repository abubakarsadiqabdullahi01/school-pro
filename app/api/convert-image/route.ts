import { type NextRequest, NextResponse } from "next/server"

import { AuthorizationError, requireActor } from "@/lib/authz"
import { allowedImageOrigins, checkAbsolute, resolveImageUrl } from "@/lib/safe-image-url"
import { localFileKey, readStoredFile, fileContentType } from "@/lib/local-storage"

/**
 * Fetches an image on the server's behalf and returns it as a data URI.
 *
 * jsPDF can only draw an image handed to it as a data URI, and the school logo lives in
 * object storage on another origin where a browser fetch is blocked by CORS. So the server
 * fetches it. Callers: the report card generator, the CA sheet, the termly class results,
 * and the shared letterhead in `lib/pdf/school-header.ts`.
 *
 * Everything below the fetch exists because "fetch a URL the caller chose and hand back the
 * bytes" is the definition of server-side request forgery. The controls, in order:
 *
 *   1. an authenticated actor — no anonymous use of the server as a proxy
 *   2. an origin allow-list, re-applied to every redirect hop
 *   3. http(s) only, with private and loopback addresses refused outright
 *   4. a request timeout and a hard cap on bytes read
 *   5. image content types only
 *
 * The URL rules live in `@/lib/safe-image-url` so they can be unit tested without next-auth.
 */

/** Matches the 5MB ceiling on `app/api/upload/school-logo`. A logo cannot exceed its upload. */
const MAX_BYTES = 5 * 1024 * 1024

/** Covers the whole operation, redirects and body read included. */
const FETCH_TIMEOUT_MS = 8000

/** Enough for the addressing-style redirects object stores use, few enough to stop a loop. */
const MAX_REDIRECTS = 3

/**
 * The types `app/api/upload/school-logo` accepts, minus SVG: jsPDF cannot draw one, and an
 * SVG is a script-bearing document that has no business being echoed back through here.
 */
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]

export async function POST(request: NextRequest) {
  try {
    // Any signed-in role: parents and students print report cards with the same letterhead
    // that admins and teachers do. The bar is "not anonymous", not "privileged".
    await requireActor()

    const allowedOrigins = allowedImageOrigins({
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      bucket: process.env.NEXT_PUBLIC_S3_BUCKET_IMAGES,
    })

    const body = await request.json().catch(() => null)
    const localKey = typeof body?.imageUrl === "string" ? localFileKey(body.imageUrl) : null
    if (localKey) {
      if (localKey.startsWith("expense-receipts/")) return NextResponse.json({ error: "Not a public image" }, { status: 403 })
      const contentType = fileContentType(localKey)
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) return NextResponse.json({ error: "Not an image" }, { status: 400 })
      const bytes = await readStoredFile(localKey)
      if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "Image too large" }, { status: 400 })
      return NextResponse.json({ success: true, dataURL: `data:${contentType};base64,${bytes.toString("base64")}` })
    }
    const decision = resolveImageUrl(body?.imageUrl, {
      requestOrigin: new URL(request.url).origin,
      allowedOrigins,
    })

    if (!decision.ok) {
      return NextResponse.json({ success: false, error: decision.reason }, { status: 400 })
    }

    // The same list the URL was admitted by, so the redirect gate can never drift from it.
    const fetched = await fetchImage(decision.url, allowedOrigins)
    if (!fetched.ok) {
      return NextResponse.json({ success: false, error: fetched.reason }, { status: fetched.status })
    }

    return NextResponse.json({
      success: true,
      dataURL: `data:${fetched.contentType};base64,${fetched.body.toString("base64")}`,
    })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 })
    }

    // Logged, not returned: the fetch failure text would describe the server's own network.
    console.error("Failed to convert an image to a data URI", error)
    return NextResponse.json({ success: false, error: "Failed to convert image" }, { status: 500 })
  }
}

type FetchOutcome =
  | { ok: true; body: Buffer; contentType: string }
  | { ok: false; reason: string; status: number }

/**
 * Fetches an already-validated URL, following redirects by hand.
 *
 * By hand because `fetch` would follow them for us without re-checking where they lead, and
 * an open redirect on the asset host — or simply a bucket that redirects to a canonical
 * hostname — would otherwise walk straight past the allow-list onto 169.254.169.254.
 */
async function fetchImage(target: URL, allowedOrigins: string[]): Promise<FetchOutcome> {
  // One signal for the whole operation, so redirect hops and a slow body cannot together
  // outlast the budget the way a per-hop timeout would allow.
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  let url = target

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url, { redirect: "manual", signal, cache: "no-store" })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) return { ok: false, reason: "That image could not be loaded", status: 502 }

      // Relative redirects resolve against the hop we are on; the result is re-validated
      // exactly like a caller-supplied URL, so a redirect can never widen the allow-list.
      let next: URL
      try {
        next = new URL(location, url)
      } catch {
        return { ok: false, reason: "That image URL is not allowed", status: 400 }
      }

      const revalidated = checkAbsolute(next, allowedOrigins)
      if (!revalidated.ok) {
        return { ok: false, reason: revalidated.reason, status: 400 }
      }

      await response.body?.cancel()
      url = revalidated.url
      continue
    }

    if (!response.ok) {
      return { ok: false, reason: "That image could not be loaded", status: 502 }
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      await response.body?.cancel()
      return { ok: false, reason: "That URL is not an image", status: 400 }
    }

    // The declared length is a courtesy — checked first to avoid reading a body we already
    // know is too large, then enforced again while reading in case it lied or was absent.
    const declared = Number(response.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      await response.body?.cancel()
      return { ok: false, reason: "That image is too large", status: 400 }
    }

    const read = await readCapped(response.body, MAX_BYTES)
    if (!read) return { ok: false, reason: "That image is too large", status: 400 }

    return { ok: true, body: read, contentType }
  }

  return { ok: false, reason: "That image URL redirects too many times", status: 400 }
}

/** Reads a body, abandoning it the moment it exceeds `maxBytes`. Null means it did. */
async function readCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer | null> {
  if (!body) return Buffer.alloc(0)

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }

    chunks.push(value)
  }

  return Buffer.concat(chunks)
}
