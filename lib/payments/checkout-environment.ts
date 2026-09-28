import type { PaymentGatewayEnvironment } from "@prisma/client"

/**
 * Which Paystack environment this deployment takes money in. PAYMENT_CHECKOUT_ENV wins;
 * otherwise production means LIVE and anything else TEST.
 */
export function checkoutEnvironment(): PaymentGatewayEnvironment {
  const explicit = process.env.PAYMENT_CHECKOUT_ENV?.trim().toUpperCase()
  if (explicit === "TEST" || explicit === "LIVE") return explicit
  return process.env.NODE_ENV === "production" ? "LIVE" : "TEST"
}
