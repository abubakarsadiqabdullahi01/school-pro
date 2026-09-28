# Online payments and SMS — how to build this

A plan, not code. It names the decisions that have to be made before any of it is written,
because two of them take weeks of waiting and should be started today.

> **Document role:** this is the product and rollout plan. Use
> [paystack-professional-recommendation.md](./paystack-professional-recommendation.md) as
> the implementation order and acceptance contract, and
> [paystack-integration.md](./paystack-integration.md) for Paystack endpoint mechanics.
> The numbered phases below describe the combined payments-and-SMS product rollout; they
> are intentionally different from the Paystack-only implementation slices.

---

## Start these now, before any code

Both features are gated on paperwork that is out of your hands. Nothing else here matters
until these are moving.

| What | Who | How long | Why it blocks you |
|---|---|---|---|
| **Business verification** with the payment gateway (CAC certificate, bank account, director ID) | Each school, or you as the platform | 2–10 working days | No live keys until it clears. Test keys work immediately, so development is not blocked — going live is. |
| **SMS sender ID registration** (e.g. `BRIGHTFIELD`) | Per school, through the SMS provider | 1–4 weeks | Nigerian networks reject unregistered alphanumeric sender IDs. Messages appear to send and are never delivered. |
| **DND route approval** | Through the SMS provider | With the sender ID | Explained below. Without it most of your SMS quietly fails. |

The DND point is the one people miss. Since the NCC's 2442 rules, the large majority of
Nigerian mobile numbers have Do Not Disturb switched on, and **DND blocks promotional
routes outright**. A fee reminder sent on a promotional route is accepted by the API,
charged for, and never delivered — no error, no bounce. You need the provider's
transactional/corporate route, which costs more and requires approval. Budget for it and
ask about it in your very first conversation with the provider.

---

## Recommended providers

### Payments: Paystack

**Why:** the cleanest API and webhook model of the Nigerian gateways, and — the part that
actually matters for a school — **dedicated virtual account numbers**. Nigerian parents pay
by bank transfer far more than by card. A per-student account number means a parent
transfers from their own bank app to a number that belongs to their child, and it
reconciles itself. No card, no redirect, no "which child was this for?".

It also has **subaccounts with split settlement**, which solves multi-school cleanly (see
*Whose gateway account?* below).

Two caveats on virtual accounts, from Paystack's own docs: they are only for registered
businesses that have completed go-live, and the default limit is **1,000 accounts per
business** — shared across every school on a platform account. Some business categories
also require each customer (the parent) to be identity-validated with a BVN. See Phase 4
and [paystack-integration.md](./paystack-integration.md).

Ordinary checkout already offers a `bank_transfer` channel — a temporary account number for
that one payment — so transfer-paying parents are served from Phase 2.

Indicative cost: **1.5% + ₦100** on all local channels, capped at **₦2,000**, with the ₦100
waived under ₦2,500 — and **1% capped at ₦300** for a dedicated virtual account. That second
rate is the case for Phase 4; see below. Confirm current rates — they change.

**Alternatives worth a look:**

- **Monnify** — often slightly cheaper and strong on virtual accounts. A fair second choice.
- **Flutterwave** — broader African coverage; more products, a messier API.
- **Remita** — common for government and large institutions. Heavy to integrate. Only if a
  school demands it.

**Do not** design around one provider's SDK. Put the integration behind a small interface —
`initialisePayment`, `verifyPayment`, `parseWebhook` — so a school that insists on Monnify
is a new adapter, not a rewrite of the finance module.

### SMS: Termii

**Why:** Nigerian, handles DND routing explicitly, walks you through sender ID
registration, and offers WhatsApp and voice fallback on the same API. The DND handling is
the deciding factor — it is the thing that breaks SMS in Nigeria.

Indicative cost: ~₦3–4 per page on a transactional route. A page is 160 GSM characters;
accents and emoji drop that to 70, so a stray curly apostrophe can double your bill.

**Alternatives:** Africa's Talking (solid, good docs, pan-African). Avoid Twilio here —
expensive for Nigerian traffic and weaker on DND.

---

## Decisions only you can make

Nothing should be written until these four are settled.

### 1. Whose gateway account?

**Option A — platform account with subaccounts (recommended).** One Paystack account
belongs to you. Each school is a subaccount holding their own settlement bank details.
Paystack splits each payment automatically: the school's share to their bank, your
commission to yours. One secret key to protect. You can charge for the platform.

**Option B — each school brings their own keys.** More setup per school, no commission
path, and you are storing other people's live secret keys — which must then be encrypted at
rest, with a key that is itself not in the database. Only do this if a school insists.

### 2. Who pays the gateway fee?

On ₦45,000 tuition the fee is roughly ₦775. Either the school absorbs it, or it is added to
what the parent pays. Both are normal. Make it a school setting, and whichever you choose,
**the receipt must say so** — a parent who pays ₦45,775 and receives a receipt for ₦45,000
will ring the bursar.

Note that Paystack's `bearer` parameter does **not** decide this. It only chooses whether
the platform (`account`) or the school (`subaccount`) absorbs the fee. Making the parent pay
means adding the fee to the amount — see *Who pays the fee* in the integration doc.

There are really three parties here: parent, school, and you. Your commission is a separate
setting (`percentage_charge` on the subaccount, or a flat `transaction_charge` per payment).

### 3. Part payment?

Can a parent pay ₦20,000 against a ₦45,000 charge? Schools differ. Your `StudentCharge`
model already carries `balance` and `PARTIAL` status, so the data supports it — this is a
policy switch, not a schema question.

### 4. Who may send SMS, and what is the ceiling?

A mis-click that texts 500 parents costs real money. Decide who holds the permission, and
whether there is a per-term cap.

---

## How it fits what you already have

The finance module is in good shape for this, which is why the work is smaller than it
looks.

**`PAYMENT_METHODS` already contains `ONLINE`.** The slot exists.

**`recordStudentPayment` is the single door money comes through.** It validates that the
charges belong to that student and school, refuses an allocation larger than the charge
balance, draws a receipt number from `ReceiptSequence` inside a transaction, and writes
`PaymentAllocation` rows. Every report — debtors, class summary, accumulated fund — reads
the result.

**So the rule for the whole feature is one sentence: an online payment must end up as an
ordinary `Payment` with ordinary allocations.** Not a parallel table the reports learn about
later. If a gateway payment does not appear in the debtors report the moment it clears, the
integration is wrong, however well the checkout works.

### New tables

**`GatewayTransaction`** — the bridge between the gateway and your ledger.

```
id, schoolId, studentId, provider, environment, reference (unique with provider),
amountExpected, amountRequested, amountPaid, providerFee, currency, channel,
status, paymentId?, createdAt, updatedAt
```

The unique constraint on `(provider, reference)` and a one-to-one link to `Payment` stop a
replayed webhook creating a second payment. Do not keep complete provider payloads on this
row; retain only sanitized fields needed for support and reconciliation.

**`GatewayTransactionAllocation`** — the intended charge allocations captured before the
parent leaves for Paystack. Rows, rather than a JSON list of charge IDs, preserve foreign
keys and allow every balance to be revalidated at confirmation time.

**`GatewayEvent`** — the durable webhook inbox. Store the event type, reference, payload
hash, processing state, attempts and a sanitized or policy-protected payload. The webhook
must persist this record before returning 200; a cPanel cron processor can safely finish
the work after a process recycle.

**`SchoolPaymentConfiguration`** — the school's subaccount code, onboarding state, fee and
part-payment policies, enabled channels, and safe masked settlement details. The platform
secret key stays in server environment variables, never in this table.

**`NotificationOutbox`** — every message, queued rather than sent inline.

```
id, schoolId, channel, recipientUserId?, toNumber, body, templateKey,
status, attempts, providerMessageId?, lastError?, queuedAt, sentAt?, deliveredAt?
```

**`NotificationTemplate`** — per school, so a school can word its own reminders.

Plus a `smsOptOut` flag on the parent or user, and a per-school SMS credit balance if you
are reselling credits.

---

## The five things that go wrong

These are the ones that cost real money, so they are worth designing for rather than
discovering.

### 1. Trusting the browser redirect

A parent pays, the gateway redirects them back to `?status=success`, and the app marks the
fee paid. That URL can be typed by hand. **The webhook is the only thing you may believe**,
or a server-side call to the gateway's verify endpoint. The redirect is for showing the
parent a nice page, nothing more.

### 2. Not verifying the webhook signature

Paystack signs the request with an HMAC of the **raw body** using your secret key. If your
Next.js route reads the parsed JSON and re-stringifies it, the hash will not match — key
order and whitespace differ. The route must read the raw body. Plan for that in the route
handler from the start; it is awkward to retrofit.

### 3. Webhook replays creating duplicate payments

Gateways retry until they get a 200, and they sometimes deliver the same event twice.
Without a uniqueness guard a parent is credited twice and the school's books are wrong.

The pending `GatewayTransaction` already exists for checkout. The confirmation processor
locks it, verifies that no `Payment` is linked, and creates the `Payment`, allocations and
success state in one database transaction. Unique constraints on the provider reference
and payment link make concurrent processing race-proof. A duplicate is acknowledged and
does nothing.

### 4. Doing work inside the webhook

Gateways time out in seconds. Verify the signature, persist the event in `GatewayEvent`,
and return 200. Process the durable event through the shared idempotent confirmation
service. On cPanel a frequent cron job is the recovery guarantee; an inline best-effort
attempt may improve speed but must never be the only copy of the event. Queue the receipt
and SMS after the ledger transaction commits, with a unique outbox key so retries cannot
send duplicate confirmations.

### 5. Confusing payment with settlement

The money reaches the school's bank the next working day, not at the moment of payment. The
`Payment` row is correct at webhook time. If the school asks "where is the money", the
answer is the gateway's settlement report, not your accumulated fund. Consider a
`settledAt` field later so the two can be reconciled — do not conflate them on day one.

---

## SMS on cPanel: the queue

Your host has no persistent worker process, so nothing can sit in memory waiting to send.
That is fine, and the outbox pattern is better anyway.

1. Something queues a row in `NotificationOutbox` — a bursar clicking *Send reminders*, or a
   result being published.
2. A **cPanel cron job** runs every few minutes and calls a script that drains the outbox in
   batches, marks each row sent or failed, and records the provider's message id.
3. A second, less frequent job polls delivery reports and updates `deliveredAt`, or a
   delivery webhook does it if the provider offers one.

This gives you retry, an audit of exactly what was sent to whom, and a bill you can explain.
Sending inline from a request would mean a bursar's browser hanging for four hundred
messages, and no record when it failed halfway.

**Normalise phone numbers on the way in.** `08012345678`, `8012345678` and
`+234 801 234 5678` are the same person, and only one of those forms will deliver. Normalise
to `+234…` when a parent is saved, not when a message is sent.

**Count the pages before sending.** Show the bursar "412 recipients, 1 page each, about
₦1,236" and make them confirm. A school that discovers the cost afterwards will not use the
feature again.

---

## Suggested order of work

**Phase 0 — paperwork (start today).** Business verification, sender ID, DND route. Nothing
below can go live without it.

**Phase 1 — notifications, no gateway.** The outbox, templates, phone normalisation, the
cron drain, a manual *Send reminder* on the debtors screen with a cost preview. This is
useful on its own and it proves the queue before money is involved.

**Phase 2 — payments.** Follow Slices 1–8 in the professional recommendation: provider
interface, school configuration, `GatewayTransaction`, allocation intent, durable webhook
inbox, idempotent confirmation, and a *Pay now* button on the parent's fees screen that
uses the shared ledger-posting service extracted from `recordStudentPayment`. Offer the
`bank_transfer` channel at checkout. Test keys throughout, and provide both local inbox
reprocessing and Paystack Webhook Events replay for recovery.

**Phase 3 — automation.** Fee reminders on a schedule, a message when results are released,
a receipt by SMS when a payment clears. These are just triggers writing to the outbox Phase 1
already built.

**Phase 4 — dedicated virtual accounts.** A standing account number, so a parent can
transfer without touching the portal. Highest value for Nigerian schools, and it needs
Phase 2's reconciliation to already be trustworthy.

**The money argument.** A virtual account is charged **1% capped at ₦300**. Every other
local channel — including the `bank_transfer` channel Phase 2 offers at checkout — is
**1.5% + ₦100 capped at ₦2,000**. So Phase 2 serves transfer-paying parents but does not
capture the saving; only a standing account does.

| Termly bill | Checkout, incl. `bank_transfer` | Dedicated virtual account |
|---|---|---|
| ₦52,500 (tuition + levy) | ₦887.50 | **₦300** |
| ₦150,000 | ₦2,000 (capped) | **₦300** |

The virtual-account cap bites almost at once; the checkout cap not until ₦126,000. For 500
learners across three terms that is roughly **₦450,000 a year against ₦1.33m** — about
₦880,000, on identical money.

Two things follow. A school big enough for the fees to hurt is the school that most wants
this, and that saving is the number to put in front of Paystack when you ask for the
1,000-account cap to be raised.

It is more than a new button:

- A transfer arrives with **Paystack's** reference, not yours — there is no pending row and
  no expected amount. The webhook needs a second branch that finds the learner by the
  receiving account number and allocates by school policy (oldest charge first, overpayment
  to credit).
- Eligibility, a possible parent-BVN requirement, and the 1,000-account default cap all
  depend on Paystack approving your business. Per family rather than per learner may be the
  practical unit.
- The account name shows your platform's name unless Paystack enables per-school naming.

Start the Paystack conversation about this during Phase 0, not Phase 4.

---

## What to ask the providers

Take these to the sales call; the answers change the design.

**Payment gateway**
- Current rate and cap for local cards and for bank transfer?
- Subaccounts with split settlement — supported, and what is the fee split model?
- Dedicated virtual accounts — available for our business category? Will parents need BVN
  validation? What cost per account?
- Can the 1,000-account default limit be raised for a multi-school platform, and to what?
- Can virtual-account names show each school's name rather than ours?
- Passing fees to the customer — can it be set per transaction or per subaccount, or only
  for the whole account?
- Settlement timing — T+1? Any holds on new accounts?
- Test environment with full webhook delivery?

**SMS**
- DND/transactional route — available, what approval, what price difference?
- Sender ID registration — cost and typical turnaround?
- Delivery reports — pushed by webhook, or polled?
- Price per page, and what happens with non-GSM characters?
- Do you bill for messages the network never delivered?
