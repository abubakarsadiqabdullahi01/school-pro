/**
 * The allow-list standing between `/api/convert-image` and the server's own network.
 *
 * That route exists for one reason: jsPDF can only draw an image it is handed as a data
 * URI, and the school logo lives in object storage on another origin, so a browser fetch of
 * it is blocked by CORS. The server fetches it instead and hands back base64.
 *
 * A server that fetches a URL of the caller's choosing and returns the bytes is a
 * server-side request forgery primitive — it will just as happily read the cloud metadata
 * endpoint on 169.254.169.254, or the database container on 127.0.0.1, as it will read a
 * logo. The fix is not to sanitise the URL but to refuse any origin that is not the asset
 * host the logos were uploaded to in the first place.
 *
 * Kept free of next-auth and `next/server` so it can be unit tested directly; the route is
 * the front door, this is the rule.
 */

/** Long enough for any presigned asset URL, short enough to refuse a payload. */
const MAX_URL_LENGTH = 2048

export type ImageUrlDecision = { ok: true; url: URL } | { ok: false; reason: string }

export type AssetHostEnv = {
  /** `AWS_ENDPOINT_URL_S3`, e.g. `https://t3.storage.dev`. */
  endpoint?: string | null
  /** `NEXT_PUBLIC_S3_BUCKET_IMAGES`, e.g. `pro-school-images`. */
  bucket?: string | null
}

/**
 * The origins a logo may legitimately come from, derived from the same two variables the
 * upload routes use to *build* a logo URL.
 *
 * Both addressing styles are produced by `app/api/upload/school-logo` and
 * `app/api/expenditure/receipt-upload`, so both must be allowed:
 *   - virtual-hosted, on a storage.dev endpoint: `https://<bucket>.<host>/<key>`
 *   - path-style, everywhere else:               `https://<host>/<bucket>/<key>`
 *
 * Returns an empty list when storage is unconfigured, which fails closed: with no allowed
 * origin, every absolute URL is refused.
 */
export function allowedImageOrigins(env: AssetHostEnv): string[] {
  const endpoint = env.endpoint?.trim()
  const bucket = env.bucket?.trim()
  if (!endpoint) return []

  let endpointUrl: URL
  try {
    endpointUrl = new URL(endpoint)
  } catch {
    return []
  }

  if (endpointUrl.protocol !== "http:" && endpointUrl.protocol !== "https:") return []

  const origins = new Set<string>()

  // Path-style: the endpoint itself.
  origins.add(endpointUrl.origin)

  // Virtual-hosted: the bucket as a subdomain of the endpoint. Mirrors the `storage.dev`
  // branch in the upload routes, but is added unconditionally — an operator who moves to a
  // provider that also uses subdomain addressing should not have to find this file.
  if (bucket) {
    try {
      origins.add(new URL(`${endpointUrl.protocol}//${bucket}.${endpointUrl.host}`).origin)
    } catch {
      // A bucket name that cannot form a hostname simply contributes no origin.
    }
  }

  return [...origins]
}

/**
 * Resolves a caller-supplied image reference to a URL that is safe to fetch, or explains
 * why it is not.
 *
 * Accepts two shapes and nothing else:
 *   - a root-relative path (`/uploads/logo.png`), resolved against this server's own origin
 *   - an absolute http(s) URL whose origin is in `allowedOrigins`
 */
export function resolveImageUrl(
  input: unknown,
  { requestOrigin, allowedOrigins }: { requestOrigin: string; allowedOrigins: string[] },
): ImageUrlDecision {
  if (typeof input !== "string") return { ok: false, reason: "An image URL is required" }

  const raw = input.trim()
  if (!raw) return { ok: false, reason: "An image URL is required" }
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: "That image URL is too long" }

  if (raw.startsWith("/")) {
    // `//evil.com/x` and `/\evil.com/x` are not relative paths: resolved against any origin
    // they land on `evil.com`, because the URL parser treats both slashes as authority
    // markers. A genuine relative path has exactly one leading slash.
    const second = raw[1]
    if (second === "/" || second === "\\") {
      return { ok: false, reason: "That image URL is not allowed" }
    }

    try {
      // The host here is this server's own, never the caller's to choose, so the private
      // address check below deliberately does not apply — it exists to stop a caller
      // *naming* an internal target, and a relative path cannot name a host. In development
      // the app's own origin is localhost, which that check would otherwise reject.
      return { ok: true, url: new URL(raw, requestOrigin) }
    } catch {
      return { ok: false, reason: "That image URL is not allowed" }
    }
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: "That image URL is not a valid URL" }
  }

  return checkAbsolute(url, allowedOrigins)
}

/**
 * The checks every absolute URL must pass, applied to the URL the caller supplied and again
 * to each redirect the asset host sends us to. A host allowed to serve logos is still not
 * allowed to redirect us onto the metadata endpoint.
 */
export function checkAbsolute(url: URL, allowedOrigins: string[]): ImageUrlDecision {
  // `data:`, `file:` and `blob:` would read the disk or smuggle bytes past every other check.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https image URLs are supported" }
  }

  // Credentials in the URL would be sent on to the asset host.
  if (url.username || url.password) {
    return { ok: false, reason: "That image URL is not allowed" }
  }

  // Belt and braces behind the allow-list: even an allowed origin must not be an internal
  // address, so a misconfigured endpoint cannot turn this route back into an SSRF hole.
  if (isPrivateHostname(url.hostname)) {
    return { ok: false, reason: "That image URL is not allowed" }
  }

  if (!allowedOrigins.includes(url.origin)) {
    return { ok: false, reason: "That image URL is not on an allowed host" }
  }

  return { ok: true, url }
}

/**
 * True for hostnames that resolve, or are likely to resolve, inside the server's own
 * network.
 *
 * Only literal addresses can be judged here — a name that resolves to a private address is
 * caught by the allow-list instead, which is why the allow-list is the primary control and
 * this is the backstop. The URL parser has already normalised the decimal, octal, hex and
 * short forms (`2130706433`, `0x7f000001`, `127.1`) into dotted quads by this point, so
 * matching on the canonical text is enough.
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()

  // `localhost` and, per the URL spec, anything under it.
  if (host === "localhost" || host.endsWith(".localhost")) return true

  // `.local` is mDNS; `.internal` is the conventional private zone on several clouds.
  if (host.endsWith(".local") || host.endsWith(".internal")) return true

  if (host.startsWith("[") && host.endsWith("]")) {
    return isPrivateIpv6(host.slice(1, -1))
  }

  const ipv4 = parseIpv4(host)
  return ipv4 ? isPrivateIpv4(ipv4) : false
}

/** Dotted-quad only — the canonical form the URL parser produces. */
function parseIpv4(host: string): number[] | null {
  const parts = host.split(".")
  if (parts.length !== 4) return null

  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    octets.push(value)
  }

  return octets
}

function isPrivateIpv4([a, b]: number[]): boolean {
  if (a === 0) return true // 0.0.0.0/8 — "this network", and a route to loopback on Linux.
  if (a === 10) return true // Private.
  if (a === 127) return true // Loopback.
  if (a === 169 && b === 254) return true // Link-local, and the cloud metadata endpoint.
  if (a === 172 && b >= 16 && b <= 31) return true // Private.
  if (a === 192 && b === 168) return true // Private.
  if (a === 100 && b >= 64 && b <= 127) return true // Carrier-grade NAT.
  if (a === 192 && b === 0) return true // IETF protocol assignments, incl. 192.0.0.0/24.
  if (a === 198 && (b === 18 || b === 19)) return true // Benchmarking.
  if (a >= 224) return true // Multicast and reserved, through 255.255.255.255.
  return false
}

function isPrivateIpv6(address: string): boolean {
  const groups = expandIpv6(address)
  if (!groups) return false

  // `::` and `::1`.
  if (groups.slice(0, 7).every((group) => group === 0) && (groups[7] === 0 || groups[7] === 1)) {
    return true
  }

  // IPv4-mapped (`::ffff:127.0.0.1`, which the URL parser normalises to `::ffff:7f00:1`) and
  // IPv4-compatible addresses tunnel an IPv4 target through an IPv6 literal, so the embedded
  // address is the one to judge.
  if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    return isPrivateIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff])
  }

  const first = groups[0]
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 — unique local.
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 — link-local.
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 — multicast.

  return false
}

/** Expands an IPv6 literal to its eight 16-bit groups, or null if it is not one. */
function expandIpv6(address: string): number[] | null {
  // A trailing dotted quad (`::ffff:192.168.0.1`) becomes two hex groups first.
  let text = address
  const tail = text.lastIndexOf(":")
  const trailing = text.slice(tail + 1)
  if (trailing.includes(".")) {
    const octets = parseIpv4(trailing)
    if (!octets) return null
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    text = `${text.slice(0, tail + 1)}${high}:${low}`
  }

  const halves = text.split("::")
  if (halves.length > 2) return null

  const toGroups = (part: string): number[] | null => {
    if (!part) return []
    const groups: number[] = []
    for (const chunk of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(chunk)) return null
      groups.push(Number.parseInt(chunk, 16))
    }
    return groups
  }

  const head = toGroups(halves[0])
  const rest = halves.length === 2 ? toGroups(halves[1]) : []
  if (!head || !rest) return null

  if (halves.length === 1) return head.length === 8 ? head : null

  const gap = 8 - head.length - rest.length
  if (gap < 1) return null

  return [...head, ...Array<number>(gap).fill(0), ...rest]
}
