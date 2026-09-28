# Paystack Slice 3 Completion Record

**Completed:** 25 September 2026  
**Scope:** Per-school payment onboarding and activation controls  
**Status:** Implemented and locally verified; real Paystack account operations require a newly rotated test secret

## Flexible school choices

The payment settings screen supports three deliberate choices per school and per environment:

1. **Offline only** — the existing cash, POS, cheque, and manually recorded transfer workflow remains available.
2. **DigiSchool-managed Paystack** — DigiSchool owns the API connection, while Paystack settles each school's money to that school's verified bank account through its own subaccount.
3. **School-owned Paystack** — the school owns its Paystack merchant account, secret key, settlement settings, refunds, disputes, and dashboard access.

Test and live configurations are separate. Saving a mode, bank account, credentials, or policy never activates online payments. Verification and an explicit activation confirmation are separate operations, and live activation is blocked until test setup is verified.

## Implemented

- Admin-only `finance.manage_gateway` permission and authorization on every settings action.
- A guided Online Payments page under School Settings.
- Per-school and per-environment configuration isolation.
- Paystack bank listing and account-name resolution.
- Platform-managed subaccount creation/update using the school's verified settlement account.
- School-owned credentials verified with a read-only Paystack request before persistence.
- AES-256-GCM encryption for school-owned secrets using an environment-only 32-byte master key.
- Per-school opaque webhook selector; no school ID or secret is placed in the URL.
- Masked secrets and settlement accounts; full account numbers and secret keys are not returned to the browser or stored in audit records.
- Card and Pay-with-Transfer policy, fee-payer policy, and partial-payment policy.
- Parent email-readiness summary with a remediation message for accounts that cannot start checkout.
- Explicit disable/enable workflow with server-side readiness checks.
- Audit entries for mode changes, connection verification, policy changes, and activation changes.

## Activation invariants

Online payments cannot be enabled unless:

- the connection status is `READY` and has a verification timestamp;
- platform-managed mode has a Paystack subaccount;
- school-owned mode has an encrypted credential record;
- at least one supported channel is configured; and
- a live configuration has a verified test configuration.

The activation policy is a pure tested rule and is enforced again on the server. The UI is guidance, not the security boundary.

## Data protection

`PaymentGatewayCredential` stores ciphertext, an initialization vector, an authentication tag, the last four key characters, an optional public key, and a random webhook token. The encryption master key is never stored in the database. AES additional authenticated data binds each ciphertext to its configuration ID and key version, so copying encrypted data to another school/configuration will not decrypt.

Required deployment variable:

```text
PAYMENT_GATEWAY_ENCRYPTION_KEY=<base64 encoding of exactly 32 random bytes>
```

The previously disclosed Paystack test secret was not used or persisted by this work. Generate a replacement before performing real test-mode bank resolution or subaccount creation.

## Verification evidence

- Prisma migration `20260925100000_paystack_slice3_onboarding` applied successfully.
- Prisma reports all 19 local migrations current.
- TypeScript validation passed.
- Payment unit suite: 28 tests passed.
- Slice 3 database integration: 3 tests passed.
- Full unit regression: 65 files and 1,321 tests passed.
- Next.js 16 production build compiled, type-checked, and generated successfully.
- Two independent test schools retained separate subaccount/bank configuration.
- A school-owned secret was encrypted at rest and could not be decrypted under another configuration ID.
- Database uniqueness allows one test and one live configuration per school/provider and rejects duplicates.

## Deliberately not in Slice 3

- Parent checkout initialization (Slice 4).
- Webhook receipt and ledger confirmation (Slice 5).
- Refunds, disputes, settlements, and reconciliation operations (later slices).

The school-owned webhook URL is generated now so onboarding is stable, but it must not be entered into Paystack until the signed webhook receiver in Slice 5 is deployed.

## Subsequent work

Slice 4 is now implemented. It includes parent charge selection, authoritative balance
revalidation, immutable pending transaction/allocation rows, server-side checkout
initialization, redirect/status handling, unique references, and safe retry/abandon
behaviour. See `documentation/paystack-slice-4-completion.md`.
