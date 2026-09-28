export const GATEWAY_TRANSACTION_STATUSES = [
  "CREATED",
  "INITIALIZED",
  "INITIALIZATION_UNKNOWN",
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "ABANDONED",
  "REQUIRES_REVIEW",
  "REFUNDED",
  "DISPUTED",
] as const

export type GatewayTransactionState = (typeof GATEWAY_TRANSACTION_STATUSES)[number]

const ALLOWED_TRANSACTION_TRANSITIONS: Record<GatewayTransactionState, ReadonlySet<GatewayTransactionState>> = {
  CREATED: new Set(["INITIALIZED", "INITIALIZATION_UNKNOWN", "FAILED", "ABANDONED"]),
  INITIALIZED: new Set(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "ABANDONED", "REQUIRES_REVIEW"]),
  INITIALIZATION_UNKNOWN: new Set(["INITIALIZED", "PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "ABANDONED", "REQUIRES_REVIEW"]),
  PENDING: new Set(["PROCESSING", "SUCCEEDED", "FAILED", "ABANDONED", "REQUIRES_REVIEW"]),
  PROCESSING: new Set(["PENDING", "SUCCEEDED", "FAILED", "REQUIRES_REVIEW"]),
  SUCCEEDED: new Set(["REFUNDED", "DISPUTED"]),
  // A verified success after a terminal failure is never posted automatically. It moves
  // to review so finance can reconcile the conflicting provider history deliberately.
  FAILED: new Set(["REQUIRES_REVIEW"]),
  ABANDONED: new Set(["PROCESSING", "SUCCEEDED", "REQUIRES_REVIEW"]),
  REQUIRES_REVIEW: new Set(["PROCESSING", "SUCCEEDED", "FAILED", "REFUNDED", "DISPUTED"]),
  REFUNDED: new Set(["DISPUTED"]),
  DISPUTED: new Set(["SUCCEEDED", "REFUNDED", "REQUIRES_REVIEW"]),
}

export function canTransitionGatewayTransaction(
  from: GatewayTransactionState,
  to: GatewayTransactionState,
): boolean {
  return from === to || ALLOWED_TRANSACTION_TRANSITIONS[from].has(to)
}

export function assertGatewayTransactionTransition(
  from: GatewayTransactionState,
  to: GatewayTransactionState,
): void {
  if (!canTransitionGatewayTransaction(from, to)) {
    throw new Error(`Gateway transaction cannot move from ${from} to ${to}`)
  }
}

export const GATEWAY_EVENT_STATUSES = ["PENDING", "PROCESSING", "PROCESSED", "FAILED", "IGNORED"] as const
export type GatewayEventState = (typeof GATEWAY_EVENT_STATUSES)[number]

const ALLOWED_EVENT_TRANSITIONS: Record<GatewayEventState, ReadonlySet<GatewayEventState>> = {
  PENDING: new Set(["PROCESSING", "IGNORED"]),
  PROCESSING: new Set(["PROCESSED", "FAILED", "IGNORED"]),
  PROCESSED: new Set(),
  FAILED: new Set(["PENDING", "PROCESSING", "IGNORED"]),
  IGNORED: new Set(["PENDING"]),
}

export function canTransitionGatewayEvent(from: GatewayEventState, to: GatewayEventState): boolean {
  return from === to || ALLOWED_EVENT_TRANSITIONS[from].has(to)
}

export function assertGatewayEventTransition(from: GatewayEventState, to: GatewayEventState): void {
  if (!canTransitionGatewayEvent(from, to)) {
    throw new Error(`Gateway event cannot move from ${from} to ${to}`)
  }
}
