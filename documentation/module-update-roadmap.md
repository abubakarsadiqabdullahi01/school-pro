# DigiSchool-Pro Module Update Roadmap

Source reviewed: `C:\Users\user\Downloads\DigiSchool-Pro Documentation.docx`

This roadmap freezes the module scope before implementation. It separates what already exists in the current app from what must be added or renamed for DigiSchool-Pro.

## 1. Product Rename

Status: Completed. See `documentation/branding-module-completion.md`.

Changes:
- Rename visible brand from `SchoolPro` to `DigiSchool-Pro`.
- Update landing page, sidebar logo text, dashboard metadata, support emails/placeholders, documentation titles, and app/page metadata.
- Keep database table/model names unchanged unless there is a strong technical reason; user-facing rename is enough.

Do not remove:
- Existing school/admin/teacher/student/parent features.

## 2. Existing Core Modules To Keep

These already exist and should stay:
- Super Admin: schools, sessions, terms, users, analytics, system settings.
- Admin/Manager: school calendar, school settings, sessions, terms, classes, subjects, teachers, students, parents.
- Teacher: assigned classes, attendance, subjects, compiler/score entry.
- Student: dashboard, academic overview.
- Parent: child overview and early payment summary placeholder.
- Compiler: CA entry, subject result entry, class result, termly result, report card, transitions.

Needed cleanup before new modules:
- Keep the new super-admin school switcher and continue applying selected-school filtering to remaining super-admin list pages.
- Remove/avoid duplicate school data in test seed where the same school name is repeated with different codes unless intentionally used as a duplicate-name test case.
- Keep compact card/table layout rules already applied to admin dashboard, calendar, sessions, and terms.

## 3. Compiler Module Update

Status: Existing module, needs expansion.

Add:
- Cumulative result across First, Second, and Third Term.
- Promotion/demotion engine using configurable criteria:
  - Average across 3 terms.
  - Number of credit/pass subjects.
  - Optional required core subjects.
  - Optional attendance/behavior override later.
- Performance analytics:
  - Student performance across entire session.
  - Class performance.
  - School-wide performance.
  - Subject performance.
  - Best/improved/declining students.
  - Subject difficulty/failure-rate ranking.
- Result status workflow:
  - Draft.
  - Reviewed.
  - Published.
  - Locked.

Reuse existing:
- `Assessment`, `StudentClassTerm`, grading system, assessment scheme, report card, transitions.

Avoid:
- Creating a second result engine. Extend the existing shared result utilities in `lib/results`.

## 4. Finance Module

Status: Finance V1/V2/V3 completed. See `documentation/finance-module-completion.md`.

Existing foundation:
- `FeeStructure`
- `Payment`
- `ReceiptSequence`
- `PaymentStatus`
- Student and school relations to payments.

Add database/models:
- Fee category/type:
  - Tuition.
  - Registration.
  - Optional fee.
  - Other charges.
- Student fee assignment/invoice:
  - Student, class term, term/session, fee lines, discounts, exemptions, status.
- Student fee exemption/free-student record:
  - Full exemption or fee-category-specific exemption.
  - Reason, approved by, date.
- Discount:
  - Fixed amount or percentage.
  - Per student, per fee, per invoice, or per term.
- Payment allocation:
  - One payment can settle one or more fee lines.
  - Supports partial payment.
- Receipt:
  - Receipt number, payment method, reference, cashier/user, printable receipt.
- School account/payment channel:
  - Bank/cash/POS/transfer account.

Add pages:
- Finance dashboard.
- Fee schedule by class for returning students.
- Registration fee schedule by class for new students.
- Optional fees setup.
- Student payment/search page.
- Student statement of account.
- Debtors by class.
- Payment status by class, term, and session.
- Accumulated funds report:
  - Scheduled fees.
  - Paid amount.
  - Outstanding amount.
  - Term summary.
  - Session summary.
- Receipts list and receipt print/export.

Rules:
- Money must stay `Decimal`, not `Float`.
- All finance records must be scoped by school.
- Do not delete payment records; void/reverse them with audit trail.
- Do not let finance depend only on `FeeStructure`; add invoice/assignment records so historical fees do not change when a fee schedule is edited.

## 5. Expenditure Module

Status: Missing.

Add database/models:
- Expense category/type.
- Vendor/payee.
- School account/source.
- Expense transaction.
- Expense attachment/reference.
- Budget period and budget line.
- Optional approval workflow.

Add pages:
- Expenditure dashboard.
- Expense type configuration.
- Payment chart/account setup.
- Expenditure entry page:
  - Payee name.
  - New or existing payee.
  - Transaction description.
  - Account source.
  - Payee account details.
  - Amount.
  - Reference/transaction ID.
  - Auto timestamp.
  - Issuer/clearing manager.
- Transaction list by term/session/date.
- Total spent by term/session.
- Budget summary:
  - Income from school fees.
  - Total expenditure.
  - Balance carried forward.

Rules:
- Expenses should not be mixed into student `Payment`.
- Expenses should share school account records with Finance.
- Use approval/void flow, not hard delete.

## 6. Human Resource And Payroll Module

Status: Teacher records exist, but HR/payroll is missing.

Existing foundation:
- `User`
- `Teacher`
- `Admin`

Add database/models:
- Employee profile:
  - Links to user where login is needed.
  - Allows non-teaching staff.
  - Staff ID, department, designation, employment type, hire date, status.
- Employee finance/payment details:
  - Bank/account name/account number.
  - Pension/tax identifiers where needed.
- Staff config/format:
  - Staff ID format.
  - Staff categories.
  - Departments/designations.
- Allowance config.
- Deduction/tax/due config.
- Salary scale/grade.
- Payroll period.
- Payroll run.
- Payroll item/line:
  - Basic salary.
  - Allowances.
  - Deductions.
  - Tax.
  - Net pay.
- Salary payment record.
- Staff expense/reimbursement.
- Staff revenue/charge record.
- Disciplinary record.

Add pages:
- HR dashboard.
- Employee list.
- Employee create/edit/details.
- Staff configuration.
- Allowance configuration.
- Salary scale.
- Tax/due configuration.
- Staff expenses.
- Staff revenue.
- Salary schedule.
- Payroll run/payment command.
- Staff payslip.
- Monthly payroll report.
- Salary structure report.
- Staff information report.
- Disciplinary list.

Rules:
- Rename document typo `Dispassion List` to `Disciplinary List`.
- Do not force every employee to be a teacher.
- Teacher should either link to Employee or remain a teaching profile for academic assignments.

## 7. User Roles And Permissions Update

Status: Current role enum is too broad for the new modules.

Existing roles:
- SUPER_ADMIN
- ADMIN
- TEACHER
- PARENT
- STUDENT

Add permission model rather than many hardcoded roles:
- Role templates:
  - School Admin/Manager.
  - Exams Officer.
  - Accountant/Finance.
  - HR/Payroll Officer.
  - Teacher.
  - Parent.
  - Student.
- Permission groups:
  - School setup.
  - Calendar management.
  - Academic structure.
  - Student records.
  - Staff/employee records.
  - Exams/compiler.
  - Finance setup.
  - Payment collection.
  - Expenditure.
  - Payroll.
  - Reports/printing.
  - User management.

Important rule from document:
- Only Manager/School Admin should configure:
  - School calendar.
  - Fee schedules.
  - Salary configuration/payment.
  - Accumulated funds.
  - Total expenditure.
  - School budget.

Recommendation:
- Keep `Role.ADMIN`, but add permission profiles for `MANAGER`, `EXAMS`, `FINANCE`, and `HR`.
- Superseded for finance (2026-08-26): `ACCOUNTANT` is now in the Prisma `Role` enum, with
  the permission design it was waiting on — viewer, manager and payment-recorder tiers in
  `app/actions/finance.ts`, a guarded `/dashboard/accountant` subtree, and assignment by an
  admin from Finance Staff. The advice still stands for `EXAMS` and `HR`: do not add a role
  to the enum before deciding what it may reach.

## 8. What To Remove Or Avoid

Remove/avoid:
- Duplicate visible headers on list pages.
- Oversized dashboard cards where tables/forms need more space.
- Finance links in parent/student UI that point to unfinished pages.
- Any direct edit of historical fee schedule that changes old invoices.
- Hard deleting financial, expenditure, payroll, or result publication records.
- Creating separate staff tables for teachers/admins/accountants without a shared employee profile.
- Duplicating result calculation logic outside shared `lib/results`.

Keep:
- Existing academic core.
- Existing user roles as login categories.
- Existing `FeeStructure` and `Payment` as foundation, but extend with invoice/allocation models.

## 9. Recommended Implementation Order

Phase 1: Scope and permissions
- Add permission profile design.
- Decide Manager, Exams, Finance, HR access.
- Add sidebar/navigation gating.
- Rename to DigiSchool-Pro.

Phase 2: Finance foundation
- Add invoice/fee assignment, fee categories, discounts, exemptions, accounts, receipts.
- Build finance actions with tests.
- Build finance dashboard and fee schedule pages.

Phase 3: Payment workflow
- Student search/payment page.
- Statement of account.
- Debtors.
- Payment summaries.
- Receipt print/export.

Phase 4: Expenditure
- Expense categories, payees, school accounts, transactions.
- Expenditure dashboard and reports.
- Budget summary.

Phase 5: HR/payroll
- Employee profile.
- Staff config.
- Salary scale, allowance, deduction, tax/due setup.
- Payroll run and payslip.

Phase 6: Compiler advanced analytics
- Cumulative 3-term result.
- Promotion/demotion criteria.
- Performance analytics.
- Publish/lock workflow.

Phase 7: Full QA before deployment
- Seed complete test data.
- Test each role.
- Test each module data flow.
- Test report/export/print flows.
- Run `npm run type-check`, `npm run lint`, and targeted tests.

## 10. Open Decisions Before Implementation

Confirm these before database migration:
- Should `School Admin/Manager` be the same as current `ADMIN`, or should one school have multiple admin profiles with different permissions?
- Should finance payments be term-only, session-wide, or support admission-to-date outstanding balances?
- Should optional fees be opt-in per student or assigned to everyone then waived?
- Should salary be monthly only, or support weekly/contract payments?
- Should expenditure approval require one or two approvers?
- Should cumulative result promotion use average, credits, required subjects, or a combination by school?
