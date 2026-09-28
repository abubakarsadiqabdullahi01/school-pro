# Paystack Slice 8 — live pilot controls and runbook

Status: controls implemented locally on 27 September 2026. No live money has moved. The
pilot itself starts only after the test-mode run in section 4 passes.

## 1. What is now implemented

| Control | Where | Rule |
|---|---|---|
| Per-school live approval | Super admin → **Payment Monitor** | A school can switch LIVE on only after DigiSchool approves that school. The school's own switch is still needed; both keys must be turned. |
| Pilot limit | Same screen, set with the approval | Optional ceiling on the school fees in one live checkout. A parent above it is asked to pay less or pay at the bursary. Clear it when the pilot is signed off. |
| Instant revoke | Same screen | Switches the school's live payments off at once and invalidates any quote in progress. A payment the parent already made still confirms and gets its receipt. |
| Two-person refunds | Finance → Online payments → a payment, or Refunds & reconciliation | A user with *Manage online payment gateway* requests; a **different** user with *Approve online payment refunds* approves or rejects. Paystack is called only on approval, exactly once even if two approvers click together. A rejected request can be raised again. |
| Pilot monitor | Super admin → **Payment Monitor** | Per school: connections, live volume for 7 days, stuck checkouts, payments needing review, failed events, open exceptions, refunds awaiting approval, disputes due soon, last reconciliation — with critical/warning alerts. |
| Daily reconciliation job | `POST /api/cron/payments/reconcile` | Same work as the **Run reconciliation** button, for every school with an enabled connection. One failing school does not stop the others. |

New permission: `finance.approve_refunds`. School Managers (and so school admins) have it by
default; the Finance Officer profile does not, so a bursar can request but not approve.

Migration: `20260927090000_paystack_slice8_pilot`. Existing live configurations are **not**
approved by the migration — each school must be approved on the monitor.

## 2. Scheduler setup (cPanel)

Both jobs use the existing `PAYMENT_CRON_SECRET`.

Every minute — webhook recovery (from Slice 5):

```bash
curl --fail --silent --show-error --request POST \
  --header "Authorization: Bearer $PAYMENT_CRON_SECRET" \
  https://schoolpro.digisoft.com.ng/api/cron/payments/process-events
```

Once a day, early morning — settlement reconciliation:

```bash
curl --fail --silent --show-error --request POST \
  --header "Authorization: Bearer $PAYMENT_CRON_SECRET" \
  https://schoolpro.digisoft.com.ng/api/cron/payments/reconcile
```

It returns HTTP 200 when every school reconciled and 207 when at least one failed (the body
lists which). The monitor warns when a live school has gone 26 hours without reconciling.

## 3. Taking one school live

1. The school finishes its **test** connection and passes the test-mode run below.
2. The school admin sets up its **live** connection (Payment settings → Live) and verifies it.
3. Super admin → Payment Monitor → that school → **Approve for live** with a small limit
   (suggested ₦10,000).
4. The school admin switches live payments on.
5. Make the pilot payments in section 5, then clear the limit when they are all signed off.

To stop at any point: **Revoke** on the monitor. Nothing is lost; paid money still posts.

## 4. Test-mode run (before any live money)

Use Paystack **test** keys and a test school. Tick each line and note the reference.

### Payments

| # | Scenario | How | Expected |
|---|---|---|---|
| P1 | Card success | Pay a fee with Paystack test card `4084 0840 8408 4081`, any future expiry, CVV `408` | Status Succeeded; receipt issued; balance reduced once |
| P2 | Pay with Transfer | Choose Transfer in checkout and complete the test transfer | Same as P1, channel shows bank transfer |
| P3 | Cancelled checkout | Open checkout, close it | Parent can retry; nothing posted |
| P4 | Abandoned checkout | Start, wait, then mark abandoned or let it expire | Status Abandoned; nothing posted |
| P5 | Declined payment | Use a Paystack decline test card | Status Failed (not "needs review"); nothing posted |
| P6 | Delayed webhook | Pay, then replay the webhook later from Paystack | Posts once; late event shows as duplicate |
| P7 | Duplicate webhook | Resend the same event | One payment, one receipt, one notification |
| P8 | Partial payment on | Enable partial payments, pay part of a fee | Only that amount allocated; balance shows remainder |
| P9 | Partial payment off | Disable it and try a part amount | Refused before checkout |
| P10 | Parent pays fee | Fee policy "parent pays" | Checkout shows the processing fee; receipt credits the full school fee |
| P11 | School pays fee | Fee policy "school pays" | Parent pays exactly the fee |
| P12 | DigiSchool-managed (subaccount) | School on platform mode | Settlement lands in the school's subaccount |
| P13 | School-owned keys | School on its own keys | Webhook arrives on the school's own URL and posts |
| P14 | Cross-school | Log in as another school's finance user | Cannot see the first school's payments |

### Refunds, disputes, reconciliation

| # | Scenario | Expected |
|---|---|---|
| R1 | Request a refund as user A | Status Requested; nothing sent to Paystack |
| R2 | User A tries to approve | Refused |
| R3 | User B rejects, A requests again | Rejected, then Requested again |
| R4 | User B approves | Sent to Paystack; Pending → Processed by webhook; receipt reversed only then |
| R5 | Refund fails in Paystack | Status Failed; alert on the monitor |
| R6 | Dispute create / remind / resolve | Dispute appears with due date; alert when due within 3 days |
| R7 | Run reconciliation (button and cron) | Settlements imported; a deliberate mismatch raises an exception |

### Pilot controls

| # | Scenario | Expected |
|---|---|---|
| C1 | Switch LIVE on before approval | Refused: "DigiSchool has not yet approved…" |
| C2 | Approve with ₦10,000 limit, pay ₦15,000 | Refused with the limit message |
| C3 | Revoke | Live switched off; monitor shows it |

### Notifications (when SmartSMS credentials are ready)

| # | Scenario | Expected |
|---|---|---|
| N1 | Payment confirmed | Parent receives SMS and email once |
| N2 | SMS provider down | Payment still posts; message retried from the outbox |
| N3 | Email delivered / bounced | Status updated through the SmartSMS email webhook |

## 5. The live pilot (one school, real money)

With the limit in place:

1. One small card payment (e.g. ₦100 against a real fee) — confirm receipt, SMS, email.
2. One small Pay with Transfer payment — confirm as above.
3. Wait for settlement — confirm the amount reached the school's bank and reconciliation is clean.
4. One controlled refund of payment 1 — request, second-person approval, confirm processed and receipt reversed.
5. Run the monitor for a week of normal use with the limit, reconciling daily.
6. Sign-off: school bursar, DigiSchool owner. Then clear the limit.

## 6. Support sign-off

- [ ] Section 4 test-mode run complete, references recorded
- [ ] Both cron jobs running in production
- [ ] Section 5 live payments, settlement and refund verified
- [ ] Monitor shows no critical alerts for 7 days
- [ ] School and DigiSchool sign-off recorded
