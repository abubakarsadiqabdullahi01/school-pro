# Paystack Slice 5 Completion Record

**Completed:** 25 September 2026  
**Scope:** Signed webhook inbox, idempotent confirmation, atomic ledger posting, and recovery  
**Status:** Implemented and locally verified with signed fixtures and mocked Paystack verification

## Webhook endpoints

### DigiSchool-managed Paystack

```text
POST https://schoolpro.digisoft.com.ng/api/webhooks/paystack
```

The endpoint uses the environment's server-only `PAYSTACK_SECRET_KEY`.

### School-owned Paystack

Each school receives an opaque URL from Online Payment Settings:

```text
POST https://schoolpro.digisoft.com.ng/api/webhooks/paystack/{64-character-token}
```

The token selects the school's encrypted credential. It contains neither the school ID nor the secret key.

**No trailing slash.** Next.js answers `/api/webhooks/paystack/{token}/` with a 308 redirect,
and a webhook sender that does not follow redirects never reaches the route. Copy the URL from
Online Payment Settings rather than typing it; the copy button emits the exact accepted form.

## Intake boundary

The route:

1. Reads the raw request bytes once, with a 1 MB maximum.
2. Verifies `x-paystack-signature` using HMAC SHA-512 and timing-safe comparison.
3. Confirms the signed payload environment matches the key/configuration environment.
4. Hashes the exact raw bytes with SHA-256.
5. Stores a minimized event payload in `GatewayEvent`; unnecessary customer/payment fields are not retained.
6. Deduplicates by provider event ID when present and by provider/environment/payload hash.
7. Returns HTTP 200 only after the inbox insert commits.
8. Schedules best-effort post-response processing; the cron processor remains the durable recovery mechanism.

Invalid signatures are rejected before JSON is trusted or stored. Database failure returns a retryable HTTP 503 instead of falsely acknowledging the event.

Optional source-IP enforcement supports Paystack's published addresses. It is disabled by default because forwarded IP headers are safe only when the deployment's reverse proxy overwrites them:

```text
PAYSTACK_WEBHOOK_ENFORCE_IP="false"
```

## Confirmation boundary

`charge.success` never posts directly from webhook JSON. The worker calls Paystack's verify endpoint using the immutable local reference and checks:

- successful provider status;
- exact reference;
- test/live environment;
- NGN currency;
- exact `requested_amount`;
- exact charged amount disclosed at checkout;
- allocation total equals the school-fee amount;
- platform-managed subaccount matches the snapshotted school subaccount; and
- parent-paid provider fee equals the disclosed snapshotted fee.

Any mismatch moves the transaction to `REQUIRES_REVIEW`; it does not change balances or issue a receipt.

## Atomic ledger posting

A successful verified payment is posted in one serializable database transaction:

- lock the gateway transaction;
- stop if a payment is already linked;
- revalidate allocation ownership and current charge balances;
- create exactly one ordinary `Payment` and receipt number;
- create the ordinary `PaymentAllocation` rows;
- decrement charge balances and set `PAID`/`PARTIAL` status;
- mark the gateway transaction `SUCCEEDED` and link the payment;
- create one consent-aware receipt email in the shared `NotificationOutbox`, protected by a
  school-scoped deduplication key; and
- mark the gateway event processed.

The ordinary finance ledger remains the single source for receipts, balances, reports, and debtors. There is no parallel “online payment” ledger.

## Retry and recovery

Failed processing uses exponential backoff. A worker claim older than ten minutes is recoverable, so a killed cPanel/Node process cannot leave an event permanently stuck in `PROCESSING`.

Set a random server-only value of at least 24 characters:

```text
PAYMENT_CRON_SECRET="<random secret>"
```

Example cPanel cron request, once per minute:

```bash
curl --fail --silent --show-error --request POST \
  --header "Authorization: Bearer $PAYMENT_CRON_SECRET" \
  https://schoolpro.digisoft.com.ng/api/cron/payments/process-events
```

The endpoint processes up to 25 oldest due events per call. Paystack's Webhook Events API or dashboard replay may safely resend missed deliveries because local processing is idempotent.

## Verification evidence

- Prisma migrations `20260925120000_paystack_slice5_webhook` and
  `20260925150000_consolidate_payment_notification_outbox` are applied. The latter removes
  the temporary payment-only outbox in favour of the system-wide notification queue.
- All 22 local migrations are current.
- Webhook security and verification-rule unit suite: 7 tests passed.
- Signed webhook database integration: 4 tests passed.
- Full unit regression: 71 files and 1,412 tests passed.
- Concurrent distinct deliveries for the same transaction produced exactly one payment, one allocation, one balance update, and one notification request.
- A byte change invalidated the signature.
- Forged events were rejected before persistence.
- TypeScript validation passed.
- Next.js production build passed and emitted both webhook routes and the payment cron route.
- No real Paystack request or real-money operation was performed.

## Supported event handling in this slice

- `charge.success`: verified and posted.
- Duplicate/replayed `charge.success`: safely deduplicated or recognized as already posted.
- Other signed event types: durably retained and marked ignored with an explanation until their dedicated refund/dispute/DVA slices exist.

## Next slice

Slice 6 adds the finance gateway transaction register/detail views, operational diagnostics,
controlled reprocessing, clearer family success/failure states, and receipt access. The shared
notification worker can already deliver the receipt outbox row; deployment must schedule
`scripts/drain-notification-outbox.ts` independently of the payment-event processor.

Official references:

- <https://paystack.com/docs/payments/webhooks/>
- <https://paystack.com/docs/api/webhook-events/>
