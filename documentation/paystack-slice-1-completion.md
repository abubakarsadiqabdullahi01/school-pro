# Paystack Slice 1 Completion Record

**Completed:** 25 September 2026  
**Scope:** Provider-neutral data foundation and shared finance ledger posting  
**Status:** Complete; migration applied to local Docker MySQL

## School setup model

The foundation supports three clear choices without forcing every school to open a
Paystack account.

| School choice | What the school does | Credential ownership | First-release support |
|---|---|---|---|
| No online gateway | Continues using existing cash, POS, cheque, and manually recorded bank transfers | None | Existing behaviour remains available |
| DigiSchool-managed Paystack | Supplies verified business/settlement details; DigiSchool creates a school subaccount | Platform key in the server environment; school record stores only safe subaccount metadata | Recommended and designed as the first enabled mode |
| School-owned Paystack | Opens and verifies its own Paystack account and authorizes a separate connection | School-specific encrypted/vault credential reference | Schema-ready but deliberately not enabled until secure credential storage and routing are implemented |

`accountMode` makes the distinction explicit. A configuration also has its own test/live
environment, status, and `isEnabled` gate. Creating a row never activates payments.

## Implemented

### Provider-neutral schema

Added:

- `SchoolPaymentConfiguration`
- `GatewayTransaction`
- `GatewayTransactionAllocation`
- `GatewayEvent`
- provider, environment, account-mode, fee-policy, allocation-policy, transaction-state,
  event-state, and configuration-state enums

The schema includes:

- separate test/live configuration per school;
- flexible platform-managed and school-owned modes;
- disabled-by-default activation;
- safe credential reference only—no API-secret column;
- configuration snapshots on transactions;
- provider/reference uniqueness;
- one-to-one confirmed `Payment` link;
- relational allocation intent;
- durable webhook event deduplication and retry fields;
- review/suspense transaction state;
- provider transaction IDs stored as strings.

Migration:

`prisma/migrations/20260925010000_paystack_slice1_foundation/migration.sql`

The migration was applied successfully to the local Docker MySQL database on 25 September
2026. Production deployment remains a separate reviewed operation.

### Shared finance ledger service

Added `lib/finance/payment-ledger.server.ts` and changed `recordStudentPayment` to use it.
The service:

- validates school, student, term, charges, positive kobo-precision amounts, and duplicate
  charge rows;
- produces one ordinary completed `Payment` and its `PaymentAllocation` rows;
- allocates a school receipt number atomically;
- uses conditional balance updates to prevent concurrent over-allocation;
- updates charge balances and statuses in the same transaction;
- can run inside a gateway-owned Prisma transaction so future gateway success and ledger
  posting commit or roll back together.

Manual payment permissions and audit behaviour remain in the server action. A future
webhook processor will call the inner transactional function with system attribution.

### State-machine rules

Added tested transaction and webhook-event transition rules in
`lib/payments/gateway-state.ts`. They include:

- unknown initialization recovery;
- late success after browser abandonment;
- review/suspense handling;
- retrying failed inbox events;
- preventing processed events or terminal failures from being reopened incorrectly.

### Environment templates

Added blank Paystack variable names to `.env.example` and `.env.production.example`.
No real credential was written to either file.

## Validation evidence

- Prisma Client generation: passed.
- Prisma schema validation: passed.
- TypeScript `tsc --noEmit`: passed.
- Focused gateway/ledger tests: 24 passed.
- Full unit suite: 61 files, 1,283 tests passed.
- Database-backed finance integration: 21 of 22 checks passed after Docker started. The
  payment/receipt/allocation path passed. The accumulated-fund equality check exposed an
  existing ₦121,500 mismatch in the shared fixture's broader finance data.

## Before deploying the migration

- [ ] Rotate the test secret exposed in chat/screenshot.
- [ ] Put only the replacement value in the local/cPanel environment.
- [ ] Back up the target database.
- [ ] Run `npx prisma migrate status` against the target environment.
- [ ] Review and apply the Slice 1 migration through the normal deployment workflow.
- [ ] Run `npm run test:integration -- --run test/finance-flow.integration.ts` with MySQL available.
- [ ] Confirm manual cash/bank/POS payment still creates one receipt and correct balances.
- [ ] Leave every payment configuration disabled until Slice 2/3 verification is complete.

## Next slice

Slice 2 is the server-only Paystack adapter. It should implement environment validation,
typed response parsing, timeouts, redacted errors, rate-limit handling, and the initial
transaction/subaccount/bank operations. It must use the rotated secret from the environment
and must not yet create public checkout UI.
