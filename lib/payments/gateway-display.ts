import type { GatewayEventStatus, GatewayTransactionStatus } from "@prisma/client"

export const GATEWAY_STATUS_LABELS: Record<GatewayTransactionStatus, string> = {
  CREATED: "Created",
  INITIALIZED: "Checkout ready",
  INITIALIZATION_UNKNOWN: "Initialization uncertain",
  PENDING: "Pending",
  PROCESSING: "Confirming",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  ABANDONED: "Abandoned",
  REQUIRES_REVIEW: "Requires review",
  REFUNDED: "Refunded",
  DISPUTED: "Disputed",
}

export function gatewayStatusTone(status: GatewayTransactionStatus): string {
  if (status === "SUCCEEDED") return "border-green-200 bg-green-50 text-green-700"
  if (["FAILED", "DISPUTED", "REQUIRES_REVIEW", "INITIALIZATION_UNKNOWN"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-700"
  }
  if (["PENDING", "PROCESSING", "CREATED", "INITIALIZED"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  return "border-slate-200 bg-slate-50 text-slate-700"
}

export function gatewayEventTone(status: GatewayEventStatus): string {
  if (status === "PROCESSED") return "border-green-200 bg-green-50 text-green-700"
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-700"
  if (status === "PROCESSING") return "border-blue-200 bg-blue-50 text-blue-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
}
