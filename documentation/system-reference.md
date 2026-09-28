# DigiSchool-Pro — system reference

Everything the system does, in the order it does it, and the rules that are not obvious from
the schema. Written against the codebase as it stands on `feat/finance-module`.

If you want to see all of this working rather than read about it, run `npm run seed:demo`:
it builds a full school year through the same code paths described here and then verifies
28 invariants against what it built.

---

## 1. What this is

A multi-tenant school management system for Nigerian secondary schools. One deployment holds
many schools; a **super admin** operates the platform, and each school is run by its own
**admin** with staff under them.

- **Stack** — Next.js 16 (App Router, Turbopack), React 19, Prisma 6 on MySQL 8 via the
  MariaDB adapter, NextAuth v5 (JWT sessions), Tailwind + shadcn/ui.
- **Server actions, not REST.** Business logic lives in `app/actions/*.ts`, each file a
  module. There is almost no `app/api` surface beyond auth.
- **Pure logic is extracted.** Anything that decides money, grades or eligibility lives in
  `lib/` as a plain function with no database and no session, so it can be unit-tested and
  reused. That is why the seed can build realistic data without reimplementing a single rule.

### Local setup

```bash
docker compose up -d          # MySQL 8 on host port 3307
npm install
npx prisma migrate deploy
npm run seed:super-admin      # needs SUPER_ADMIN_PASSWORD + SECOND_SUPER_ADMIN_PASSWORD
npm run seed:demo             # the full school year
npm run dev                   # http://localhost:3010
```

---

## 2. Identity, roles and permissions

### Two separate things

**Role** is the account category on `User.role`. It decides which dashboard you land on and
which navigation you see.

| Role | Lands on | Meaning |
|---|---|---|
| `SUPER_ADMIN` | `/dashboard/super-admin` | Platform operator, above any school |
| `ADMIN` | `/dashboard/admin` | Runs one school |
| `ACCOUNTANT` | `/dashboard/accountant` | Finance-facing login |
| `TEACHER` | `/dashboard/teacher` | Classroom |
| `PARENT` | `/dashboard/parent` | Their children only |
| `STUDENT` | `/dashboard/student` | Themselves only |

**Permission** is what you may actually do, from `lib/permissions.ts`. Roles carry a base
set; `PermissionProfile` rows grant more. The two combine in
`resolveEffectivePermissions(role, profiles)`.

The 19 permissions:

```
school.manage        users.manage         students.manage      teachers.manage
parents.manage       academics.manage     compiler.enter_scores
compiler.review_results   compiler.publish_results   compiler.lock_results
compiler.configure_policy finance.setup    finance.collect_payments
finance.view_reports expenditure.manage   expenditure.approve
payroll.manage       payroll.pay          reports.export
```

Four system profiles ship with every school: **MANAGER** (all 19), **EXAMS**, **FINANCE**,
**HR**.

> **The point of this split:** an exams officer and a principal both log in as `ADMIN`. The
> role is identical; the profile is what separates them. If you are wondering why someone
> can see a menu but gets bounced from the page behind it, you are looking at a role/profile
> mismatch — and `components/app-sidebar.tsx` deliberately hides groups whose contents would
> all refuse the user.

### Login

`Credential` is separate from `User`, so one person can have several ways in:

- `EMAIL` — everyone
- `REGISTRATION_NUMBER` — students sign in with their admission number
- `PHONE`, `PSN` — supported by the schema

Throttling lives in `lib/login-throttle.ts` with `LoginAttempt` and `LoginSession` behind it.
`requireActor()` in `lib/authz.ts` re-checks `isActive` on every call, because a JWT lives 30
days and a deactivated account must not keep working until it expires.

---

## 3. Module map

| Module | Actions file | What it owns |
|---|---|---|
| School management | `school-management.ts`, `school-settings.ts` | School record, branding, admission number format |
| Calendar | `session-management.ts`, `term-management.ts`, `school-calendar.ts` | Sessions, terms, which term is current |
| Academics | `class-management.ts`, `subject-management.ts`, `class-term-management.ts` | Classes, subjects, class terms, subject offerings |
| Students | `student-management.ts` | Admission, enrolment, profiles |
| Parents | `parent-management.ts`, `parent-portal.ts` | Parent accounts, child links, the family view |
| Teachers | `teacher-management.ts`, `teacher-assignment.ts` | Staff records, form-teacher and subject assignment |
| Compiler | `compiler.ts`, `compiler-improved.ts`, `teacher-compiler.ts`, `teacher-assessments.ts` | Score entry, result sheets, the publish workflow |
| Transitions | `student-transitions.ts` | Promotion, transfer, withdrawal, promotion policy |
| Finance | `finance.ts` | Fee categories, schedules, charges, payments, receipts, debtors |
| Expenditure | `expenditure.ts` | Expense categories, payment accounts, vouchers |
| HR & Payroll | `hr.ts` | Staff, salary scales, allowances, deductions, payroll runs, payslips |
| Permissions | `permissions.ts`, `user-management.ts` | Profiles and assignment |
| Reports | `analytics.ts`, `student-reports.ts` | Dashboards, report cards |

### The shared logic worth knowing about

These are pure or near-pure and are the single source of truth for their rule:

| File | Decides |
|---|---|
| `lib/fee-charges.ts` | Which fee schedules an enrolment attracts |
| `lib/fee-charges.server.ts` | Raises those charges inside the caller's transaction |
| `lib/grading.ts` / `.server.ts` | Score → grade band, from the school's own system |
| `lib/results/class-term-results.ts` | Subject totals, averages, class positions |
| `lib/results-visibility.ts` | What a family may see (`PUBLISHED_ONLY`) |
| `lib/promotion.ts` | Whether a student may go up |
| `lib/payroll.ts` | Base, allowances, pre/post-tax deductions, net |
| `lib/money.ts` | Decimal handling — money is never a float |
| `lib/permissions.ts` | Role + profile → effective permissions |

---

## 4. Data model, in the order things depend on each other

```
School
 ├─ Session ── Term ── ClassTerm ──┬─ ClassSubject ── Subject
 │                                 ├─ StudentClassTerm ── Student ── User
 │                                 ├─ TeacherClassTerm ── Teacher ── User
 │                                 └─ ClassTermResultWorkflow ── ResultWorkflowEvent
 ├─ Class
 ├─ GradingSystem ── GradeLevel
 ├─ AssessmentScheme          (CA/exam maxima)
 ├─ TransitionPolicy          (promotion rules)
 ├─ PermissionProfile ── UserPermissionProfile
 ├─ FeeCategory ── FeeSchedule ── StudentCharge ── PaymentAllocation ── Payment
 ├─ ExpenseCategory ─┐
 ├─ PaymentAccount ──┴─ Expense
 └─ Staff ─┬─ StaffSalary ── SalaryScale
           ├─ StaffAllowance ── AllowanceType
           ├─ StaffDeduction ── DeductionType
           └─ PayrollItem ── PayrollItemLine
                  └─ PayrollRun ── SalaryPayment ── Expense
```

**`ClassTerm` is the hinge of the whole system.** Not `Class`, not `Term` — the pair. Subjects
are attached to it, students enrol into it, teachers are assigned to it, fees can be scoped to
it, and the result workflow hangs off it. If you are unsure where something belongs, ask which
class term it happened in.

**`Assessment` is unique on `(studentId, subjectId, termId)`** — one score row per student per
subject per term. `teacherId` records who entered it and is deliberately *not* part of the key,
because two save paths used to each create their own row.

**Money is `Decimal(12,2)` everywhere.** Never a float. Use `Prisma.Decimal`.

### Four counters, all the same pattern

`AdmissionSequence`, `ReceiptSequence`, `ExpenseVoucherSequence`, `PayslipSequence` — each
per school, per year, incremented by an atomic upsert so concurrent requests cannot collide.

---

## 5. The lifecycle

This is the order the seed walks, and the order a real school walks.

### 1 — Super admin registers the school

Creates `School`, and with it the things nothing else works without:

- **`GradingSystem` + `GradeLevel` bands.** Every grade anywhere is resolved from these.
  The demo uses nine WAEC bands with a pass mark of 40.
- **`AssessmentScheme`.** How marks split: CA 10/10/10 + exam 70 by default. This existed
  only as hardcoded literals once; a school on 40/60 could not be onboarded without a code
  change. A maximum of `0` means that slot is unused.
- **`TransitionPolicy`.** The promotion bar, checked in step 8.
- **`PermissionProfile` rows** for the four system profiles.

### 2 — Session and terms

`Session` holds `Term`s. Exactly one term carries `isCurrent: true`, and almost every
student-facing query filters on it. Dates are informational; **the flag is what the app reads.**

### 3 — Classes, subjects, class terms

Every class is instantiated in every term as a `ClassTerm`, and each gets its `ClassSubject`
rows. Without these, no scores can be entered, because an `Assessment` needs a
`studentClassTermId`.

### 4 — Staff

A teacher is **one person in three tables**: `User` (login), `Teacher` (classroom), `Staff`
(payroll), joined by `userId`. A cleaner or driver has a `Staff` row and **no** `User` —
`Staff.userId` is nullable for exactly this reason, and payroll has to cope with both.

### 5 — Teacher assignment

- `TeacherClassTerm` — form teacher for a class in a term
- `TeacherSubject` — which subjects they teach, **per term**

Score entry checks `TeacherSubject`. A teacher who does not hold the subject that term cannot
enter its marks.

### 6 — Fee setup

`FeeCategory` groups; `FeeSchedule` bills. A schedule has a **scope** and an **audience**, and
`lib/fee-charges.ts` combines them:

| Scope | Set on the schedule | Covers |
|---|---|---|
| Class term | `classTermId` | That one class, that one term |
| Term | `termId`, no `classTermId` | Every class in the term |
| Session | neither | Every enrolment in the session |

| Audience | Charged to |
|---|---|
| `ALL_STUDENTS` | everyone the scope covers |
| `NEW_STUDENTS` | students with no enrolment in an **earlier session** |
| `RETURNING_STUDENTS` | students who **do** have one |

> ### ⚠ The one that bites
> **"Returning" means an earlier *session*, not an earlier *term*.**
>
> In a school's very first session **nobody is returning**. So a `RETURNING_STUDENTS` fee
> bills *zero* students, and a `NEW_STUDENTS` fee bills *the entire roll* — every term,
> forever. Both look fine on screen and both are wrong.
>
> This is real and reproducible; the seed hit it and now guards against it with two paired
> assertions (the returning roll **is** charged the levy, and is **not** re-charged the
> admission fee). If you set up a new school and a development levy bills nobody, this is why.

### 7 — Admission and enrolment

Admission number is rendered from the school's own template
(`{PREFIX}/{YEAR}/{NUMBER}` → `BFC/2025/0001`) against `AdmissionSequence`.

Enrolment creates a `StudentClassTerm` **and raises charges in the same transaction**, via
`raiseEnrolmentCharges`. That transaction boundary is deliberate: a student enrolled without
their fees is the bug it exists to prevent.

`raiseEnrolmentCharges` is safe to call repeatedly — `StudentCharge` is unique on
`(studentId, feeScheduleId)` and the insert skips duplicates, so a re-enrolment tops up what
is missing instead of double-billing.

### 8 — Scores and the result workflow

Teachers enter CA and exam marks within the scheme's maxima. **Entering a score is not
releasing it.**

```
DRAFT ──review──▶ REVIEWED ──publish──▶ PUBLISHED ──lock──▶ LOCKED
                                              └──withdraw──▶ WITHDRAWN
```

Every move writes a `ResultWorkflowEvent` with actor, role and note.

Two flags, and you need both:

- `ClassTermResultWorkflow.status` — the module-level state of the class's result set
- `Assessment.isPublished` — per-row, what families may see, with `publishedAt`/`publishedBy`

`PUBLISHED_ONLY` in `lib/results-visibility.ts` is applied on every student and parent read.
Staff screens deliberately do **not** apply it: an admin needs to see drafts, and the compiler
needs them to publish them at all.

**Totals and positions** (`lib/results/class-term-results.ts`):

- A subject counts only when **all four** components are present and the student was neither
  absent nor exempt. A partly-entered subject leaves both numerator and denominator, so an
  unfinished term does not depress averages.
- A genuine **0 is a real mark** and stays in the average. Null and zero are different answers.
- Positions rank by **total score**, ties share a place and the next distinct score skips the
  places consumed: `1, 2, 2, 4`.
- Result sheets read `status IN (ACTIVE, COMPLETED)`. Past terms have **COMPLETED**
  enrolments — filter on `ACTIVE` alone and every historical result sheet comes back empty.

### 9 — Payments

`recordStudentPayment` issues a receipt from `ReceiptSequence` and **allocates** the money
across specific charges, oldest first, writing `PaymentAllocation` rows.

This is the part that matters: a payment is not a number on an account. ₦50,000 against a
₦45,000 tuition and a ₦7,500 levy settles the first and part-pays the second, and both rows
say so. `StudentCharge.status` follows the arithmetic — `PAID`, `PARTIAL`, `UNPAID`.

**A `PENDING` payment allocates nothing and moves no balance.** It has been promised, not
received.

### 10 — Promotion into the next term

`executeStudentTransitions` judges `PROMOTION` against `TransitionPolicy`, via
`evaluatePromotionEligibility`. It returns **every** reason a student fails, not the first,
so an admin can fix the cause or knowingly override. `overrideIneligible` records the override
in the transition notes.

`TRANSFER` and `WITHDRAWAL` are not judged — a sideways move and an exit are not verdicts on
results.

On a successful move the system:

1. marks the old `StudentClassTerm` `COMPLETED`
2. creates the new one `ACTIVE`
3. **calls `raiseEnrolmentCharges` for the new class term**
4. writes `StudentTransition` and `StudentEnrollmentHistory`

> **Debt does not reset at a term boundary.** Old `StudentCharge` rows keep their balances
> untouched; the new term's fees are raised on top. A family's outstanding total is the sum
> of both, which is why a defaulter's balance grows across the year.
>
> One consequence to know: because payments allocate **oldest charge first**, a student who
> falls behind and then pays normally has their old balance cleared automatically by the new
> money. Persistent arrears belong to households that keep not paying.

### 11 — Payroll

Setup: `StaffConfig` (per school), `SalaryScale`, `AllowanceType`, `DeductionType`. Assignment:
`StaffSalary`, `StaffAllowance`, `StaffDeduction` per person, each able to override the type's
value.

`computePay` in `lib/payroll.ts` is pure and does the arithmetic:

1. prorate base if `daysWorked < daysInMonth`
2. allowances computed **off the prorated base** (fixed or a percentage)
3. gross = base + allowances
4. **`PRE_TAX` deductions come off first** → that is the `taxableBase`
5. **`POST_TAX` percentage deductions are taken on the taxable base**, not on gross
6. net = gross − all deductions; `isNegative` is flagged, and `StaffConfig.allowNegativeNet`
   decides whether that is permitted

Getting steps 4 and 5 the wrong way round is the classic payroll bug. The demo deliberately
configures pension 8% `PRE_TAX` and PAYE 7% `POST_TAX` so both paths run.

Run lifecycle: `DRAFT → APPROVED → PAID` (approval is skippable via
`StaffConfig.requirePayrollApproval`), with `CANCELLED` available.

> **Payslip lines are frozen on purpose.** `PayrollItemLine` copies the label and the computed
> amount at generation time. If it recomputed from `AllowanceType` on read, editing the
> transport allowance today would silently rewrite every payslip ever issued.

`PayrollRun` is unique on `(schoolId, year, month)` — the duplicate-payroll guard, in the
database rather than only in code. Paying a run also writes an `Expense`, so salaries appear
in expenditure reports beside everything else.

### 12 — Expenditure

`Expense` requires a `termId`, because expenditure reporting in this system is termly.
Segregation of duties is recorded and survives staff leaving (`recordedBy`, `approvedBy`,
`paidBy` are all `SetNull`, never `Cascade`).

```
PENDING_APPROVAL → APPROVED → PAID
                 ↘ REJECTED / CANCELLED   (both require a reason)
```

`ExpenseCategory.budgetLimit` is a **soft** ceiling — reported against, never enforced. A
school fixing a burst pipe should not be blocked by a stationery budget.

`PaymentAccount` balance is **computed on read**, not stored, so a corrected or cancelled
expense cannot leave a stale figure behind.

### 13 — Audit

`AuditLog` has **no foreign keys at all**, by design. An audit row must survive the deletion
of the user who caused it and the school it happened in, so actor name and role are copied in
rather than joined. Append only — never update or delete.

---

## 6. What the demo seed builds

`npm run seed:demo` — about two minutes. It wipes every school and all non-super-admin users,
then builds a whole year.

**The calendar is anchored to the day you run it**, so the third term always contains today
and the demo never goes stale.

| | |
|---|---|
| School | Brightfield College, Gombe (`BFC-GMB`) |
| Sessions | a bare prior session (so the roll counts as *returning*) + the live one, 3 terms |
| Classes | JSS 1A–3A, SSS 1A–3A |
| Subjects | 10, split by level (8 junior, 7 senior) |
| Students | 64 — 60 at the start, 4 admitted mid-session into the current term |
| Parents | 34, some with two children |
| Staff | 12 — principal, bursar, exams officer, 6 teachers, 3 support with no login |
| Academics | 1,230 scores, 3,600 attendance rows, 120 transitions |
| Finance | 378 charges, 158 payments; ~₦10.1m billed, ~₦6.1m collected, ~₦4.0m outstanding |
| Payroll | 10 monthly runs, 120 payslips; 9 paid, the latest awaiting payment |
| Expenditure | 17 vouchers — paid, awaiting approval, and one rejected |

### State it deliberately leaves behind

- **First and Second Term** — closed: reviewed, published, **LOCKED**, promoted out of.
- **Third Term** — current: 330 marks entered, **none published**, workflow at **DRAFT**.
  This is what proves the visibility rule; students and parents must see nothing.
- **9 households in persistent arrears**, so the debtors report has a real population.
- **4 mid-session entrants** charged the admission fee and spared the levy, sitting beside
  returning students charged the opposite way.
- **The newest payroll run** left `APPROVED` rather than paid, so the queue is not empty.
- **One rejected voucher** with a reason, and one awaiting approval.

### Logins

| Role | Address | Password |
|---|---|---|
| Super admin | `superadmin@schoolpro.ng` | `SUPER_ADMIN_PASSWORD` env var |
| Admin (Principal) | `admin@brightfield.edu.ng` | `Admin#2025` |
| Accountant (Bursar) | `accountant@brightfield.edu.ng` | `Account#2025` |
| Exams officer | `exams@brightfield.edu.ng` | `Exams#2025` |
| Teachers | `teacher1..6@brightfield.edu.ng` | `Teacher1#2025` … |
| Students | `student1..64@brightfield.edu.ng` | `Student1#2025` … |
| Parents | `parent1..34@brightfield.edu.ng` | `Parent1#2025` … |

Students can also sign in with their **admission number**, password `<surname><year>` —
e.g. `BFC/2025/0001` / `abdullahi2025`.

### What it verifies

28 assertions, re-derived from the database rather than from the seed's own variables:

- **Finance** — `balance = due − paid` on every charge; status agrees with the amounts;
  allocations sum to `amountPaid`; pending payments allocate nothing; receipt numbers unique.
- **Fee audiences** — new entrants charged the admission fee and **not** the levy; the
  returning roll charged the levy and **not** re-charged admission.
- **Carried debt** — students hold First Term balances while carrying Third Term charges.
- **Results** — closed terms fully published; the current term has marks and zero published;
  workflows LOCKED vs DRAFT; every closed class term logged review + publish + lock.
- **Grades and positions** — stored grades match the bands; no score exceeds the scheme;
  sheets ordered by total; top is position 1; ties share places.
- **Teaching** — every score entered by a teacher who holds that subject that term.
- **Payroll** — `net = gross − deductions` per run; payslip lines reconcile to their totals;
  every paid run produced an expenditure record.
- **Integrity** — no student actively enrolled in two classes in one term.

A failure prints the failing assertions and exits non-zero.

---

## 7. Known issues

Found while building and verifying this; **none are caused by the seed**.

1. **A deleted user with a live JWT gets a crash page.** `requireActor()` throws
   `AuthorizationError: User profile not found`, which reaches the global error boundary as
   "DigiSchool-Pro couldn't start". It should sign the session out and redirect to login.
   Easy to hit after any re-seed.
2. **`prisma/seed.ts` cannot run as written.** It uses `import { loadEnvConfig } from "@next/env"`,
   but `@next/env` is CommonJS and the project is ESM, so Node throws
   `does not provide an export named 'loadEnvConfig'`. `seed-demo-data.ts` uses the default-import
   interop instead; `seed.ts` needs the same fix.
3. **Deleting a `School` does not cascade cleanly** once payroll or expenditure exists —
   several relations are `Restrict` (correctly, so a payslip cannot lose the allowance behind
   it). Any teardown has to walk the graph children-first, as the seed's `wipe()` does.
4. **Positions rank on `totalScore` while the displayed grade uses `averageScore`** — already
   flagged as a known defect in `lib/results/class-term-results.test.ts`. A student with many
   subjects can outrank one with fewer but stronger results.

---

## 8. Commands

```bash
npm run dev              # dev server, port 3010
npm run build            # prisma generate + next build
npm run lint             # eslint, zero warnings tolerated
npm run type-check       # tsc --noEmit
npm test                 # vitest, 271 unit tests
npm run test:integration # vitest against a real database
npm run seed:super-admin # platform super admins
npm run seed:demo        # the full lifecycle above
npm run backup           # database backup
```
