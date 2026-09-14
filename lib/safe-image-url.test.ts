import { describe, expect, it } from "vitest"

import { allowedImageOrigins, checkAbsolute, isPrivateHostname, resolveImageUrl } from "@/lib/safe-image-url"

/**
 * `/api/convert-image` fetches a URL on the server's behalf and returns the bytes, so every
 * one of these rejections is the difference between printing a logo and handing a caller the
 * contents of the cloud metadata endpoint. The bypasses are spelled out rather than
 * described, because the ones that matter are the ones that do not look like attacks.
 */

// The real deployment values, from `.env`.
const ENV = { endpoint: "https://t3.storage.dev", bucket: "pro-school-images" }
const ORIGINS = allowedImageOrigins(ENV)
const REQUEST_ORIGIN = "https://school-pro.example.org"

const resolve = (input: unknown) => resolveImageUrl(input, { requestOrigin: REQUEST_ORIGIN, allowedOrigins: ORIGINS })

describe("allowedImageOrigins", () => {
  // Without this, every rejection below would pass for the wrong reason: an empty allow-list
  // refuses everything, including the logo the route exists to fetch.
  it("derives both addressing styles the upload routes produce", () => {
    expect(ORIGINS).toEqual(
      expect.arrayContaining(["https://t3.storage.dev", "https://pro-school-images.t3.storage.dev"]),
    )
  })

  it("fails closed when storage is unconfigured", () => {
    expect(allowedImageOrigins({ endpoint: "", bucket: "pro-school-images" })).toEqual([])
    expect(allowedImageOrigins({ endpoint: undefined, bucket: undefined })).toEqual([])
    expect(allowedImageOrigins({ endpoint: "not a url", bucket: "b" })).toEqual([])
  })

  it("refuses an endpoint that is not http(s)", () => {
    expect(allowedImageOrigins({ endpoint: "file:///etc", bucket: "b" })).toEqual([])
  })
})

describe("resolveImageUrl — the logo must keep working", () => {
  it("accepts a virtual-hosted logo URL, the shape school-logo uploads write", () => {
    const decision = resolve("https://pro-school-images.t3.storage.dev/school-logos/abc-123.png")
    expect(decision.ok).toBe(true)
    expect(decision.ok && decision.url.href).toBe(
      "https://pro-school-images.t3.storage.dev/school-logos/abc-123.png",
    )
  })

  it("accepts a path-style URL on the endpoint host", () => {
    expect(resolve("https://t3.storage.dev/pro-school-images/school-logos/abc.png").ok).toBe(true)
  })

  it("accepts a root-relative path against this server's own origin", () => {
    const decision = resolve("/uploads/logo.png")
    expect(decision.ok && decision.url.href).toBe("https://school-pro.example.org/uploads/logo.png")
  })
})

describe("resolveImageUrl — the SSRF targets", () => {
  it("refuses the cloud metadata endpoint", () => {
    expect(resolve("http://169.254.169.254/latest/meta-data/iam/security-credentials/").ok).toBe(false)
  })

  it("refuses the database container on loopback", () => {
    expect(resolve("http://127.0.0.1:3307/").ok).toBe(false)
    expect(resolve("http://localhost:3307/").ok).toBe(false)
  })

  it.each([
    ["decimal", "http://2130706433/"],
    ["hex", "http://0x7f000001/"],
    ["octal", "http://0177.0.0.1/"],
    ["short form", "http://127.1/"],
  ])("refuses loopback written in %s notation", (_label, url) => {
    // The URL parser normalises all four to 127.0.0.1 before the check ever runs; the point
    // of the assertion is that the check is applied to the normalised host, not the input.
    expect(new URL(url).hostname).toBe("127.0.0.1")
    expect(resolve(url).ok).toBe(false)
  })

  it.each([
    ["IPv6 loopback", "http://[::1]/"],
    ["IPv4-mapped loopback", "http://[::ffff:127.0.0.1]/"],
    ["unique local", "http://[fd00::1]/"],
    ["link-local", "http://[fe80::1]/"],
  ])("refuses %s", (_label, url) => {
    expect(resolve(url).ok).toBe(false)
  })

  it.each(["http://10.0.0.5/", "http://172.16.0.1/", "http://192.168.1.1/", "http://0.0.0.0/"])(
    "refuses the private address %s",
    (url) => {
      expect(resolve(url).ok).toBe(false)
    },
  )

  it("refuses an unrelated public host", () => {
    expect(resolve("https://evil.example.com/x.png").ok).toBe(false)
  })

  it("refuses a host that merely ends with the allowed one", () => {
    // `t3.storage.dev.evil.com` and `evil-t3.storage.dev` both pass a naive endsWith check.
    expect(resolve("https://t3.storage.dev.evil.com/x.png").ok).toBe(false)
    expect(resolve("https://evilt3.storage.dev/x.png").ok).toBe(false)
  })

  it("refuses a different scheme on an allowed host", () => {
    // Origin comparison covers this: http and https are different origins.
    expect(resolve("http://t3.storage.dev/pro-school-images/x.png").ok).toBe(false)
  })

  it.each(["file:///etc/passwd", "data:image/png;base64,AAAA", "gopher://127.0.0.1:3307/_x"])(
    "refuses the non-http scheme in %s",
    (url) => {
      expect(resolve(url).ok).toBe(false)
    },
  )

  it("refuses embedded credentials on an otherwise allowed host", () => {
    expect(resolve("https://user:pass@t3.storage.dev/pro-school-images/x.png").ok).toBe(false)
  })

  it("refuses a protocol-relative URL disguised as a relative path", () => {
    // The trap: it starts with "/", but `new URL("//evil.com/x", origin)` is `https://evil.com/x`.
    expect(new URL("//evil.com/x.png", REQUEST_ORIGIN).origin).toBe("https://evil.com")
    expect(resolve("//evil.com/x.png").ok).toBe(false)
    expect(resolve("/\\evil.com/x.png").ok).toBe(false)
  })

  it("refuses input that is not a usable string", () => {
    expect(resolve(undefined).ok).toBe(false)
    expect(resolve(null).ok).toBe(false)
    expect(resolve("").ok).toBe(false)
    expect(resolve("   ").ok).toBe(false)
    expect(resolve({ href: "https://t3.storage.dev/x.png" }).ok).toBe(false)
    expect(resolve(`https://t3.storage.dev/${"a".repeat(3000)}.png`).ok).toBe(false)
  })

  it("refuses a relative path when it is not rooted", () => {
    // Not a supported shape: only absolute allow-listed URLs and root-relative paths.
    expect(resolve("logo.png").ok).toBe(false)
    expect(resolve("../../etc/passwd").ok).toBe(false)
  })
})

describe("checkAbsolute — the redirect gate", () => {
  it("lets an allowed host redirect within the allow-list", () => {
    expect(checkAbsolute(new URL("https://t3.storage.dev/pro-school-images/x.png"), ORIGINS).ok).toBe(true)
  })

  it("refuses a redirect off the allow-list", () => {
    // The reason redirects are followed by hand: an open redirect on the asset host would
    // otherwise carry the fetch to the metadata endpoint with the allow-list already passed.
    expect(checkAbsolute(new URL("http://169.254.169.254/latest/meta-data/"), ORIGINS).ok).toBe(false)
  })
})

describe("the private-address check behind the allow-list", () => {
  /**
   * Every other rejection here is already made by the allow-list, so the address check reads
   * as redundant — delete it and the rest of this file stays green. This is the case it is
   * actually there for: an operator points `AWS_ENDPOINT_URL_S3` at an S3-compatible service
   * on the host itself (a local MinIO, a sidecar container), the allow-list dutifully admits
   * that origin, and the route is an SSRF hole again with no code change.
   */
  const MISCONFIGURED = allowedImageOrigins({ endpoint: "http://127.0.0.1:9000", bucket: "pro-school-images" })

  it("has genuinely admitted the loopback origin to the allow-list", () => {
    // Without this the assertion below would pass for the wrong reason.
    expect(MISCONFIGURED).toContain("http://127.0.0.1:9000")
  })

  it("still refuses a loopback origin the allow-list was told to trust", () => {
    expect(checkAbsolute(new URL("http://127.0.0.1:9000/pro-school-images/logo.png"), MISCONFIGURED).ok).toBe(false)
    expect(resolveImageUrl("http://127.0.0.1:9000/pro-school-images/logo.png", {
      requestOrigin: REQUEST_ORIGIN,
      allowedOrigins: MISCONFIGURED,
    }).ok).toBe(false)
  })

  it("still refuses an internal hostname the allow-list was told to trust", () => {
    const internal = allowedImageOrigins({ endpoint: "https://assets.internal", bucket: "images" })
    expect(internal).toContain("https://assets.internal")
    expect(checkAbsolute(new URL("https://assets.internal/images/logo.png"), internal).ok).toBe(false)
  })
})

describe("isPrivateHostname", () => {
  it.each(["localhost", "db.localhost", "printer.local", "metadata.internal"])(
    "treats %s as internal",
    (host) => {
      expect(isPrivateHostname(host)).toBe(true)
    },
  )

  it.each(["t3.storage.dev", "pro-school-images.t3.storage.dev", "8.8.8.8", "example.com"])(
    "treats %s as external",
    (host) => {
      expect(isPrivateHostname(host)).toBe(false)
    },
  )

  it("does not mistake a public address for a private range neighbour", () => {
    // The boundaries of 172.16.0.0/12 and 100.64.0.0/10, which off-by-one checks get wrong.
    expect(isPrivateHostname("172.15.0.1")).toBe(false)
    expect(isPrivateHostname("172.32.0.1")).toBe(false)
    expect(isPrivateHostname("172.16.0.1")).toBe(true)
    expect(isPrivateHostname("172.31.255.255")).toBe(true)
    expect(isPrivateHostname("100.63.0.1")).toBe(false)
    expect(isPrivateHostname("100.64.0.1")).toBe(true)
  })
})
