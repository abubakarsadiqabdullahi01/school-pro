# Demo walkthrough — logins and what to expect

Every login in the seeded database, and what each role should see when they sign in. Use it
as a test script: if something here does not match, that is a bug worth reporting.

Regenerate the data at any time with `npm run seed:demo`. Figures below are from the current
seed and are stable across re-runs — the generator is deterministic.

- **URL** — http://localhost:3010
- **School** — Brightfield College, Gombe (`BFC-GMB`)
- **Session** — 2025/2026 · **Third Term is current**, 2 Aug → 31 Oct 2026

> The calendar anchors to the day you seed, so the current term always contains today. If you
> re-seed next month, the dates shift with it — the *shape* below stays the same.

### The state the school is in

This matters for everything you are about to check:

| Term | Status | Results |
|---|---|---|
| First Term | closed, promoted out of | published + **LOCKED** |
| Second Term | closed, promoted out of | published + **LOCKED** |
| **Third Term** | **current, mid-flight** | 330 marks entered, **none published**, workflow **DRAFT** |

---

## 1. Super admin

| | |
|---|---|
| Login | `superadmin@schoolpro.ng` |
| Password | whatever you set in `SUPER_ADMIN_PASSWORD` |

Second account: `admin@schoolpro.ng` / `SECOND_SUPER_ADMIN_PASSWORD`.

**Expect to see**

- Lands on `/dashboard/super-admin` — the platform view, above any one school
- **1 school** listed: Brightfield College, Gombe
- Full navigation: no menu is hidden, since a super admin holds all 19 permissions
- School management and user administration across the platform

---

## 2. Admin (Principal)

| | |
|---|---|
| Login | `admin@brightfield.edu.ng` |
| Password | `Admin#2025` |
| Person | Halima Suleiman · MANAGER profile (all 19 permissions) |

**Expect on the dashboard**

| Tile | Value |
|---|---|
| Total Students | **64** |
| Total Teachers | **6** |
| Active Classes | **6** |
| Academic Sessions | **2** |

- **Current session** 2025/2026 with three terms listed, **Third Term** badged *Current*
- **Grade distribution** chart, labelled "Based on WAEC Standard (Pass Mark: 40%)"

**Full sidebar** — this is the only role that sees everything: Calendar, Teachers, Students,
Compiler, Terms, Classes, Subjects, Parents, Finance, Expenditure, HR & Payroll, Permissions,
School Settings.

**Worth opening**

- **Students** → 64, across JSS 1A–3A and SSS 1A–3A (about 10 per class)
- **Classes** → 6; each exists in all three terms
- **Subjects** → 10. Junior classes offer 8, senior classes 7
- **Terms** → 3, only Third Term flagged current
- **Permissions** → 4 system profiles: Manager, Exams Officer, Finance Officer, HR and Payroll
- **School Settings** → admission format `{PREFIX}/{YEAR}/{NUMBER}`, producing `BFC/2025/0001`

---

## 3. Accountant (Bursar)

| | |
|---|---|
| Login | `accountant@brightfield.edu.ng` |
| Password | `Account#2025` |
| Person | Bashir Garba · FINANCE profile |

**Expect to see**

- Finance menus only — **no** Compiler, **no** HR & Payroll, **no** Permissions
- Attempting `/dashboard/admin/compiler/...` directly should bounce to an access error

**Finance figures**

| | |
|---|---|
| Billed | **₦10,110,000.00** |
| Collected | **₦6,076,500.00** |
| Outstanding | **₦4,033,500.00** |
| Charges | 378 |
| Payments | **129 completed + 8 pending** |

**Fee schedules** — 5, and the audiences are the interesting part:

| Schedule | Amount | Applies to | Charges raised |
|---|---|---|---|
| Admission Fee | ₦25,000 | NEW_STUDENTS, session-wide | **4** — only the mid-session intake |
| Tuition — each term | ₦45,000 | ALL_STUDENTS | 60 / 60 / **64** |
| Development Levy — each term | ₦7,500 | RETURNING_STUDENTS | 60 per term, **not** the new intake |
| WAEC Examination Fee | ₦38,000 | ALL_STUDENTS, **SSS 3A in Third Term only** | **10** |

> **Check this one thing.** The Admission Fee has exactly **4** charges and the Development
> Levy has **none** against those same 4 students. That is the new-vs-returning rule working.
> If the admission fee shows 64 charges, returning students are being re-billed.

**Debtors report** — **54 students** with a balance. Nine of them are persistent defaulters
who have paid nothing all year; their balances are the largest and span all three terms:

| Student | Class | Owing |
|---|---|---|
| Adaeze Chukwu · `BFC/2025/0057` | SSS 3A | ₦195,500 |
| Tunde Mohammed · `BFC/2025/0022` | JSS 3A | ₦157,500 |
| Adaeze Suleiman · `BFC/2025/0050` | SSS 2A | ₦157,500 |

**Receipts** — receipt numbers run `RCT/2026/00001` upward, unique, never reused.

> **The 8 pending payments** should change **no** balance. A pending transfer has been
> promised, not received; it appears in the receipt register and allocates nothing.

---

## 4. Exams officer

| | |
|---|---|
| Login | `exams@brightfield.edu.ng` |
| Password | `Exams#2025` |
| Person | Ngozi Okafor · EXAMS profile |

An `ADMIN` login, same role as the Principal, **narrowed by profile** — this is the clearest
demonstration of role vs permission in the system.

**Expect to see**

- Academics and Compiler menus — **no** Finance, **no** HR & Payroll, **no** Permissions
- **Compiler → Class Results**: First and Second Term sheets complete with positions
- Workflow state per class term: **LOCKED** for the two closed terms, **DRAFT** for Third Term
- Result sheets ordered by total score, position 1 at the top, ties sharing a place (1, 2, 2, 4)
- **36 workflow events** in total — review, publish and lock for each of 6 classes × 2 terms

---

## 5. Teachers

Password pattern: `Teacher<n>#2025`.

| Login | Name | Form class |
|---|---|---|
| `teacher1@brightfield.edu.ng` | Abubakar Abdullahi | JSS 1A |
| `teacher2@brightfield.edu.ng` | Chiamaka Adeyemi | JSS 2A |
| `teacher3@brightfield.edu.ng` | Emeka Lawal | JSS 3A |
| `teacher4@brightfield.edu.ng` | Ngozi Okafor | SSS 1A |
| `teacher5@brightfield.edu.ng` | Musa Chukwu | SSS 2A |
| `teacher6@brightfield.edu.ng` | Folake Aliyu | SSS 3A |

**Expect to see**

- Sidebar: Dashboard, My Classes, Attendance, Subjects, Compiler, Profile
- **No admin menus** — no Students, Finance, Terms, Permissions or School Settings
- Dashboard shows their assigned class, its student count and the subjects they teach

**Score entry — `Compiler → Subject Result Entry`**

1. Pick the term, level and class
2. Open the **subject dropdown**

> **Check this.** Each subject must appear **exactly once**. A junior class offers 8 subjects,
> a senior class 7. Duplicates — the same subject listed three times — mean the per-term
> filter has regressed. Every subject listed must be one the class actually offers.

3. Third Term rows are partly filled; the last two subjects per class have **no marks yet**
4. Saving is allowed for Third Term (DRAFT), and should be **refused** for First or Second
   Term, which are LOCKED

---

## 6. Students

Password pattern: `Student<n>#2025`, for `student1` … `student64`.

Students can also sign in with their **admission number** — `BFC/2025/0001`, password
`<surname><year>` in lower case, e.g. `abdullahi2025`. Worth testing at least once: it is a
separate credential type, not a second password on the same one.

**Expect to see**

- Sidebar: Dashboard and Profile only
- One page with: Class · Average · Attendance · Outstanding, then **My Results**,
  **My Subjects**, **Attendance**, **My Fees**, **My Receipts**

> **The important check.** Results shown are **First and Second Term only**. The current term
> has marks in the database — `student1` has 6 Third Term rows — and **none are published**,
> so the student must not see them. If a Third Term score appears, the publication rule has
> broken.

**Useful accounts**

| Login | Why |
|---|---|
| `student1@brightfield.edu.ng` | Typical: 8 marks in First Term, 8 in Second, 6 unpublished in Third |
| `student24@brightfield.edu.ng` | Fully paid — Outstanding **₦0.00**, receipts listed |
| `student57@brightfield.edu.ng` | Worst defaulter — owes **₦195,500** across three terms, no receipts |
| `student61@brightfield.edu.ng` | Mid-session entrant, JSS 1A — **no** First or Second Term results at all, and an **Admission Fee** on their bill |
| `student64@brightfield.edu.ng` | Mid-session entrant, SSS 1A |

---

## 7. Parents

Password pattern: `Parent<n>#2025`, for `parent1` … `parent34`.

**Expect to see**

- Sidebar: Dashboard, My Children, Profile
- Dashboard tiles: Children · Attendance · Paid This Term · Pending Fees
- A card per child, then **My Children** → open one for the full record: class, term, subjects,
  released results, fees and receipts

> Same publication rule as the student view: a parent sees **First and Second Term results
> only**. Nothing from the current term.

**Useful accounts**

| Login | Why |
|---|---|
| `parent1@brightfield.edu.ng` | Ibrahim Danladi — single child |
| `parent24@brightfield.edu.ng` | Yusuf Abdullahi — **2 children**, family owing **₦86,000** |
| `parent6@brightfield.edu.ng` | Halima Garba — 2 children, owing ₦82,000 |
| `parent19@brightfield.edu.ng` | Bashir Aliyu — 2 children, owing ₦80,500 |

**Also worth checking:** a parent must not reach another family's child. Open a child, copy the
`studentId` from the URL, then try it while signed in as a different parent — it should return
not-found, not a page.

---

## 8. HR & Payroll — sign in as the Admin

Payroll sits behind `payroll.manage` / `payroll.pay`, which only the MANAGER profile holds
here, so use `admin@brightfield.edu.ng`.

**Expect to see**

- **12 staff** — Principal, Bursar, Exams Officer, 6 teachers, and **3 support staff with no
  login at all** (driver, cleaner, security). A payslip does not require a user account
- **4 salary scales** — Principal ₦320,000 · Senior ₦180,000 · Teacher ₦140,000 · Support ₦65,000
- **10 monthly payroll runs**, one per month of the session so far

| | |
|---|---|
| Gross per month | **₦2,238,000.00** |
| Net per month | **₦1,890,832.80** |
| Runs paid | **9** |
| Latest run | **APPROVED — awaiting payment** |

- Open any **payslip**: Basic, then Housing (20% of base) and Transport (₦15,000), then
  Pension 8% **pre-tax**, PAYE 7% **post-tax** and Union Dues ₦2,000
- Every line total must reconcile: `gross = base + allowances`, `net = gross − deductions`

> **The pre/post-tax ordering is the thing to verify.** Pension comes off before PAYE is
> worked out, so PAYE is charged on the taxable base, not on gross. If PAYE looks too high,
> the ordering has flipped.

---

## 9. Expenditure — sign in as the Admin

**Expect to see**

| Status | Count | Total |
|---|---|---|
| PAID | **15** | ₦18,080,495.20 |
| PENDING_APPROVAL | **1** | ₦275,000.00 |
| REJECTED | **1** | ₦60,000.00 |

The 15 paid vouchers are 6 school-activity/running-cost payments plus **9 salary vouchers** —
every settled payroll run writes an expense, so salaries appear beside everything else rather
than in a separate world.

- **Categories**: Utilities, Maintenance, School Activities (each with a termly budget limit),
  and Salaries
- **Accounts**: Main Bank Account (₦2,500,000 opening) and Cash Office (₦150,000)
- Activities include Inter-house Sports, Excursion to Yankari, Speech and Prize Giving Day,
  Cultural Day
- The **rejected** voucher carries a reason: *"Three quotations not attached; resubmit with
  comparatives."*
- Account balances are **computed on read**, so a cancelled expense cannot leave a stale figure

---

## Quick cross-role checks

Things that are only convincing when you look from two directions:

1. **Publication** — sign in as `teacher1`, see Third Term marks in the entry sheet. Sign in as
   a student in JSS 1A: those same marks must be invisible.
2. **New vs returning** — compare `student61` (mid-session entrant: Admission Fee, no levy)
   with `student1` (returning: levy, no admission fee).
3. **Carried debt** — `student57` owes across all three terms. Old balances survive the
   rollover; the new term's fees stack on top.
4. **Role vs permission** — `admin@` and `exams@` are both `ADMIN`. Their menus differ entirely.
5. **Locked results** — try editing a First Term score as a teacher. It should refuse.

---

## Known rough edges

Not caused by the seed; you will meet them while testing.

1. **A stale session after re-seeding shows a crash page** — "DigiSchool-Pro couldn't start".
   The JWT is still valid but its user no longer exists. Sign out at
   `/api/auth/signout`, or clear cookies, then sign in again.
2. **`prisma/seed.ts` cannot run as written** — `@next/env` is CommonJS and the named import
   fails under ESM. `seed-demo-data.ts` uses the interop form; `seed.ts` needs the same fix.
3. **Logging out takes two clicks from some screens** — the sidebar button routes via
   NextAuth's own unstyled confirmation page.
4. **Positions rank on total score while the grade uses average** — a known defect, already
   noted in `lib/results/class-term-results.test.ts`.
