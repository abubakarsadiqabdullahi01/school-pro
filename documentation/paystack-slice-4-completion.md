# Paystack Slice 4 Completion Record

**Completed:** 25 September 2026  
**Scope:** Parent checkout initialization and pending status  
**Status:** Implemented and locally verified with a mocked provider boundary

## Implemented flow

1. A linked parent selects one or more outstanding charges from a child's fee page.
2. The server proves the parent-child relationship and loads the payer email from the authenticated account.
3. The server reloads every charge from the database, verifies school/student ownership, payable status, term consistency, current balance, and the school's partial-payment policy.
4. A quote separates school fees, any parent-paid processing fee, and the checkout total.
5. On confirmation, a serializable transaction rechecks balances and the payment-configuration version, rejects conflicting active attempts, and creates one `GatewayTransaction` plus immutable allocations.
6. Only after that local reservation commits does the server initialize Paystack.
7. The parent is redirected only to an HTTPS `checkout.paystack.com` URL returned by the server adapter.
8. The callback/status page treats the browser return as pending evidence—not proof of payment.

## Safety controls

- Parent-child authorization is server-side and cannot be supplied by the browser.
- School scope comes from the authenticated parent profile.
- The payer email comes from the authenticated credential record, not a checkout field.
- Checkout environment comes from `PAYMENT_CHECKOUT_ENV`, not a URL or form.
- Duplicate charge IDs and mixed-term selections are rejected.
- Amounts are converted from Decimal naira to exact whole kobo; floating-point currency arithmetic is not used.
- The same active charge cannot receive another checkout attempt; repeated clicks return the existing attempt.
- References use a timestamp plus 72 random bits and remain protected by the existing provider/reference unique constraint.
- Configuration version, account mode, channels, fee policy, subaccount, pricing assumptions, and allocations are snapshotted.
- A changed/disabled gateway configuration aborts initialization.
- Network/5xx uncertainty becomes `INITIALIZATION_UNKNOWN`; the code never blindly retries a Paystack write.
- A definite provider rejection becomes `FAILED`.
- Closing an attempt does not claim to cancel Paystack; replacement checkout stays blocked until the original attempt expires.
- Status refresh uses Paystack's read-only verify endpoint.
- Environment, currency, requested amount, and returned subaccount are checked before status may advance. A mismatch becomes `REQUIRES_REVIEW`.
- A provider `success` response advances only to `PROCESSING`. It cannot create a receipt or change fee balances in Slice 4.
- Only the signed webhook and idempotent ledger processor in Slice 5 may create the completed payment.

## Fee handling

When the school absorbs fees, the parent's checkout total equals the selected school fees.

When `PARENT_PAYS_GROSS_UP` is selected, the quote uses Paystack's currently published standard Nigerian local pricing: 1.5% plus ₦100, the ₦100 waived below ₦2,500, and a ₦2,000 cap. The algorithm finds the smallest whole-kobo total that leaves the exact school-fee value after the calculated fee. The rate and calculated fee are snapshotted on the transaction.

Schools with negotiated or education pricing must keep **School absorbs** selected until their exact contracted channel pricing is configured. Paystack currently advertises different education pricing, and silently applying the standard formula to a discounted account could overcharge the parent.

Official references:

- <https://paystack.com/pricing>
- <https://support.paystack.com/en/articles/2130306>
- <https://paystack.com/docs/payments/accept-payments/>

## User experience

- Online payment appears only when the school's selected test/live gateway is enabled and ready.
- Parents see school fees, processing fee, and total before leaving DigiSchool.
- Test checkout is visibly marked as test mode.
- The pending screen offers a safe return to the existing Paystack session, a read-only status refresh, and a clearly explained close action.
- No receipt is shown until a confirmed ledger payment exists.

## Environment

```text
PAYMENT_CHECKOUT_ENV="TEST" # local/staging
PAYMENT_CHECKOUT_ENV="LIVE" # production
```

Production defaults to `LIVE`; non-production defaults to `TEST`. Setting it explicitly is recommended.

## Verification evidence

- Checkout/payment unit suite: 35 tests passed across the final focused files.
- Slice 4 database integration: 5 tests passed.
- Full unit regression: 66 files and 1,329 tests passed.
- TypeScript validation passed.
- Next.js 16 production build compiled, type-checked, and generated the checkout/status routes successfully.
- The integration suite proved linked-parent authorization, exact balance quoting, immutable allocation persistence, duplicate-attempt reuse, and unique provider references.
- No real Paystack request or real-money operation was performed.

## Subsequent work

Slice 5 is now implemented. It adds raw-body HMAC verification, the durable webhook inbox,
idempotent verify-and-post processing, atomic receipt/allocation/charge updates, fast
acknowledgement, and scheduled recovery. See `documentation/paystack-slice-5-completion.md`.
