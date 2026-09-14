# DigiSchool-Pro HR & Payroll Module Completion

Status: HR and Payroll completed

Date: 2026-08-26

## Purpose

The third module in the finance sequence, built on finance (income) and expenditure
(spending). Paying a payroll run creates an expenditure record, so salaries appear in the
budget summary like any other spending.

It answers:

- Who works in the school.
- What each staff member's salary structure is.
- Which allowances and deductions apply.
- What each person should be paid this month.
- Whether salary has been paid.
- What the payslips and payroll reports say.

## Completed Database Foundation

`Staff`, `StaffConfig`, `SalaryScale`, `StaffSalary`, `AllowanceType`, `DeductionType`,
`StaffAllowance`, `StaffDeduction`, `PayrollRun`, `PayrollItem`, `PayrollItemLine`,
`SalaryPayment`, `PayslipSequence`, `StaffDisciplinaryRecord`.

Enums: `StaffType`, `EmploymentType`, `EmploymentStatus`, `PayrollStatus`,
`PayrollItemStatus`, `PayrollLineKind`, `ComponentKind`, `DeductionTiming`,
`DisciplinaryType`.

Migration: `prisma/migrations/20260826140000_hr_payroll_foundation/migration.sql`, applied.

Two decisions worth knowing:

- **`PayrollItemLine` holds the frozen payslip breakdown.** Every figure is computed once,
  when the run is generated, and written here. Nothing downstream reads the live allowance
  or deduction configuration again. Without it, editing a transport allowance today would
  silently rewrite every payslip ever issued. There is an integration test that changes an
  allowance's value and name after the fact and asserts the payslip is unmoved.
- **`Expense` gained `payeeStaffId`**, so a staff reimbursement points at the person. There
  is deliberately **no `StaffExpense` model**: a reimbursement *is* an expense with a staff
  payee, and routing it through the existing expenditure flow means one approval path, one
  set of reports, and no parallel workflow to keep in step.

## The Pay Computation

`lib/payroll.ts` — pure, no database, no session — with **22 unit tests** in the
database-free suite. This is the one place a mistake lands in somebody's bank account, so
the order of operations is explicit:

1. Base salary is prorated first, if the month was not worked in full.
2. Allowances are computed against the **prorated base**, so a part month scales the whole
   package.
3. Gross = prorated base + allowances.
4. `PRE_TAX` deductions are computed against **gross**. Pension is the usual case.
5. Taxable base = gross − PRE_TAX deductions.
6. `POST_TAX` deductions are computed against the **taxable base**. This is why the two
   timings exist: PAYE is worked out after pension.
7. Net = gross − all deductions.

A negative net is reported, never silently clamped to zero — clamping would hide the
misconfigured deduction that caused it.

## Completed Server Actions

`app/actions/hr.ts`.

Staff: `getStaffDirectory`, `getStaffMember`, `createStaff`, `updateStaff`,
`setStaffEmploymentStatus`, `createDisciplinaryRecord`.

Configuration: `getHrSetupData`, `saveHrConfig`, `createSalaryScale`, `setSalaryScaleActive`,
`createAllowanceType`, `createDeductionType`, `setComponentTypeActive`.

Assignment: `assignStaffSalary`, `assignStaffAllowance`, `assignStaffDeduction`,
`setAssignmentActive`.

Payroll: `generatePayroll`, `submitPayrollForApproval`, `approvePayroll`, `reopenPayroll`,
`cancelPayroll`, `payPayroll`.

Reading: `getPayrollRuns`, `getPayrollRun`, `getPayslip`, `getHrOverview`, `getHrReports`.

Expenditure link: `recordStaffReimbursement`.

## Completed UI Pages

Admin routes:

- `/dashboard/admin/hr`
- `/dashboard/admin/hr/staff`, `/staff/new`, `/staff/[id]`, `/staff/[id]/edit`
- `/dashboard/admin/hr/config`
- `/dashboard/admin/hr/salary-scales`
- `/dashboard/admin/hr/allowances`
- `/dashboard/admin/hr/deductions`
- `/dashboard/admin/hr/payroll`, `/payroll/new`, `/payroll/[id]`
- `/dashboard/admin/hr/payslips/[id]`
- `/dashboard/admin/hr/reports`

Accountant routes mirror these under `/dashboard/accountant/hr`, minus staff creation and
the whole configuration surface, which belong to the admin.

Discipline and exit records live on the staff record rather than a separate page, since
that is where somebody looks for them.

## The Workflow

1. Add staff, assign a salary. Allowances and deductions are optional.
2. Generate the month's payroll. Anyone skipped — no salary on record, not employed that
   month — is named back, not quietly dropped.
3. Review the schedule, adjust one-off allowances or deductions, submit for approval.
4. An admin approves. If `requirePayrollApproval` is off, the run is generated already
   approved, for a school where the admin does everything.
5. An accountant or admin pays. This books an `Expense`, marks every payslip paid, and
   records a `SalaryPayment`.
6. Payslips are available from the run, from the staff record, and by direct link.

## Guards

Each stops a specific way a school pays the wrong amount, and each has an integration test:

- **A second payroll for the same month** is refused — unique on `(schoolId, year, month)`
  at the database level, not just in application code.
- **A salary change never overwrites the previous figure.** The old row is deactivated; the
  history of what somebody earned, and who approved it, survives.
- **A paid run is locked.** It cannot be reopened or paid twice. The only correction is a
  cancellation with a reason, which keeps both the original and the correction visible.
- **A payslip is frozen** at generation and cannot be rewritten by later configuration
  changes.
- **Negative net pay stops the run** unless the school has explicitly opted in.
- **An overdraft stops the payment** unless deliberately allowed, and that choice is
  written to the audit log.
- **An accountant may generate and pay, but never approve**, create a salary scale, or
  change what anybody earns — including themselves.
- **One login cannot be linked to two staff records.**

## Flexible Settings

`StaffConfig`, per school:

| Setting | Effect |
| --- | --- |
| `staffNoPrefix` | Staff numbers issued as `PREFIX-0001` |
| `payrollClosingDay` | Advisory reminder for the office |
| `defaultAccountId` / `defaultPaymentMethod` | Pre-fills the pay dialog |
| `requirePayrollApproval` | Off: runs are generated ready to pay |
| `allowNegativeNet` | Off: generation refuses a negative payslip |
| `prorateFirstMonth` | On: part months are paid pro rata |
| `payslipNote` | Free text at the foot of every payslip |

## Permissions

| | Admin / Super Admin | Accountant | Others |
| --- | --- | --- | --- |
| Staff records, discipline | Yes | Read | No |
| Salary scales, salary assignment | Yes | No | No |
| Allowance / deduction configuration | Yes | No | No |
| Generate payroll | Yes | Yes | No |
| Approve, reopen, cancel payroll | Yes | No | No |
| Pay salaries | Yes | Yes | No |
| Payslips and all reports | Yes | Yes | No |

## Reports

Dashboard (staff counts, latest run, department and employment-type breakdowns, recent
salary payments, and a warning naming active staff with no salary on record), employee
list, salary structure, allowance report, deduction report, department payroll summary,
unpaid salary report, and the monthly salary schedule on the run itself. Print, PDF and CSV
throughout; payslips print and download as PDF.

The allowance, deduction and department figures are summed from the frozen payslip lines,
so the reports always match the payslips.

## Verification

- `npx prisma validate`
- `npm run type-check`
- `npm run lint`
- `npm test` — 136 unit tests, database-free. 22 of them are the pay computation.
- `npm run test:integration` — 64 tests, of which 20 cover HR: the full lifecycle, every
  guard above, proration of a real part month, the frozen payslip, and the expenditure
  link. Fixtures are torn down afterwards.

`npm run build` was not run in this pass: the dev server holds the Prisma query-engine DLL
on Windows, and generating around that lock is what broke the client earlier. Stop the dev
server first, then build.

## Deliberately Left for Later

Per the module plan: staff self-service portal, leave management, attendance-based
deduction, staff loans, recruitment, and advanced tax rules (a real PAYE band table rather
than a flat percentage). Also not built: multi-step approval above a threshold, bulk salary
import, and bank-file export for a bulk transfer.
