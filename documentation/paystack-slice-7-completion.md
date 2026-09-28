# Paystack Slice 7 — refunds, disputes and reconciliation

Status: implemented locally on 26 September 2026. Live financial operations remain disabled until Slice 8 pilot approval.

## What is now implemented

- `GatewayRefund`: one full provider refund per gateway transaction with `REQUESTED`, `PENDING`, `PROCESSING`, `PROCESSED`, `FAILED`, and `NEEDS_ATTENTION` states.
- Refund API acceptance does **not** reverse a receipt. Only a signed, persisted `refund.processed` webhook invokes the shared idempotent ledger reversal.
- An uncertain refund API response is never automatically retried. Finance must reconcile it with Paystack to avoid submitting the same refund twice.
- Exact dispute events: `charge.dispute.create`, `charge.dispute.remind`, and `charge.dispute.resolve`.
- Provider-backed dispute evidence and resolution actions, with school scoping and audit records.
- Settlement import with pagination, provider IDs stored as strings, transaction-to-local matching, and an exception queue.
- Reconciliation never changes a receipt, allocation, charge balance, or settlement merely to make totals agree.
- Finance UI at `online-payments/reconciliation`, plus refund controls on an eligible gateway transaction.

## Refund control flow

1. A finance user with `finance.manage_gateway` opens a succeeded online payment.
2. The user confirms a full refund and records a reason.
3. DigiSchool-Pro creates the local refund intent before calling Paystack.
4. Paystack queues the refund. The receipt remains `COMPLETED`.
5. Signed refund lifecycle events update the operational status.
6. Only `refund.processed` reverses charge allocations, creates one `AccountingReversal`, changes the receipt to `REFUNDED`, and changes the gateway transaction to `REFUNDED`.
7. Duplicate delivery is safe: the refunded payment and unique reversal prevent a second ledger effect.

Partial online refunds are intentionally not exposed in this slice because the existing school ledger reverses whole receipt allocations. Adding partial refunds requires an allocation-selection and partial-credit model rather than decrementing arbitrary balances.

## Daily reconciliation

Run **Refunds & reconciliation → Run reconciliation**. Each enabled, ready test/live configuration is queried separately. The importer reads the previous 31 days, paginates settlements and settlement transactions, and raises durable exceptions for:

- a settled provider transaction with no local gateway transaction;
- a settled transaction whose local state is not `SUCCEEDED` or `REFUNDED`;
- an amount mismatch between the provider settlement row and locally confirmed charge.

The first Slice 8 pilot should run this manually every day. After the hosting scheduler is agreed, call the same server workflow from an authenticated daily job and alert when open exceptions, failed refund events, or dispute deadlines exist.

## Missed-webhook recovery runbook

1. Confirm the webhook URL is reachable and the relevant school configuration/environment is correct.
2. In Paystack, locate the missing event by event type, date, transaction reference, or customer data.
3. Preview the match first using the Webhook Events API (`preview=true`). Check that the returned event IDs and environment are the intended ones.
4. Resend no more than 100 selected event IDs in one request.
5. Do not treat the resend API as idempotent. DigiSchool-Pro's inbox is idempotent by provider event ID and payload hash, so duplicate delivery is accepted without duplicate accounting.
6. Confirm the event appears on the transaction timeline and finishes `PROCESSED`. If it becomes `FAILED`, inspect the error and use the existing guarded reprocess action only after correcting the cause.
7. Never manually mark a receipt paid or refunded to compensate for a missing webhook.

Official references: [Refund API](https://paystack.com/docs/api/refund/), [Dispute API](https://paystack.com/docs/api/dispute/), [Managing disputes](https://paystack.com/docs/payments/manage-disputes/), [Settlement API](https://paystack.com/docs/api/settlement/), [Webhook Events API](https://paystack.com/docs/api/webhook-events/), and [webhook delivery](https://paystack.com/docs/payments/webhooks/).

## Verification gate

- Prisma migration: `20260926180000_paystack_slice7_operations`.
- Prisma schema validation and client generation must pass.
- Unit, integration, type-check and production build must pass.
- Before Slice 8, use test mode to demonstrate: refund pending → processed, duplicate processed event, failed refund, missed-event replay, dispute create/remind/resolve, matching settlement, and deliberate settlement mismatch.

No real refund or dispute resolution was submitted during automated tests.
