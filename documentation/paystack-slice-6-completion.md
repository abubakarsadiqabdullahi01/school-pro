# Paystack Slice 6 Completion Record

**Completed:** 26 September 2026  
**Scope:** Parent payment clarity, finance gateway operations, diagnostics and controlled recovery  
**Status:** Implemented and locally verified

## Parent and student experience

- Checkout discloses school fees, processing fee and total charged before redirecting.
- Success, pending, failed, abandoned and review states have distinct explanations.
- Returning from Paystack never creates a receipt by itself; the screen waits for signed confirmation.
- Confirmed payments link to the same ordinary school receipt used by Finance.
- Parent and student portals share the receipt implementation.
- Receipts identify Paystack channel, payer, gateway reference and parent-paid processing fee.
- Print and generated PDF receipts use the school letterhead and compact to one A4 page.

## Finance operations

Both school administrators and accountants have an **Online Payments** register in Finance.
It provides:

- search by reference, provider transaction ID, payer email, student or admission number;
- status and test/live environment filters;
- pending and attention-required counters;
- immutable school-fee, requested and provider-charged amounts;
- Paystack fee, channel, payer and provider transaction ID;
- snapshotted account mode and fee policy;
- intended fee allocations beside current charge balances;
- linked ledger payment and receipt;
- signed webhook event history, attempts and errors; and
- an operational timeline from checkout creation through verification.

## Controlled reprocessing

Only a user with `finance.manage_gateway` may reprocess an event. The action requires:

- an explicit confirmation;
- a `charge.success` event;
- `FAILED` or `PENDING` event status; and
- the transaction and event to belong to the actor's session-derived school.

The existing event processor still performs Paystack verification, invariant checks,
transaction locking and idempotent ledger posting. The operation is audited. Processed or
ignored events cannot be forced through this control. When no signed event exists, the UI
directs staff to Paystack's Webhook Events replay instead of inventing a local success.

## Safety and usability

- School scope always comes from the authenticated actor, never a query parameter.
- Accountants can investigate but cannot invoke the manager-only recovery control.
- Exception states are named in plain language and visually distinct.
- Tables remain horizontally scrollable on small screens; detail cards collapse to one column.
- Search and filter controls carry accessible labels, and confirmation is a two-step action.
- The in-app guide explains why a redirect is not proof of payment and when not to issue a manual receipt.

## Verification evidence

- Full unit regression: 74 files and 1,476 tests passed.
- Slice 6 MySQL integration: 3 tests passed for school isolation and controlled recovery.
- Slice 5 webhook regression: 4 tests passed for signature rejection, deduplication,
  concurrent confirmation and stale-worker recovery.
- TypeScript validation passed.
- Production build passed.

## Routes

```text
/dashboard/admin/finance/online-payments
/dashboard/admin/finance/online-payments/{transaction-id}
/dashboard/accountant/online-payments
/dashboard/accountant/online-payments/{transaction-id}
```

## Next slice

Slice 7 adds provider-side refund state, dispute events and evidence, settlement matching,
daily gateway-to-ledger reconciliation, exception handling and documented Webhook Events
API recovery.
