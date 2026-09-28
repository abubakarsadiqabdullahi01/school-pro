import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const KEY_BYTES = 32
const IV_BYTES = 12

export type EncryptedGatewaySecret = {
  encryptedSecret: string
  initializationVector: string
  authenticationTag: string
  secretLast4: string
  keyVersion: number
}

export function loadGatewayEncryptionKey(value = process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY): Buffer {
  if (!value) throw new Error("PAYMENT_GATEWAY_ENCRYPTION_KEY is required for school-owned gateways")

  const key = Buffer.from(value, "base64")
  if (key.length !== KEY_BYTES || key.toString("base64").replace(/=+$/, "") !== value.trim().replace(/=+$/, "")) {
    throw new Error("PAYMENT_GATEWAY_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64")
  }
  return key
}

function additionalData(configurationId: string, keyVersion: number): Buffer {
  return Buffer.from(`school-payment-gateway:${configurationId}:v${keyVersion}`, "utf8")
}

export function encryptGatewaySecret(
  secret: string,
  configurationId: string,
  key: Buffer,
  keyVersion = 1,
): EncryptedGatewaySecret {
  if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) {
    throw new Error("The Paystack secret key has an invalid prefix")
  }
  if (key.length !== KEY_BYTES) throw new Error("Gateway encryption key must be 32 bytes")

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(additionalData(configurationId, keyVersion))
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])

  return {
    encryptedSecret: encrypted.toString("base64"),
    initializationVector: iv.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
    secretLast4: secret.slice(-4),
    keyVersion,
  }
}

export function decryptGatewaySecret(
  encrypted: Pick<
    EncryptedGatewaySecret,
    "encryptedSecret" | "initializationVector" | "authenticationTag" | "keyVersion"
  >,
  configurationId: string,
  key: Buffer,
): string {
  if (key.length !== KEY_BYTES) throw new Error("Gateway encryption key must be 32 bytes")

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(encrypted.initializationVector, "base64"),
    )
    decipher.setAAD(additionalData(configurationId, encrypted.keyVersion))
    decipher.setAuthTag(Buffer.from(encrypted.authenticationTag, "base64"))
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.encryptedSecret, "base64")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    throw new Error("Stored payment gateway credentials could not be decrypted")
  }
}

export function newGatewayWebhookToken(): string {
  return randomBytes(32).toString("hex")
}
