# Paystack Slice 2 Completion Record

**Completed:** 25 September 2026  
**Scope:** Server-only Paystack adapter  
**Status:** Complete with mocked contract coverage; live/test API call intentionally deferred

## Implemented

### Provider contract

`lib/payments/contracts.ts` defines provider-neutral inputs and results for:

- initializing checkout;
- verifying a transaction;
- listing Nigerian banks;
- resolving a settlement account;
- creating a school subaccount;
- updating a school subaccount.

Pages and finance rules will depend on this contract rather than Paystack response objects.

### Environment validation

`lib/payments/paystack-config.server.ts` validates:

- required server secret;
- test/live key prefix matching;
- optional public-key prefix matching;
- canonical application origin;
- same-origin webhook URL;
- HTTPS outside localhost;
- bounded request timeout.

No secret is exposed through a `NEXT_PUBLIC_` variable or stored in the database.

### Paystack adapter

`lib/payments/paystack.server.ts` implements:

- `POST /transaction/initialize`;
- `GET /transaction/verify/{reference}`;
- `GET /bank`;
- `GET /bank/resolve`;
- `POST /subaccount`;
- `PUT /subaccount/{code}`.

Controls include:

- fixed Paystack API origin;
- server-only bearer authorization;
- timeouts;
- exact positive integer-kobo validation;
- documented reference-character validation;
- same-origin callback enforcement;
- normalized lowercase payer email;
- top-level Paystack business-status checks even on HTTP 200;
- strict endpoint response validation;
- separate `requested_amount`, charged amount, and fees;
- unsafe numeric transaction IDs discarded rather than persisted incorrectly;
- rate-limit reset/retry metadata;
- retries classified safe only for read-only GET requests;
- no automatic retries for initialize/create/update operations;
- generic operational errors that do not include secrets or request bodies;
- `settlement_bank` on subaccount creation and `bank_code` on update, matching the
  documented Paystack inconsistency.

## Verification

- TypeScript: passed.
- Prisma schema validation: passed.
- Slice 2 adapter/configuration tests: 10 passed.
- Full unit regression: 63 files and 1,311 tests passed.
- Repository secret scan: no real-looking Paystack test-secret pattern found.
- No external Paystack request was made with the secret exposed in chat.

## Local database

The local Docker MySQL container is healthy and both pending migrations were applied:

- `20260925010000_paystack_slice1_foundation`
- `20260925090000_promotion_hr_onboarding`

`prisma migrate status` reports the database schema is current.

The finance integration suite reached MySQL and passed 21 of 22 tests, including payment,
receipt, allocation, balance, debtor, and dashboard flows. Its accumulated-fund equality
check found a ₦121,500 mismatch in the broader shared fixture data. This is recorded as an
existing reconciliation issue and was not hidden by changing balances or weakening the
test.

## Not included yet

- School payment-settings actions or UI.
- Real subaccount creation.
- Parent checkout UI.
- Webhook route or event processor.
- Refund, dispute, or settlement calls.
- School-owned credential encryption.

## Before a real test API call

- Generate a new test secret because the prior value was disclosed in chat/screenshot.
- Store the replacement only in the local/cPanel environment.
- Keep every school configuration disabled.
- Use a dedicated test school and resolved test settlement details.

## Subsequent work

Slice 3 is now implemented. It includes settings permissions, configuration actions, bank
selection/account resolution, platform-managed subaccount setup, masked settlement details,
test/live readiness states, audit history, and encrypted school-owned credentials. See
`documentation/paystack-slice-3-completion.md`.
