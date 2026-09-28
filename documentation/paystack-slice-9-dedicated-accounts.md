# Paystack Slice 9 — dedicated virtual accounts

Status: implemented locally on 27 September 2026 and tested against the real database with
Paystack mocked at the adapter boundary. Not yet run against Paystack test mode: **Paystack
must enable Dedicated Virtual Accounts on each Paystack account first** (request it from
Paystack support for DigiSchool's account, and each school on its own keys does the same).

## Decisions (approved 27 September 2026)

| Decision | Choice |
|---|---|
| Account holder | One account per **student**. A transfer can only belong to that student; siblings each have their own number. |
| Money beyond what is owed | **Held for finance review** as unapplied money; never put on a fee automatically. |
| Schools | Both DigiSchool-managed (settles to the school's subaccount) and school-owned keys. |
| Processing fee | Always deducted from the school's settlement. The parent is credited with exactly what they sent. |

## How it works

1. **Setup** — Finance → Dedicated Accounts → switch on (and, for live, choose Wema or Titan).
   Requires the school's payment connection to be on and verified and, in live, DigiSchool's
   pilot approval (Slice 8).
2. **Creating accounts** — per student, or "Create accounts" in batches of 25. Each student
   becomes a Paystack customer with its own synthetic email
   (`student-<id>@students.<app host>`, overridable with `PAYSTACK_DVA_EMAIL_DOMAIN`) and a
   linked parent's phone number. A parent without a valid Nigerian phone is reported by name;
   the rest of the batch continues.
3. **A transfer arrives** — Paystack sends `charge.success` with channel `dedicated_nuban` to
   the existing webhook. The inbox identifies the school from the receiving account; the
   processor verifies the transaction with Paystack and then, in one serializable
   transaction with the student locked:
   - records a `DEDICATED_ACCOUNT` gateway transaction (sender name and bank kept for tracing);
   - posts one receipt against the student's oldest unpaid charges;
   - holds any excess as unapplied money;
   - emails each linked parent who has email notifications on.
4. **Quarantine** — a transfer with the wrong environment, currency or channel, or that settled
   to a different subaccount, is recorded as *Requires review* and not credited.
5. **Unknown account** — the event fails and retries with backoff; it shows on the Payment
   Monitor. Daily reconciliation also flags any settled transfer with no local record.
6. **Unapplied money** — Finance → Unapplied Money: *Apply to fees* (only once the student owes
   at least the held amount) or *Returned to payer* with a note of how it was sent back.
7. **Parents** see the account number on each child's Fees page.

Migration: `20260927140000_paystack_slice9_dedicated_accounts`. Dedicated accounts are off for
every school until switched on.

## Test-mode checklist (once Paystack enables DVA)

| # | Scenario | Expected |
|---|---|---|
| D1 | Switch on, create one account | Account number and "Test Bank" shown; parent sees it |
| D2 | Batch-create with one parent missing a phone | Others created; that student listed with the reason |
| D3 | Transfer less than owed (Paystack test transfer to the account) | One receipt, oldest charge first |
| D4 | Transfer more than owed | Fees cleared; excess under Unapplied Money |
| D5 | Replay the webhook | No second receipt |
| D6 | Bill a new fee, apply held money | Receipt issued; held row Applied |
| D7 | Mark held money returned | Row Returned with note |
| D8 | Deactivate an account | Status deactivated at Paystack and locally |
| D9 | DigiSchool-managed school | Settlement lands in the school's subaccount |
| D10 | School on its own keys | Webhook arrives on the school's URL and posts |
| D11 | Run reconciliation | DVA transfers match their settlements |

## Gaps closed (27 September 2026)

Migration: `20260927170000_dedicated_account_splits_refunds_identification`.

- **Paystack's fee and DigiSchool's cut** — each DigiSchool-managed school's accounts settle
  through a Paystack *split* (`POST /split`, `bearer_type: subaccount`), created on first use.
  The school's subaccount bears Paystack's fee (a bare `subaccount` would have left the fee on
  DigiSchool's main account) and DigiSchool keeps the platform percentage. Changing the
  platform charge updates the split (`POST /split/{id}/subaccount/add`) before it is saved.
  Split shares are whole percentages, so a fractional percentage is refused for these schools,
  and a flat charge cannot apply to transfers (the charge screen says so).
- **Refunds** — held (unapplied) money can be refunded through Paystack under the same
  two-person rule; the held row closes as Returned when `refund.processed` arrives, and no
  receipt is reversed. When Paystack marks a transfer refund `needs-attention`, finance enters
  the payer's bank account (`POST /refund/retry_with_customer_details/{id}`). A transaction can
  now carry more than one refund (held money, then the applied part).
- **Customer identification** — if Paystack requires it, switch on "Paystack requires payer
  identification". Finance then enters the payer's name (as on the BVN), BVN, bank and account
  number with the payer's consent (`POST /customer/{code}/identification`). None of it is
  stored. `customeridentification.success` creates the account automatically; `.failed`
  records Paystack's reason.

Evidence: 15 DVA integration tests (split settlement, share sync, two-person held-money refund
through needs-attention to processed, identification success and failure) and adapter tests
for every new Paystack call. Test-mode checks to add: D12 split settlement lands with the
school bearing the fee; D13 held-money refund; D14 identification (if Paystack requires it).
