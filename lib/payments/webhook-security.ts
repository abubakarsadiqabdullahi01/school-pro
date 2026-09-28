import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const SIGNATURE_PATTERN = /^[a-f0-9]{128}$/i

export function paystackPayloadHash(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex")
}

export function verifyPaystackSignature(rawBody: Buffer, signature: string | null, secretKey: string): boolean {
  if (!signature || !SIGNATURE_PATTERN.test(signature)) return false
  const expected = createHmac("sha512", secretKey).update(rawBody).digest()
  const supplied = Buffer.from(signature, "hex")
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export function verifyBearerSecret(header: string | null, expectedSecret: string): boolean {
  if (!header?.startsWith("Bearer ") || expectedSecret.length < 24) return false
  const supplied = Buffer.from(header.slice(7), "utf8")
  const expected = Buffer.from(expectedSecret, "utf8")
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
