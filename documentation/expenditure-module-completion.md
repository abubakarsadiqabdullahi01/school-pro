# DigiSchool-Pro Expenditure Module Completion

Status: Expenditure completed

Date: 2026-08-26

## Purpose

The spending side of the ledger, built on the finished finance module. Finance answers what
came in; expenditure answers where it went, and the two meet in the budget summary.

The module answers:

- What did the school spend money on.
- Who received the money.
- Which account or cash source paid it.
- Who recorded, approved, and released it.
- How much was spent per term and per session.
- What is left after income minus expenditure.

## Completed Database Foundation

- `ExpenseCategory` — with an optional termly budget limit.
- `PaymentAccount` — the payment chart, with an opening balance.
- `Expense` — the transaction and its full approval trail.
- `ExpenseAttachment` — scanned receipts backing a voucher.
- `ExpenseVoucherSequence` — voucher numbering, per school per year.

Enums: `ExpenseStatus`, `PayeeType`, `PaymentAccountType`, `PaymentMethod`.

Migration: `prisma/migrations/20260826120000_expenditure_foundation/migration.sql`, applied
to the development database.

Notes:

- Money is `Decimal(12,2)` throughout, as on the income side. Never `Float`.
- The expenditure enums are real Prisma enums rather than validated strings. They drive a
  state machine and money reports, where a typo would silently corrupt a total.
  `Payment.paymentMethod` on the income side stays a plain `String` — it predates this and
  changing it would mean migrating live receipts.
- The migration also fixes drift the finance migration left: `users.role` gained
  `ACCOUNTANT` but `AuditLog.actorRole` did not, so an accountant's actions could not be
  logged at all.

## Completed Server Actions

Main file: `app/actions/expenditure.ts`.

Setup: `getExpenditureSetupData`, `createExpenseCategory`, `setExpenseCategoryActive`,
`createPaymentAccount`, `setPaymentAccountActive`.

Lifecycle: `createExpense`, `updateExpense`, `approveExpense`, `rejectExpense`,
`markExpensePaid`, `cancelExpense`, `addExpenseAttachment`, `removeExpenseAttachment`.

Reading: `getExpenseTransactions`, `getExpense`, `getExpenditureOverview`,
`getTermlyExpenditureReport`, `getSessionExpenditureReport`, `getBudgetSummary`.

## Completed UI Pages

Admin routes:

- `/dashboard/admin/expenditure`
- `/dashboard/admin/expenditure/categories`
- `/dashboard/admin/expenditure/accounts`
- `/dashboard/admin/expenditure/new`
- `/dashboard/admin/expenditure/transactions`
- `/dashboard/admin/expenditure/transactions/[id]`
- `/dashboard/admin/expenditure/transactions/[id]/edit`
- `/dashboard/admin/expenditure/reports/termly`
- `/dashboard/admin/expenditure/reports/session`
- `/dashboard/admin/expenditure/budget-summary`
- `/dashboard/admin/expenditure/vouchers/[id]`

Accountant routes mirror these under `/dashboard/accountant/expenditure`, minus
`categories` and `accounts`, which are the admin's to configure.

Both trees render the same views from `components/expenditure/views`, parameterised by
`basePath`, exactly as the finance module does.

## The Approval Flow

1. An accountant or admin records the expense. It is saved as a draft, or sent straight for
   approval. A voucher number is issued either way, so it can be referred to from the start.
2. An admin approves or rejects it. Rejection requires a reason.
3. An accountant or admin marks the approved expense as paid. Only then has the money left.
4. A mistake is corrected by cancelling with a reason — never by a silent edit.

The three acts are recorded as three separate people: `recordedBy`, `approvedBy`, `paidBy`.
A small school may have one person do all three; the audit log says so plainly rather than
hiding it.

## Guards

Each exists to stop a specific way a school loses money:

- **Double payment.** A second expense with the same account, payee, amount and date is
  refused until it is explicitly confirmed. A resubmitted form is far more likely than a
  genuine second payment.
- **Editing after approval.** Only a draft or a pending expense can be edited. What was
  approved must still be what was approved.
- **Paying what was never approved.** Only an `APPROVED` expense can be paid, and only once.
- **Overdrawing an account.** A payment that would take the account below zero is refused
  unless the overdraft is deliberately allowed, and that choice is written to the audit log.
- **An accountant approving their own spending.** Approval, rejection, cancellation and
  chart setup all require an admin.

Account balance is computed on read — opening balance less everything paid out — rather than
stored as a running total, so a cancelled payment corrects the balance immediately.

Budget limits are reported against, never enforced. A school that has to fix a burst pipe
should not be blocked by a stationery budget; the report says it went over.

## Reports

- **Dashboard** — term and session totals, the approval position with amounts as well as
  counts, spending by category and by account, recent vouchers, and income against
  expenditure.
- **Transactions** — filtered by session, term, category, account, status, payee, date
  range and amount range. Filters live in the URL, so a filtered list can be shared and
  survives the refresh after approving or paying from it.
- **Termly** — paid, committed and pending totals, category and account breakdowns, budget
  overruns, and the ten largest payments.
- **Session** — term by term with a session total, plus category and account breakdowns.
- **Budget summary** — three balances, because they answer different questions:
  - *Actual*: fees collected, less expenditure paid.
  - *After commitments*: also subtracts approved-but-unpaid spending. The figure to check
    before promising more money.
  - *If all debt is paid*: net expected income, less expenditure paid.

Income figures come from `getAccumulatedFundReport` rather than being recomputed, so the
budget summary can never disagree with the finance report it is derived from. An integration
test asserts that equality directly.

## Permissions

| | Admin / Super Admin | Accountant | Teacher, Parent, Student |
| --- | --- | --- | --- |
| Categories and payment chart | Yes | No | No |
| Record an expense | Yes | Yes | No |
| Approve / reject | Yes | No | No |
| Mark as paid | Yes | Yes | No |
| Cancel or reverse | Yes | No | No |
| Attach a receipt | Yes | Yes | No |
| Remove a receipt | Yes | No | No |
| All reports and vouchers | Yes | Yes | No |

Route enforcement follows the finance pattern: a `layout.tsx` guard per role subtree, since
roles need the user's profile and school and therefore Prisma, which does not run at the
edge.

## Receipts and Vouchers

- A payment voucher for every expense, with print and PDF download. It names the three
  people in the trail rather than leaving blank signature lines, since the system already
  knows who did each part.
- Receipt attachments upload straight from the browser to object storage through
  `/api/expenditure/receipt-upload`, which presigns the URL. The file never passes through
  the server.
- That route is separate from `app/api/s3/upload` on purpose: the existing one hardcodes a
  `school-logos/` key prefix, caps at 1MB, accepts images only, and — worth fixing
  separately — performs no authorization at all.

## Print and Export

Print, PDF and CSV on the transaction list and both reports; print and PDF on vouchers.

The shared helpers moved out of `components/finance` into `components/reports`
(`ReportExport`, `DocumentDownload`, `PrintButton`, `PeriodFilter`) — nothing about them was
finance-specific, and expenditure should not import from the finance module to print a table.

## Verification

- `npx prisma validate`
- `npm run type-check`
- `npm run lint`
- `npm test` — 114 unit tests, database-free.
- `npm run test:integration` — 44 tests, of which 22 cover expenditure: the full lifecycle,
  every guard above, the reports, and the budget summary's agreement with finance. Fixtures
  are torn down afterwards.
- `npm run build` — 134 routes.

## Deliberately Left for Later

Per the module plan, these become their own modules once the core flow is in use:

- Vendor management and procurement, purchase orders.
- Petty cash request and retirement workflows.
- Budget planning with `Budget` / `BudgetLine` models and variance reporting.
- Recurring or scheduled expenses.
- Multi-step approval chains above a threshold — the current flow is one approver.
- Bank reconciliation against statements.

## Next Module Dependency

HR / Payroll / Salary can now begin. Its dependencies are met: finance exposes income,
expenditure exposes payment accounts and a transaction record, and the role permissions
distinguish admin from accountant. A salary payment should create an expenditure record so
that payroll shows up in the budget summary like any other spending.
