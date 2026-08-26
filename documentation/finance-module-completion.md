# DigiSchool-Pro Finance Module Completion

Status: Finance V1, V2 and V3 completed

Date: 2026-08-26

## Purpose

Provide a complete finance foundation before starting Expenditure, Budget, and HR/Payroll.

The Finance module now answers:

- What each student is supposed to pay.
- What each student has paid.
- What each student still owes.
- How much the school should collect by term/session.
- Which discounts and exemptions reduced expected income.

## Completed Database Foundation

Added finance ledger models:

- `FeeCategory`
- `FeeSchedule`
- `StudentCharge`
- `PaymentAllocation`
- `Discount`
- `FeeExemption`

Extended existing finance support:

- `Payment` can now support allocated receipts.
- `Payment` can link to session, reference number, receiver, and notes.
- `FeeStructure` remains for legacy compatibility.
- `ReceiptSequence` remains the receipt-number source.
- `ACCOUNTANT` role was added to the Prisma role enum.

Migration:

- `prisma/migrations/20260825200000_finance_foundation/migration.sql`
- Applied to the development database. Money is `Decimal(12,2)` throughout, never `Float`.
- `FeeSchedule`'s six-column unique index is prefix-indexed on the id columns. At full
  width it came to 4584 bytes of utf8mb4, past InnoDB's 3072-byte key limit, and the
  migration could not apply at all. The ids are `uuid()`, so a 36-character prefix is the
  whole value and uniqueness is unchanged.

## Completed Server Actions

Main file:

- `app/actions/finance.ts`

Implemented:

- Finance dashboard totals.
- Finance setup data.
- Fee category creation.
- Fee schedule creation.
- Automatic student charge generation from fee schedules, honouring `appliesTo`.
- Student search for finance workflows.
- Student statement data, including school details and payment history.
- Allocated student payment recording.
- Receipt lookup.
- Debtors report with session, term, class, minimum-owed, payment-status and
  new/returning filters.
- Class payment summary.
- Accumulated fund report.
- Charge-level discount application.
- Charge-level exemption application.
- Recent adjustment history.
- Finance staff assignment: create, list and revoke an accountant.

## Completed UI Pages

Admin finance routes:

- `/dashboard/admin/finance`
- `/dashboard/admin/finance/fees`
- `/dashboard/admin/finance/fees/create`
- `/dashboard/admin/finance/student-payments`
- `/dashboard/admin/finance/students/[id]/statement`
- `/dashboard/admin/finance/debtors`
- `/dashboard/admin/finance/class-summary`
- `/dashboard/admin/finance/accumulated-fund`
- `/dashboard/admin/finance/receipts/[id]`
- `/dashboard/admin/finance/exemptions`
- `/dashboard/admin/finance/discounts`
- `/dashboard/admin/finance/staff`

Accountant finance routes — the finance-only area for assigned staff:

- `/dashboard/accountant`
- `/dashboard/accountant/student-payments`
- `/dashboard/accountant/students/[id]/statement`
- `/dashboard/accountant/debtors`
- `/dashboard/accountant/class-summary`
- `/dashboard/accountant/accumulated-fund`
- `/dashboard/accountant/receipts/[id]`

Fee setup and discount/exemption approval have no accountant counterpart on purpose.

Shared views, rendered by both trees and parameterised by `basePath`:

- `components/finance/views/finance-dashboard-view.tsx`
- `components/finance/views/debtors-view.tsx`
- `components/finance/views/class-summary-view.tsx`
- `components/finance/views/accumulated-fund-view.tsx`
- `components/finance/views/student-statement-view.tsx`
- `components/finance/views/receipt-view.tsx`

Components:

- `components/finance/finance-fee-setup-form.tsx`
- `components/finance/student-payment-form.tsx`
- `components/finance/finance-adjustment-form.tsx`
- `components/finance/finance-report-filter.tsx`
- `components/finance/debtors-filter.tsx`
- `components/finance/finance-export.tsx`
- `components/finance/finance-document-download.tsx`
- `components/finance/finance-staff-form.tsx`
- `components/finance/print-button.tsx`

Sidebar:

- Finance navigation for admin and super admin, and a flat finance group for an accountant.
  One `financeLinks` helper feeds all three, so the menu cannot drift from the permissions.

## Completed Workflows

### Fee Setup

- Create fee categories.
- Create fee schedules by session, term, class term, and category.
- Generate student charge records automatically.
- `appliesTo` decides who is billed. New and returning are relative to the session being
  billed and are read from enrolment history: a student is returning if they were enrolled
  in any session that started earlier.

### Student Payment

- Search student, or arrive from the debtor list with the student preloaded.
- View outstanding charges.
- Select unpaid charges.
- Record a payment.
- Allocate receipt payment across selected charges.
- Update charge balance and status automatically.

### Statement

- View student charges.
- View every receipt raised against the student, with date, method and status.
- View amount charged, paid, adjusted, and outstanding.
- Print, or download as PDF.

### Receipt

- View receipt details.
- View fee items paid.
- View remaining student balance.
- Print, or download as PDF.

### Debtors

- View students with outstanding balances.
- Filter by session, term, class, minimum amount owed, payment status, and student type.
- Filters are held in the URL, so a chase list can be shared and survives a refresh.
- Last payment date per student.
- Per-row actions: view statement, or record a payment against that student.
- Print, PDF, or CSV.

### Class Summary

- View expected fees, paid amount, outstanding amount, student count, status counts, and
  collection percentage.
- Filter by term.
- Print, PDF, or CSV.

### Accumulated Fund

- View scheduled fees, discounts, exemptions, net expected income, paid income, and
  outstanding debt.
- Filter by session.
- Print, PDF, or CSV, with the session total as a final row.

### Discounts

- Search student.
- Select unpaid charge.
- Apply fixed or percentage discount.
- Store reason, creator, approver, and amount applied.
- Recalculate charge final amount, balance, and status.

### Exemptions / Free Student

- Search student.
- Select unpaid charge.
- Apply fixed or percentage exemption.
- `FULL` or `PARTIAL` is derived from whether the exemption clears the remaining balance.
- Store reason, creator, approver, and amount applied.
- Recalculate charge final amount, balance, and status.

### Finance Staff

- An admin assigns an accountant from `/dashboard/admin/finance/staff`.
- The account is created with a temporary password, shown once.
- Access is revoked by deactivation, not deletion, so the accountant's name keeps
  resolving on the receipts and approvals that carry it.

## Permissions Implemented

Finance viewer access:

- `SUPER_ADMIN`
- `ADMIN`
- `ACCOUNTANT`

Finance manager access:

- `SUPER_ADMIN`
- `ADMIN`

Payment recorder access:

- `SUPER_ADMIN`
- `ADMIN`
- `ACCOUNTANT`

Route enforcement:

- An admin holds every power in their school, finance included, so finance lives under
  `/dashboard/admin/finance` for them.
- An accountant is assigned finance and nothing else, and gets `/dashboard/accountant`.
  The admin subtree guards to `ADMIN`/`SUPER_ADMIN`, so the accountant needs its own tree.
- Each tree has a `layout.tsx` guard, following the project's convention that roles are
  enforced by server components with database access rather than at the edge.

Current authorization note:

- `ACCOUNTANT` is mapped through the existing `Admin` school profile shape for now. The row
  carries the school; `User.role` decides what can be reached. A separate accountant
  profile can be added later if needed.

## Print and Export Support

- Print buttons on receipts and student statements, with print CSS hiding navigation.
- PDF download for receipts and student statements.
- Print, PDF and CSV on the debtors, class summary, and accumulated fund reports.
- Export money is formatted server-side. PDFs carry `NGN` rather than `₦` because jsPDF's
  built-in fonts are WinAnsi-encoded and have no naira sign; CSV carries bare numbers so a
  spreadsheet reads the column as numbers.

## Defects Found and Fixed

Found by running the module against a database rather than by type-checking it:

- `appliesTo` was stored on a fee schedule and then ignored when generating charges, so a
  new-student registration fee was billed to returning students as well.
- `chargesCreated` reported the number of students considered rather than the number of
  charges inserted. With `skipDuplicates` those differ, so re-running a schedule reported
  charges that were never created.
- `toError` crashed on a `ZodError`. Node's inspect throws on one, and that throw escaped
  the action's own catch block, so every rejected form field surfaced as an unhandled
  server error instead of a message.
- Every finance action resolved its school through `actorSchool`, which threw for a super
  admin — and super admin was the only role the Finance menu was rendered for, so nobody
  could reach finance from the sidebar. It now falls back to the school switcher.
- The `ACCOUNTANT` role was unreachable: no route, no landing page, and no way to create
  such a user.
- Writes revalidated only the admin tree, so an accountant saw stale balances immediately
  after recording their own payment.
- The student statement fetched payment history and never rendered it.
- The finance migration could not be applied at all — see the index note above.

## Verification

Passed:

- `npx prisma validate`
- `npm run type-check`
- `npm run lint`
- `npm test` — 114 unit tests. Deliberately database-free so it runs on a fresh clone.
- `npm run test:integration` — 22 tests driving the real server actions against a real
  database: billing, `appliesTo` splits, allocation, adjustment recalculation, and every
  report, then tearing their fixtures down.
- `npm run build`

## Remaining Future Enhancements

These are not required before starting Expenditure:

- Statement as a running ledger with an opening balance and a balance after each
  transaction, rather than separate charge and payment tables.
- Session/term filter on the finance dashboard, plus top debtor classes and payment
  summary by class shown there.
- Term-wide or session-wide exemption, rather than per-charge only.
- Session-wide roll-up on the class payment summary.
- School logo on the receipt, and a confirmed receipt-number uniqueness rule per school
  per year.
- `CANCELLED` charge status is in the enum but nothing sets it.
- Advanced report date ranges.
- Payment reversal/refund workflow.
- Parent/student fee self-service.
- Online payment gateway.
- SMS/email payment reminders.
- Sibling discount automation.
- Bulk fee import.

## Next Module Dependency

Expenditure can now begin because Finance exposes the income side needed for budget
reporting:

- actual paid income
- net expected income
- outstanding debt
- term/session accumulated fund
