# Paystack — the integration, concretely

Companion to [payments-and-sms-plan.md](./payments-and-sms-plan.md), which covers the
decisions and the provider choice. This one is the mechanics.

The approved architecture, implementation order, and acceptance gates are in
[paystack-professional-recommendation.md](./paystack-professional-recommendation.md). If a
mechanical example here appears to conflict with that decision record, the recommendation
controls and this guide must be corrected before implementation.

Checked on 24 September 2026 against Paystack's own pages: the API reference
(`paystack.com/docs/api`), the Split Payments, Webhooks and Dedicated Virtual Accounts
guides, and the OpenAPI spec in `PaystackOSS/openapi`. Where the docs disagree with
themselves, that is called out rather than smoothed over. Re-check anything marked
**confirm** before going live.

### What changed from the first draft

1. **`bearer` does not make the parent pay the fee.** It only moves the fee between the
   platform (main account) and the school (subaccount). See *Who pays the fee*.
2. **Check `requested_amount`, not `amount`.** When fees are passed to the customer,
   `amount` includes the fee. Trap 4 is rewritten.
3. **Dispute events are `charge.dispute.*`**, not `dispute.*`.
4. **Transaction `id` is an unsigned 64-bit integer** — store it as `BigInt`/string.
5. **Dedicated virtual accounts do not arrive through your reference.** They need their own
   webhook branch, and they have eligibility rules and a 1,000-account default cap.
6. Added the webhook retry schedule, source IPs, the Webhook Events replay API, and the
   subaccount `settlement_schedule`.

---

## The endpoints you need

| What | Call | Phase |
|---|---|---|
| Start a payment | `POST /transaction/initialize` | 2 |
| Confirm a payment | `GET /transaction/verify/{reference}` | 2 |
| Register a school for settlement | `POST /subaccount` | 2 |
| Bank codes for the subaccount form | `GET /bank` (List Banks) | 2 |
| Replay missed webhooks | Webhook Events API (list / resend) | 2 |
| Give a learner an account number | `POST /dedicated_account/assign` | 4 |
| Chase a late transfer | `GET /dedicated_account/requery` | 4 |

Base URL `https://api.paystack.co` for both test and live — **the key decides the
environment**, not the URL. Authenticate with `Authorization: Bearer sk_…` on every call.
Every response is `{ status, message, data }`; check `status` *and* the HTTP code.

### Initialize

Required: `email`, `amount`.

```
email               the payer — the parent's email
amount              in KOBO (subunit). See the money trap.
reference           your own id. Only - . = and alphanumerics are allowed.
callback_url        overrides the dashboard callback for this transaction
channels            any of: card, bank, apple_pay, ussd, qr, mobile_money,
                    bank_transfer, eft, capitec_pay, payattitude
currency            defaults to the integration currency (NGN)
metadata            a STRINGIFIED JSON object — JSON.stringify it
subaccount          the school's ACCT_… code — settles to their bank
transaction_charge  flat amount (kobo) to the MAIN account, overriding the
                    subaccount's percentage for this one transaction
bearer              "account" (default) | "subaccount" — which of the two
                    Paystack accounts absorbs the Paystack fee
split_code          alternative to subaccount, for multi-way splits
```

Returns `data.authorization_url` (send the parent there), `data.access_code`, and
`data.reference`.

Include `bank_transfer` in `channels`. Checkout then offers the parent a temporary account
number to transfer into, and that payment still carries **your** reference — so Phase 2
already serves transfer-paying parents without waiting for Phase 4.

The NGN transaction minimum is **₦50**.

### Verify

`GET /transaction/verify/{reference}` returns, under `data`, among others:

```
id                 UNSIGNED 64-BIT INTEGER — exceeds JS Number safety; store as BigInt/string
domain             "test" | "live"
status             "success" | "failed" | "abandoned" …
reference
amount             kobo — what was charged, INCLUDING fees if passed to the customer
requested_amount   kobo — what you asked for at initialize
fees               kobo — what Paystack took
fees_split, split, subaccount
channel            card | bank_transfer | dedicated_nuban | ussd | …
currency, paid_at, metadata, authorization, customer
```

In Paystack's own sample, `amount` is 40333, `requested_amount` is 30050 and `fees` is
10283 — exactly the difference. That is the reason trap 4 compares `requested_amount`.

### Subaccount (one per school)

```
business_name       required
settlement_bank     the bank CODE from List Banks, e.g. "058" — not the bank's name
account_number      required
percentage_charge   the PLATFORM's cut: 20 means 20% to the main account,
                    the rest to the school
settlement_schedule auto (T+1) | weekly | monthly | manual
primary_contact_name / _email / _phone, description, metadata
```

The field name is inconsistent across Paystack's pages: the API reference's create sample
uses `settlement_bank`, while the Split Payments guide and the update endpoint use
`bank_code`. Use `settlement_bank` on create; **confirm** against the OpenAPI spec if
Paystack rejects it.

Resolve the account number before creating the subaccount (Verification → Resolve Account
Number) and show the bursar the returned account name to confirm. Paystack is explicit that
it is not liable for payouts to a wrong account.

Store the returned `subaccount_code` against the school. It is not a secret.

---

## Who pays the fee

The plan's decision is *school absorbs* vs *parent pays*. Paystack's knobs map onto it like
this:

| Knob | What it actually does |
|---|---|
| `bearer: "account"` (default) | **You, the platform**, absorb the Paystack fee |
| `bearer: "subaccount"` | **The school** absorbs it — out of their share |
| `percentage_charge` / `transaction_charge` | **Your commission**, not the Paystack fee |
| Passing fees to the customer | **The parent** pays — `amount` rises above `requested_amount` |

So:

- **School absorbs** → `bearer: "subaccount"`. The school's share must be large enough to
  cover the fee, or initialize returns **400 Bad Request** (Paystack calls this an invalid
  split configuration).
- **Parent pays** → either add the fee to `amount` yourself, or use Paystack's
  pass-fees-to-customer behaviour. **Confirm** how that is switched on for your account; if
  it is an account-wide dashboard setting it cannot vary per school, and computing the
  gross-up yourself is the only per-school option.

Either way, the receipt shows tuition and the fee on separate lines — the plan's rule
stands.

---

## Webhooks

- **Header:** `x-paystack-signature`
- **Algorithm:** HMAC **SHA512**, hex
- **Key:** your secret key (`sk_…`)
- **Signed content:** the raw request body

The event name is `event` in the body.

| Event | Meaning |
|---|---|
| `charge.success` | Money arrived — checkout **and** virtual-account transfers |
| `refund.pending` / `.processing` / `.processed` / `.failed` | Refund lifecycle |
| `charge.dispute.create` / `.remind` / `.resolve` | A chargeback |
| `customeridentification.success` / `.failed` | Phase 4: parent identity check |
| `dedicatedaccount.assign.success` / `.failed` | Phase 4: account number ready / refused |
| `transfer.success` / `.failed` / `.reversed` | Payouts, if you ever send money out |

The DVA guide also calls the assignment events `assigndedicatedaccount.success` /
`.failed`. Accept both spellings.

### Retries

A non-200 is a failed attempt.

- **Live:** every 3 minutes for the first 4 tries, then hourly for 72 hours.
- **Test:** hourly for 10 hours, 30-second timeout per attempt.

Return 200 fast, and return 200 on duplicates.

### Source IPs

Paystack sends only from **52.31.139.75**, **52.49.173.169** and **52.214.14.220**, for
both test and live. Treat the signature as the authentication and the IP list as a second
check — if you enforce it, keep it in config, not code.

### Missed events

The Webhook Events API lists every delivery attempt with its payload and your response, and
can resend a single event or every event matching a filter. On cPanel, where Passenger can
be recycled, this is your recovery path: after an outage, resend failed `charge.success`
events instead of reconciling by hand. The idempotency guard makes that safe.

Your first recovery path is the local `GatewayEvent` inbox: a signed event is persisted
before Paystack receives HTTP 200. A cron job processes pending/failed inbox rows. The
Paystack Webhook Events API is the second recovery path for events that never reached the
application at all.

### cPanel

If `.htaccess` rewrites are involved, Paystack's go-live checklist says to include the
trailing `/` in the dashboard webhook URL. Make the route answer both forms.

---

## The traps

Ordered by what they cost.

### 1. Kobo, and the integer rule

`amount` is the subunit: ₦45,000 is `4500000`. `Payment.amount` is `Decimal(12,2)` in naira.

```ts
const kobo = new Prisma.Decimal(naira).times(100)
if (!kobo.isInteger()) throw new Error("Amount is not a whole number of kobo")
const amount = kobo.toNumber()      // safe: school fees are far below 2^53 kobo
// Wrong: Math.round(naira * 100)
```

Coming back, `amount`, `requested_amount` and `fees` are kobo. Divide by 100 into a
`Decimal`, never a float.

### 2. The raw body

```ts
export async function POST(req: Request) {
  const raw = await req.text()                    // before any parsing
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(raw)
    .digest("hex")
  const signature = req.headers.get("x-paystack-signature") ?? ""

  const ok =
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  if (!ok) return new Response("Invalid signature", { status: 401 })

  const event = JSON.parse(raw)                   // only now
  …
}
```

Paystack's own Node sample compares with `==`. Use `timingSafeEqual` anyway.

Exclude the route from the auth middleware in `proxy.ts` — Paystack has no session.

### 3. The reference charset

Only `-`, `.`, `=` and alphanumerics. `BFC/2025/0001` is not legal. Use the
`GatewayTransaction.id` (a UUID) as the reference; `recordStudentPayment` issues the receipt
number afterwards, exactly as for cash.

### 4. Trusting the amount

Compare **`requested_amount`** against the `amountExpected` you stored. Comparing `amount`
would reject every payment where the parent was charged the fee on top.

Then check the fee separately: `amount − requested_amount` should be `0` (school or platform
absorbed it) or equal `fees` (parent paid it). Anything else, flag it.

On a mismatch, refuse the allocation but keep the record and flag it for the bursar. Money
that arrived is money that arrived.

Also check `status === "success"` and `currency === "NGN"`.

### 5. Test money in a live ledger

`data.domain` is `test` or `live`. Assert it matches the key the environment is configured
with, and reject a mismatch loudly.

### 6. The 64-bit transaction id

Paystack's transaction `id` must be treated as an unsigned 64-bit integer. If you store it,
use a Prisma `BigInt` or a string. `JSON.parse` turns large ids into imprecise numbers
silently — if you need the id, read it with a BigInt-aware parser or take it from `verify`
as a string.

The `reference` is what you key on; the `id` is for support tickets.

---

## How it lands in your finance module

The rule from the plan holds: **an online payment becomes an ordinary `Payment` with
ordinary `PaymentAllocation` rows.**

### Checkout payments (Phase 2)

```
Parent opens Fees → picks charges → Pay now
  │
  ├─ create GatewayTransaction  (PENDING, amountExpected, chargeIds, reference = id)
  ├─ POST /transaction/initialize  (reference, subaccount, bearer, channels, metadata)
  └─ redirect to authorization_url

Parent pays on Paystack
  │
  ├─ redirect to callback_url → "thank you, we are confirming"   ← never trust this
  └─ POST /api/webhooks/paystack
        1. verify signature over the raw body
        2. persist GatewayEvent with a dedupe hash and PENDING state
        3. return 200 promptly

Inbox processor (inline best-effort and/or frequent cPanel cron)
  │
  ├─ claim one event without allowing concurrent processors
  ├─ ignore or route events other than charge.success
  ├─ branch on data.authorization.channel:
  │    "dedicated_nuban" → see Phase 4 below
  │    otherwise         → continue
  ├─ call GET /transaction/verify/{reference}
  ├─ load GatewayTransaction; if already SUCCESS → mark event processed, do nothing
  ├─ check status, domain, currency, requested_amount, fee arithmetic and subaccount
  └─ in ONE database transaction:
       lock/recheck GatewayTransaction and intended allocations
       create Payment (ONLINE) + PaymentAllocation through the shared ledger service
       mark GatewayTransaction SUCCESS and store sanitized provider facts
       mark GatewayEvent PROCESSED
       insert one uniquely keyed receipt/SMS outbox request
```

The database constraints and locked recheck are the idempotency guard. Event payload hashes
help reduce repeated work, but are not the financial guarantee.

The callback page can call `verify` to show "paid" sooner — but it only displays. It never
writes a `Payment`. If you want the callback to be able to write, it must go through exactly
the same function as the webhook, behind the same unique constraint.

### Initialization timeout and unknown result

If `POST /transaction/initialize` times out, do not immediately create a different local
transaction. Paystack may have accepted the first request. Keep the original reference in
an `INITIALIZATION_UNKNOWN` state, verify that reference, and only offer a new attempt after
the result is known or the original attempt expires. Every retry that represents a new
checkout receives a new reference.

### Money received after local state changed

Between initialization and confirmation, a bursar or another payment can change a charge
balance. Never discard or pretend to fail money that Paystack confirms. Put the gateway
transaction in `REQUIRES_REVIEW` (or the project's equivalent suspense state), preserve
the received amount and audit trail, and let finance allocate it to remaining charges or
student credit under an explicit policy. Do not over-allocate the original charge.

A school's later suspension also does not erase an already initialized valid payment. Stop
new initialization, but confirm and account for money already received.

### Virtual-account transfers (Phase 4)

These do **not** arrive with your reference. Nobody called initialize, so there is no
`PENDING` row and no `amountExpected`. Paystack creates the transaction and its reference.

The `charge.success` payload identifies the account instead:

```
data.authorization.channel                       "dedicated_nuban"
data.authorization.receiver_bank_account_number  the learner's account number
data.authorization.sender_name / sender_bank     who paid
data.authorization.narration
data.customer.customer_code                      the Paystack customer
```

So this branch:

1. Finds the student by `receiver_bank_account_number` (or `customer_code`).
2. Inserts a `GatewayTransaction` keyed on **Paystack's** reference — same unique
   constraint, same replay protection.
3. Allocates by school policy, since there is no list of chosen charges: oldest unpaid
   charge first is the usual rule. Overpayment becomes credit; decide how credit is held.
4. Calls the same shared allocation path. No second implementation.

Unmatched account number → record, flag, 200. Never lose money that arrived.

### Reuse, do not re-implement

`recordStudentPayment` already validates ownership, refuses over-allocation, draws the
receipt number from `ReceiptSequence` inside a transaction, and writes the allocations. It is
guarded by `requirePaymentRecorder()`, and a webhook has no actor. Extract the body into a
shared function — the same split as `getReceipt` / `loadReceipt` — so the action keeps the
permission check and the webhook calls the inner function with a system attribution.

---

## Dedicated virtual accounts — the constraints

Read these before promising parents an account number.

- **Eligibility.** Only registered businesses in Nigeria or Ghana that have completed
  Paystack's go-live process. Starter businesses cannot use it.
- **Customer validation.** Businesses registered under *Betting*, *Financial services* or
  *General services* may only create accounts for customers whose identity has been
  validated — bank account plus **BVN**. The validated name is used to name the account.
  For a school that is the **parent's** BVN, and Paystack says account creation needs the
  customer's express consent. Settle your business category with Paystack first; it decides
  whether every parent must hand over a BVN.
- **Account cap.** By default up to **1,000** dedicated accounts per business, raisable on
  review. Under the platform-account model the cap is shared across **all** schools. One
  account per family, not per learner, stretches it; ask for the increase early.
- **Account name.** Parents see *Product Name / Customer Name* — your platform's name, not
  the school's. Paystack offers per-client naming for businesses that provide virtual
  accounts as a service, by email request. Ask; a parent will hesitate to send ₦45,000 to
  an account that does not name the school.
- **Settlement.** Pass the school's `subaccount` when creating the account (or add it later
  via `POST /dedicated_account/split`) so transfers settle to the school like checkout
  payments do.
- **Customer uniqueness.** A dedicated account is tied to a Paystack customer, and customers
  are keyed by email. If one parent email is shared across siblings, per-learner accounts
  need a distinct customer per learner. Decide this before assigning any.
- **Late transfers.** Requery triggers a background check that fires the webhook if a
  transfer is found — at most once every ten minutes per account. Good backing for a
  "check my payment" button.
- **Testing.** Use `preferred_bank: "test-bank"` with test keys, and Paystack's demo bank
  app to send test transfers.
- **Inbound transfer approval** (Paystack-Titan accounts only) lets you accept or reject a
  transfer before it completes — but you must answer within **5 seconds** or it is accepted
  automatically, and it is never retried. Not worth it on cPanel; leave it off.

---

## SDK or plain fetch?

**Use `fetch`.** You need a handful of plain JSON endpoints. The official
`@paystack/paystack-sdk` is maintained but small, and your adapter interface
(`initialisePayment`, `verifyPayment`, `parseWebhook`) is a better seam — it is what keeps
Monnify a new file rather than a rewrite.

Useful from `PaystackOSS`:

- **`openapi`** — field names, authoritative:
  `https://raw.githubusercontent.com/PaystackOSS/openapi/main/dist/paystack.yaml`
- **`paystack-cli`** — test the API from the terminal while developing.
- The Postman collection linked from the API reference.

---

## Environment

```
PAYSTACK_SECRET_KEY     sk_test_… then sk_live_…   — server only, never NEXT_PUBLIC
PAYSTACK_PUBLIC_KEY     pk_…                        — only if you use inline checkout
PAYSTACK_ENV            test | live                 — asserted against data.domain
PAYSTACK_WEBHOOK_URL    https://schoolpro.digisoft.com.ng/api/webhooks/paystack
```

Set the webhook URL on the Paystack dashboard (Settings → API Keys & Webhooks), separately
for test and live. Per school, store only the `subaccount_code` in `SystemConfiguration`.

The checkout payer must have a usable email because Paystack requires one at initialize.
Do not invent silently shared placeholder addresses. Validate the parent contact record and
provide a school-approved support path when no email exists. DVA customer identity needs a
separate sibling/family strategy because Paystack customers are keyed by email.

Validate callback URLs against configured application origins; never accept an arbitrary
return URL from the browser. During planned key rotation, document a short deployment
window that can verify in-flight events with the previous secret without allowing it for
new API requests, then remove it after the maximum expected delivery/replay window.

---

## Before go-live checklist

- [ ] Business verified; live keys issued; business category confirmed (affects DVA)
- [ ] Webhook URL set for **live** on the dashboard, publicly reachable, trailing-slash safe
- [ ] Webhook route excluded from auth middleware
- [ ] Signature check over raw body, constant-time compare
- [ ] Signed event stored durably before returning 200; cron drains pending/failed events
- [ ] `(provider, reference)` unique constraint in the migration
- [ ] One-to-one `GatewayTransaction.paymentId` constraint and transactional row recheck
- [ ] `requested_amount`, fee arithmetic, `status`, `currency`, `domain` all checked
- [ ] Subaccount/split checked against the transaction's saved school configuration
- [ ] Paystack `id` stored as BigInt/string, if stored
- [ ] Each school's subaccount created from a resolved, bursar-confirmed account number
- [ ] Fee bearer decided per school and shown on the receipt
- [ ] Parent email requirement, callback allowlist, and initialization-timeout recovery tested
- [ ] Changed-balance/suspense policy and exactly-once notification key implemented
- [ ] Sensitive payload retention/redaction policy approved
- [ ] Recovery runbook: Webhook Events API resend after any outage
- [ ] One real ₦50+ live payment end to end, then refunded

---

## Sources

- API reference: <https://paystack.com/docs/api/> (Transactions, Subaccounts, Dedicated
  Virtual Accounts)
- Split Payments guide: <https://paystack.com/docs/payments/split-payments/>
- Webhooks guide: <https://paystack.com/docs/payments/webhooks/>
- Dedicated Virtual Accounts guide:
  <https://paystack.com/docs/payments/dedicated-virtual-accounts/>
- OpenAPI spec: <https://github.com/PaystackOSS/openapi>
- PaystackOSS: <https://github.com/PaystackOSS>
