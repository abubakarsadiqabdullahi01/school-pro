# DigiSchool-Pro Pre-Finance Test Plan

Use this checklist before adding the finance module. Each page should be marked:

- `Keep`: accurate, useful, and user-friendly.
- `Improve`: works, but UI/UX or copy needs cleanup.
- `Hide`: not ready or placeholder.
- `Fix`: broken action, wrong data, dead link, or misleading flow.

## Audit Summary

Audited 2026-08-22 by static review of every route under `app/dashboard`, all 26 server
action files, and `prisma/schema.prisma`. Nothing was exercised against a running app —
see "What this audit did not cover" at the end.

**Headline: the app is more real than the checklist assumed, and less honest.**

There is no mock data anywhere. Every dashboard reads live database rows, school scoping
is applied consistently, and the transactional work — student creation, transitions,
admission sequences, set-current — is genuinely transactional. Authentication coverage on
server actions is near-complete once the per-file authorization helpers are accounted
for; only `getGradingSystem`, `checkTeacherAssignment`, and the pure
`calculateGradeFromScore` lack a check.

The problem is a recurring pattern of **screens that report success for work that did not
happen**:

- Super admin clicks "Backup now" — nothing is backed up, a fake id is returned.
- Super admin edits system settings — the values are logged to the console and discarded.
- Admin clicks "Set as current term" — the action returns Unauthorized, the UI says it
  worked.
- Admin clicks "Export Report" — a toast promises a download that never starts.

Alongside those, three defects will corrupt real data rather than just mislead:

- Any teacher can write attendance for any student in any school.
- Saving scores can create a second assessment row for the same student, subject, and
  term when the teacher id resolves differently.
- Two admins registering students at the same moment can be issued the same admission
  number.

Verdict rows recorded below: `Keep` 38, `Improve` 14, `Fix` 18, `Hide` 1, not audited 2
— 73 rows over 83 routes under `app/dashboard`, with a few pages appearing in two
sections (the student and parent dashboards are judged under both their own flow and
attendance) and the remaining routes being detail and edit pages that share a verdict
with their list page.

## Global Rules

- Confirm every page shows real data or a clear empty state.
- Confirm every button either works or is hidden.
- Confirm every page respects the signed-in user role.
- Confirm create/edit/delete actions refresh visible data.
- Confirm no duplicate records are created.
- Confirm current session and current term are obvious.
- Confirm mobile layout is usable.
- Confirm errors are human-readable.

## Cross-Cutting Findings

Audited by reading source, not by clicking through a running app. Each item below was
confirmed in code and cites the file. These affect many pages at once, so fix them
before working through the per-section verdicts.

### Fix — role enforcement is per-page and two pages have none

`app/dashboard/layout.tsx` checks only that a session exists — it never checks role.
There is no `(roles)/layout.tsx`. So every page enforces its own role, and two do not:

- `app/dashboard/(roles)/admin/page.tsx` — the admin dashboard has no role check.
- `app/dashboard/(roles)/admin/calendar/page.tsx` — no role check.

Not a data leak: both rely on `prisma.admin.findUnique({ where: { userId } })`, which
returns nothing for a non-admin, so the queries fail closed. But a signed-in student
who visits `/dashboard/admin` gets "Failed to load dashboard data" with a Retry
button instead of being redirected. Add the guard, and prefer a shared
`(roles)/layout.tsx` so this cannot regress.

Partly resolved (2026-08-26). `proxy.ts` no longer disables middleware — it now runs the
coarse session check on `/dashboard/:path*` and `/auth/login`. Role checks stay out of it
deliberately: they need the user's profile and school, which means Prisma, which does not
run on the edge, and a role in a JWT is a cached claim rather than current truth. Roles are
enforced by a `layout.tsx` per role subtree instead. The two unguarded pages above are
still unguarded.

### Fix — super admin creating a teacher assigns an arbitrary school

`app/actions/teacher-management.ts:176` — when the caller is a SUPER_ADMIN,
`createTeacher` resolves the school with `prisma.school.findFirst()` and the comment
says "For now, we'll use the first school in the system". The teacher is silently
attached to whichever school comes back first. The admin path is correct; only the
super-admin path is wrong. Either take `schoolId` as a parameter or block super
admins from this action.

### Fix — profile page writes credentials that can never log in

`app/actions/profile.ts:134,153,172` — `updateContactInfo` creates `Credential` rows
with `passwordHash: ""`. `auth.ts:87` verifies with
`bcrypt.compare(password, credential.passwordHash)`, which returns false for an empty
hash, so the new email/phone/registration-number credential is unusable for login.
This is not an auth bypass, but it is a dead credential the user believes is live.

Worse, `Credential` has `@@unique([userId, type])`. The code only creates a
credential when the corresponding `*CredentialId` is absent, so a user who already
has an EMAIL credential that was not passed through will hit an unhandled unique
constraint violation.

### Fix — system settings and backup are fake but report success

- `app/actions/system-settings.ts:32` — `getSystemSettings` returns a hardcoded
  `defaultSettings` object. The comment claims there is no settings table, but
  `SystemConfiguration` exists in `prisma/schema.prisma:443`.
- `app/actions/system-settings.ts:61` — `updateSystemSettings` performs no write. It
  `console.log`s the input and returns
  `{ success: true, message: "System settings updated successfully" }`. The form
  silently discards everything the super admin types.
- `app/actions/system-settings.ts:141` — `performSystemBackup` waits 2 seconds with
  `setTimeout` and returns a fabricated `backup_${Date.now()}` id. No backup occurs.
  This is the most misleading thing in the app: it tells the operator their data is
  backed up when it is not. Remove or disable it before deployment.
- `components/system/system-settings.tsx:23` — the form does not even call the action;
  it has its own "Simulate API call".

`getSystemHealth` in the same file is real (`$queryRaw`, real counts) and can stay.

### Fix — class term setup wizard fakes success

`components/student-transitions/ClassTermSetupWizard.tsx:48` — "For now, we'll just
simulate success". Confirm what this wizard claims to have created, because
class-term records are the backbone every other flow depends on.

### Fix — five overlapping compiler implementations

`app/actions/compiler.ts`, `compiler-improved.ts`, `compiler-enhanced.ts`,
`teacher-compiler.ts`, and `teacher-assessments.ts` duplicate the same
responsibilities. Duplicate exported names across them:

`calculateGradeFromScore` ×3, and `saveAssessments`, `getGradingSystem`,
`getClassTermSubjects`, `getClassTermResults`, `getAssessmentsWithStatus`,
`getAssessmentsForSubject`, `bulkUpdateAssessments` ×2 each.

Consequences to check:

- [ ] `compiler-enhanced.ts` is imported by nothing. Dead code — delete it.
- [ ] `components/score-entry/SubjectResultEntry.tsx` imports from **both**
      `compiler` and `compiler-improved` in the same screen.
- [ ] Three copies of `calculateGradeFromScore` means a teacher-entered grade and the
      admin class-result view can diverge. Collapse to one implementation and one
      grading-system reader.

### Fix — remove the debug action surface before deployment

`app/actions/debug-student-assignments.ts` exports five server actions, including
`removeAllStudentAssignmentsForTerm` (`deleteMany` on `assessment` and
`studentClassTerm` for an entire term) and `fixDuplicateAssignments`. Both are
SUPER_ADMIN-gated, so they are authorized, but neither is scoped by `schoolId` — a
term id is enough to wipe assessments across schools. `components/debug-student-
assignments.tsx` is never routed, so the UI is unreachable while the server actions
stay callable. Delete both.

### Fix — 191 type errors are suppressed at build time

`next.config.ts:3` sets `typescript: { ignoreBuildErrors: true }`, so `npm run build`
succeeds while `npm run type-check` reports **191 errors**. The build is not telling you
the code is sound; it is telling you the check is off. (The count fell to 158 as the
fix-order work landed, so treat the number as a moving baseline, not a target.)

The errors cluster in exactly the area this audit rated highest-risk — the assessment
pipeline accounts for 65 of them:

| File | Errors |
| --- | --- |
| `components/compiler/class-results-termly.tsx` | 17 |
| `components/score-entry/SubjectResultEntry.tsx` | 13 |
| `app/actions/teacher-assessments.ts` | 10 |
| `app/actions/compiler-improved.ts` | 10 |
| `components/compiler/subject-result-analysis.tsx` | 9 |
| `app/actions/teacher-compiler.ts` | 6 |

15 of the 191 are null-safety errors (`TS18047`, `TS18048`, "is possibly undefined") —
those are latent runtime crashes, not style complaints. For example
`admin-session-table.tsx:254` dereferences `sessionToDelete` where TypeScript has already
proved it can be `null`.

Others are shape mismatches that will silently misrender: `parent-search-dialog.tsx:56`
assigns `phone: string | null` into a `Parent` type that declares `phone: string`, and
`:94` reads an `email` property that does not exist on the object it is given.

- [ ] Do not flip `ignoreBuildErrors` off in one go — 191 errors will block every build.
- [ ] Fix the 15 null-safety errors first; they are real defects.
- [ ] Then clear the compiler pipeline's 65, alongside the section 6 work.
- [ ] Then turn the flag off so it cannot regress.

### Improve — authentication coverage is otherwise good

Every other exported server action authenticates, most through a per-file helper
(`getAuthenticatedUser`, `authorizeAndGetSchoolId`, `authorizeTeacherAndGetData`,
`checkAuthorization`). The only remaining gaps are benign or minor:

- [ ] `getGradingSystem(schoolId)` in `compiler.ts` and `compiler-enhanced.ts` takes
      `schoolId` from the caller with no auth check — an unauthenticated cross-tenant
      read of grading bands. Low sensitivity, still worth closing.
- [ ] `checkTeacherAssignment` in `compiler-improved.ts` has no auth check.
- [ ] `calculateGradeFromScore` has no auth check in three files. Harmless if it stays
      a pure calculation.

### Improve — credential values are globally unique

`prisma/schema.prisma:231` — `Credential.value` is `@unique` across the whole
platform. Two schools cannot both issue a student the registration number or phone
value they use to log in. Decide now whether login identifiers should be scoped per
school, because it gets much harder to change once real schools are onboarded.

### Improve — login logs identifiers to the console

`auth.ts:36` logs `"Attempting login with identifier:"` plus the raw identifier, and
`app/actions/auth.ts:23` logs the email. Remove before production logging is enabled.

### Improve — client-side auth shortcut

`lib/client-utils.ts:30-34` — "In a real implementation, you would need to decode the
JWT ... For now, we'll use localStorage as a temporary solution." Confirm nothing
authorization-related depends on this.

## 1. Super Admin Flow

Purpose: create schools, assign admins, and monitor the whole platform.

Pages:

- `/dashboard/super-admin`
- `/dashboard/super-admin/schools`
- `/dashboard/super-admin/schools/add`
- `/dashboard/super-admin/schools/[id]`
- `/dashboard/super-admin/schools/[id]/edit`
- `/dashboard/super-admin/users/admins`
- `/dashboard/super-admin/users/admins/add`
- `/dashboard/super-admin/sessions`
- `/dashboard/super-admin/terms`
- `/dashboard/super-admin/analytics`
- `/dashboard/super-admin/system`

Test steps:

- [ ] Login as super admin.
- [ ] Confirm dashboard stats match seeded/database counts.
- [ ] Create a school.
- [ ] Confirm new school appears in school list.
- [ ] View school details.
- [ ] Edit school details.
- [ ] Create an admin for the school.
- [ ] Confirm admin appears in admin list.
- [ ] Login as that admin and confirm school scoping.
- [ ] Review analytics/system pages for real value vs placeholder content.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/super-admin` | `Improve` | Real counts via `getSystemStats`. But `getSchoolPerformance` (`user-management.ts:98`) ranks schools by `students._count` and presents them as "performance". Rename to "largest schools" or compute a real metric. |
| `/dashboard/super-admin/schools` | `Keep` | Real query, empty state present in `schools-table.tsx`. |
| `/dashboard/super-admin/schools/add` | `Keep` | Thin wrapper over `school-form`; `createSchool` authenticates and role-checks. |
| `/dashboard/super-admin/schools/[id]` | `Keep` | Real fetch via `getSchool`. |
| `/dashboard/super-admin/schools/[id]/edit` | `Keep` | Real fetch and `updateSchool`. |
| `/dashboard/super-admin/users/admins` | `Improve` | Works, but builds its table inline from `ui/table` instead of reusing `user-management-table`, so column behaviour and empty states drift from every other list. |
| `/dashboard/super-admin/users/admins/add` | `Keep` | `createAdminUser` authenticates and role-checks. |
| `/dashboard/super-admin/sessions` | `Keep` | Real query, empty state present. |
| `/dashboard/super-admin/terms` | `Keep` | Real query via `all-terms-table`. |
| `/dashboard/super-admin/analytics` | `Improve` | Charts are real (recharts over live counts), no fabricated trend values. Two panels read "Financial data coming soon..." and "Assessment data coming soon..." (`super-admin-analytics.tsx:387,399`), and `topPerformingSchools` (`analytics.ts:95`) is student count relabelled as performance — the author's own comment calls it "a proxy". Hide the two empty panels and fix the label. |
| `/dashboard/super-admin/system` | `Hide` | Settings never persist and the backup is fake. See Cross-Cutting Findings. Do not ship a page that reports a successful backup that did not happen. |

Answers to the original test questions:

- Can super admin create a school? Yes — `createSchool` is authenticated, role-checked, and writes.
- Are analytics useful or decorative? Mostly real. Two placeholder panels and one mislabelled metric.
- Are system alerts real? `getSystemHealth` is real. Everything else on `/system` is not.
- Does a school admin only see their own school? Yes for teachers/students/parents/classes, which all filter on the admin's `schoolId`.

Decision:

- Status: `AUDITED`
- Notes: Flow is sound. Blockers before deployment are `/system` and the two
  mislabelled performance metrics.

## 2. Admin School Setup Flow

Purpose: configure one school for daily use.

Pages:

- `/dashboard/admin`
- `/dashboard/admin/school-settings`
- `/dashboard/admin/school-settings/information`
- `/dashboard/admin/school-settings/admission`
- `/dashboard/admin/school-settings/grading-systems`
- `/dashboard/admin/school-sessions`
- `/dashboard/admin/school-sessions/create`
- `/dashboard/admin/school-terms`
- `/dashboard/admin/school-terms/create`
- `/dashboard/admin/class-terms`
- `/dashboard/admin/classes`
- `/dashboard/admin/classes/create`
- `/dashboard/admin/subjects`
- `/dashboard/admin/subjects/create`

Test steps:

- [ ] Login as school admin.
- [ ] Confirm dashboard shows only assigned school data.
- [ ] Update school information.
- [ ] Configure admission settings.
- [ ] Create academic session.
- [ ] Create term under session.
- [ ] Mark correct session/term as current.
- [ ] Create classes.
- [ ] Link classes to terms via class-term setup.
- [ ] Create subjects.
- [ ] Assign subjects to classes/class terms.
- [ ] Create or confirm grading system.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/admin` | `Fix` | No role check (see Cross-Cutting). The **Academic** tab renders `<DashboardOverview data={dashboardData} />` — byte-identical to the Overview tab. The **Settings** tab is a placeholder with a dead "Configure Dashboard" button. **Export Report** shows "Your report is being generated and will download shortly" and downloads nothing (`page.tsx:62`). Underlying data from `getDashboardData` is real and school-scoped. |
| `/dashboard/admin/school-settings` | `Keep` | Hub page, real settings summary. |
| `/dashboard/admin/school-settings/information` | `Improve` | `updateSchoolInformation` is authenticated and school-scoped and writes correctly. It signals failure by throwing, so the form's catch fires — but Next.js redacts thrown server-action errors in production, so the admin only ever sees a generic "Failed to..." toast. Return typed errors instead. |
| `/dashboard/admin/school-settings/admission` | `Fix` | Two defects. (1) The preview and the real thing disagree: `generateNextAdmissionNumber` computes `(lastSequence ?? 0) + 1`, while `createAdmissionNumber` seeds a brand-new year at `school.admissionSequenceStart`, so the previewed number is wrong for the first student of a new year. (2) `createAdmissionNumber` does `findUnique` then `update` with `lastSequence + 1` inside a transaction. Under Postgres READ COMMITTED that is not atomic — two admins registering students at once can be issued the same admission number. Use `{ lastSequence: { increment: 1 } }` or an upsert. |
| `/dashboard/admin/school-settings/grading-systems` | `Improve` | Grading systems are real and are applied to scores. But if a school has none configured, `calculateGradeFromScore` silently falls back to a hardcoded WAEC-style band set instead of warning the admin — report cards then carry grades the school never approved. Surface a "no grading system configured" state and block result publishing until one exists. |
| `/dashboard/admin/school-sessions` | `Fix` | "Set as current" is broken and lies about it. See the set-current note below. |
| `/dashboard/admin/school-sessions/create` | `Keep` | `createSession` authenticates, validates, and writes. |
| `/dashboard/admin/school-terms` | `Fix` | Same set-current defect. |
| `/dashboard/admin/school-terms/create` | `Keep` | `createTerm` authenticates, validates, and writes. |
| `/dashboard/admin/class-terms` | `Keep` | Real `ClassTerm` data; `assignClassToTerm` / `removeClassFromTerm` authenticate, scope by school, and throw on failure so the UI reports errors correctly. |
| `/dashboard/admin/classes` | `Keep` | Real query, school-scoped, empty state present. |
| `/dashboard/admin/classes/create` | `Keep` | `createClass` authenticates and scopes by school. |
| `/dashboard/admin/classes/edit` | `Fix` | Orphan route — renders the full classes list, not an edit form. Delete it; the real route is `classes/edit/[id]`. |
| `/dashboard/admin/subjects` | `Keep` | Real query, school-scoped, empty state present. |
| `/dashboard/admin/subjects/create` | `Keep` | `createSubject` authenticates and scopes by school. |

### Fix — "Set as current" session/term is broken for admins and reports success anyway

Two bugs compound into the worst defect in the setup flow.

1. `setCurrentSession` (`session-management.ts:166`) and `setCurrentTerm`
   (`term-management.ts:233`) both require `role === "SUPER_ADMIN"`. An ADMIN always
   gets `{ success: false, error: "Unauthorized" }`. Yet the admin UI exposes the
   button: `admin-session-table.tsx:110`, `admin-terms-table.tsx:91`,
   `admin-all-terms.tsx:112`.
2. Unlike the rest of the action layer, `session-management.ts` and
   `term-management.ts` **never throw** — every failure is a returned
   `{ success: false }` object. The admin components `await` the call, discard the
   result, and unconditionally `toast.success(...)`. The `catch` block can never fire.

So an admin clicks "Set as current", sees "Current term updated successfully", and
nothing changed. This directly answers the plan's question "Is current session/current
term clear?" — an admin cannot set either one, and is told they did.

Confirmed sites that discard a returned failure and show success:

- [ ] `components/session-management/admin-session-table.tsx:93` (`deleteSession`), `:110` (`setCurrentSession`)
- [ ] `components/session-management/admin-terms-table.tsx:74` (`deleteTerm`), `:91` (`setCurrentTerm`)
- [ ] `components/session-management/admin-all-terms.tsx:95` (`deleteTerm`), `:112` (`setCurrentTerm`)
- [ ] `components/session-management/terms-table.tsx:74` (`deleteTerm`), `:91` (`setCurrentTerm`) — super-admin side, same bug

The super-admin `sessions-table.tsx:147` and `all-terms-table.tsx:149` do it correctly
(`const result = await ...` then check `result.success`). Copy that pattern, and pick
one error convention for the whole action layer — right now `session-management` and
`term-management` return failures while `class-management`, `class-term-management`,
`subject-management`, and `school-settings` throw.

### Fix — delete the dead class-term setup wizard

`components/student-transitions/ClassTermSetupWizard.tsx:47` has its server action
commented out (`// const result = await createClassTerms(...)`), waits 1 second, and
toasts `Created ${selectedClasses.length} class-term associations`. It creates
nothing. No page imports it, so it is unreachable today — delete it rather than leave
it to be wired up by someone who trusts the toast.

Decision:

- Status: `AUDITED`
- Notes: The backbone data model is sound and properly school-scoped. Blockers are the
  set-current defect, the admission-number race, and the admin dashboard's fake
  controls. Do not start finance until set-current works, because every finance query
  will depend on current term detection.

## 3. Teacher Management Flow

Purpose: create teachers and assign teaching responsibilities.

Pages:

- `/dashboard/admin/teachers`
- `/dashboard/admin/teachers/new`
- `/dashboard/admin/teachers/[id]`
- `/dashboard/admin/teachers/[id]/edit`
- `/dashboard/admin/teachers/[id]/assign-class`
- `/dashboard/admin/teachers/[id]/assign-subject`
- `/dashboard/admin/teachers/[id]/assignments`
- `/dashboard/teacher`
- `/dashboard/teacher/my-classes`
- `/dashboard/teacher/subjects`

Test steps:

- [ ] Create teacher.
- [ ] Confirm login credential is generated.
- [ ] Confirm staff ID uniqueness.
- [ ] Assign teacher to class terms.
- [ ] Assign teacher to subjects for current term.
- [ ] Confirm old-term and current-term assignments are visually separate.
- [ ] Login as teacher.
- [ ] Confirm teacher sees only assigned classes and subjects.
- [ ] Confirm teacher dashboard current term is correct.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/admin/teachers` | `Keep` | Real, school-scoped query. `teacher-management.ts` has the strongest auth coverage in the codebase — all 14 actions authenticate and role-check. |
| `/dashboard/admin/teachers/new` | `Fix` | Two issues. The super-admin branch of `createTeacher` (`teacher-management.ts:176`) assigns the teacher to `prisma.school.findFirst()` — an arbitrary school. And the route is `new` while every other create route in the app is `create`. |
| `/dashboard/admin/teachers/[id]` | `Keep` | Real fetch via `getTeacher`. |
| `/dashboard/admin/teachers/[id]/edit` | `Keep` | `updateTeacher` authenticates and scopes by school. |
| `/dashboard/admin/teachers/[id]/assign-class` | `Keep` | `teacher-assignment.ts` is the best-guarded action file — 9 actions, all authenticated, 48 `schoolId` references. |
| `/dashboard/admin/teachers/[id]/assign-subject` | `Keep` | Same. |
| `/dashboard/admin/teachers/[id]/assignments` | `Keep` | Real assignment listing. |

Answers to the original test questions:

- **Is staff ID unique per school?** Yes, correctly. `Teacher` has
  `@@unique([staffId, schoolId])`, so two schools can each have staff ID `T001`. This
  is the model the rest of the schema should have followed — compare
  `Student.admissionNo`, which is globally unique.
- **Can a teacher be assigned to multiple classes?** Yes.
  `TeacherClassTerm @@unique([teacherId, classTermId])` allows many class terms per
  teacher, one row each.
- **Can a teacher be assigned to subjects by term?** Yes.
  `TeacherSubject @@unique([teacherId, subjectId, termId])` is term-scoped.
- **Do old-term assignments stay visible but separate?** Yes — term is part of the
  key, so previous terms persist as distinct rows.
- **Does teacher creation generate a valid credential?** Yes. Credentials are created
  with `bcrypt.hash(defaultPassword, 10)`. Contrast `app/actions/profile.ts`, which
  writes empty hashes (see Cross-Cutting Findings).

Left for runtime testing:

- [ ] Confirm the generated default password is actually communicated to the teacher.
- [ ] Confirm the teacher dashboard defaults to the current term, not an arbitrary one.

Decision:

- Status: `AUDITED`
- Notes: Strongest area of the codebase. Only real blocker is the super-admin school
  assignment in `createTeacher`.

## 4. Student Management Flow

Purpose: register students and maintain student records.

Pages:

- `/dashboard/admin/students`
- `/dashboard/admin/students/create`
- `/dashboard/admin/students/[id]`
- `/dashboard/admin/students/[id]/edit`
- `/dashboard/admin/students/[id]/academic-records`
- `/dashboard/student`

Test steps:

- [ ] Create student.
- [ ] Confirm admission number format.
- [ ] Assign student to class and current term.
- [ ] Confirm `StudentClassTerm` enrollment is created once.
- [ ] View student detail page.
- [ ] Edit student personal details.
- [ ] Edit student class/term if needed.
- [ ] Activate/deactivate student.
- [ ] Confirm academic records page loads.
- [ ] Login as student.
- [ ] Confirm dashboard shows real class, subjects, attendance, and results.
- [ ] Confirm empty states are clear when no attendance/results exist.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/admin/students` | `Keep` | Real, school-scoped query with search on `admissionNo`. |
| `/dashboard/admin/students/create` | `Improve` | Correct in structure — transactional, `bcrypt.hash(defaultPassword, 10)` for the credential, admission number from `school.admissionFormat`, and `StudentClassTerm` created in the same transaction. Inherits the admission-number race from section 2. |
| `/dashboard/admin/students/[id]` | `Keep` | Real fetch including parents, assessments, and payments. |
| `/dashboard/admin/students/[id]/edit` | `Keep` | `updateStudent` authenticates via `getAuthenticatedUser` and scopes by school. |
| `/dashboard/admin/students/[id]/academic-records` | `Keep` | Real assessment history. |
| `/dashboard/student` | `Fix` | Real data and good empty states, but three misleading calculations. See below. |

### Fix — the student dashboard's headline numbers are wrong

In `app/dashboard/(roles)/student/page.tsx`:

- **Attendance % is computed over the last 10 records only.** Line 58 fetches
  `attendances: { orderBy: { date: "desc" }, take: 10 }`, then line 75 uses
  `student.attendances.length` as the denominator. The card is labelled "Attendance"
  and reads like a term figure; it can never be one. Either count in the database
  with `prisma.attendance.count`, or relabel it "last 10 days".
- **Zero scores are dropped from the average.** Line 74 filters
  `.filter((score) => score > 0)`, so a student who genuinely scored 0 in a subject
  has that subject excluded and their average inflated. It also does not exclude
  `isAbsent` or `isExempt` rows, so those still count as real zeros elsewhere. The two
  behaviours contradict each other.
- **"Current class" can silently be the wrong class.** Line 68 reads
  `student.classTerms.find(e => e.classTerm.term.isCurrent) ?? student.classTerms[0]`.
  With no current-term enrolment it presents an arbitrary past enrolment as current.
  Show an explicit "not enrolled in the current term" state instead.

Answers to the original test questions:

- **Is the admission number generated correctly?** Format and prefix work, but see the
  preview/actual mismatch and the concurrency race in section 2.
- **Can a student be created without duplicate class-term records?** Yes, and the
  database enforces it: `StudentClassTerm @@unique([studentId, classTermId])` plus
  `@@unique([studentId, termId, status])`, so at most one active enrolment per term.
  Note that `app/actions/debug-student-assignments.ts` exists specifically to repair
  duplicate assignments, which suggests duplicates predate those constraints — check
  existing data before trusting it.
- **Does the student dashboard use real data?** Yes. There is no mock data anywhere in
  the app. The problem is the arithmetic, not the source.
- **Are empty states clear?** Yes — "No attendance records yet.", "No records", and
  grade "Pending".

### Improve — admission numbers are globally unique

`Student.admissionNo` is `@unique` platform-wide, and student login uses the admission
number as the credential value (`student-management.ts:157`), where
`Credential.value` is also globally unique. Two schools therefore cannot both issue
`001/2026`. `Teacher` already solves this correctly with
`@@unique([staffId, schoolId])`. Decide this before onboarding a second school.

Decision:

- Status: `AUDITED`
- Notes: Data flow is correct and properly scoped. The dashboard arithmetic is the
  blocker, plus the global-uniqueness decision.

## 5. Parent Management Flow

Purpose: create parents and link them to students.

Pages:

- `/dashboard/admin/parents`
- `/dashboard/admin/parents/create`
- `/dashboard/admin/parents/[id]`
- `/dashboard/admin/parents/[id]/edit`
- `/dashboard/parent`

Test steps:

- [ ] Create parent.
- [ ] Confirm parent credential is generated.
- [ ] Link parent to one student.
- [ ] Link parent to multiple students.
- [ ] Link a student to multiple parents.
- [ ] Confirm parent details show linked students.
- [ ] Login as parent.
- [ ] Confirm parent dashboard shows only linked children.
- [ ] Confirm attendance, result average, and payment summary are accurate.
- [ ] Confirm payment empty state is clear before finance module.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/admin/parents` | `Keep` | Real, school-scoped query. |
| `/dashboard/admin/parents/create` | `Keep` | `createParent` authenticates through the `checkAuthorization` helper and scopes by school. |
| `/dashboard/admin/parents/[id]` | `Keep` | `getParentDetails` is authorized and returns linked students. |
| `/dashboard/admin/parents/[id]/edit` | `Keep` | `updateParent` is authorized and school-scoped. |
| `/dashboard/parent` | `Fix` | Same misleading arithmetic as the student dashboard, and worse in one respect. See below. |

### Fix — the parent dashboard blends all children into one number

In `app/dashboard/(roles)/parent/page.tsx`:

- **Attendance % pools every child together.** Line 45 fetches
  `attendances: { orderBy: { date: "desc" }, take: 5 }` per child, and line 79
  flattens them with `children.flatMap(child => child.attendances)`. A parent with
  three children sees one "Attendance" figure computed over 15 records total — not per
  child, and not over the term. Show it per child.
- **Same `?? child.classTerms[0]` fallback** (line 106), so a child with no
  current-term enrolment is shown an arbitrary past class as their current one.
- **Same `.filter((score) => score > 0)`** (line 110), dropping genuine zeros from the
  average.

Answers to the original test questions:

- **Can one parent link to multiple children, and one student to multiple parents?**
  Yes. `StudentParent @@unique([studentId, parentId])` is a proper join table —
  many-to-many in both directions, with duplicate links prevented.
- **Can an existing parent be found and linked?** Yes. `searchParents`,
  `getUnlinkedStudents`, and `linkStudentToParent` all exist and are authorized.
- **Does the parent dashboard show only their own children?** Yes, scoped through the
  `Parent` record for the signed-in user.
- **Does the payment summary show accurate data or a clear empty state?** The empty
  state is good: "No payment records yet. The finance module will expand this area."
  The summary already reads real `Payment` rows and filters on
  `feeStructure.term.isCurrent`, which is the right shape.
- **Should the fees link stay dashboard-only until finance exists?** Yes. The dashboard
  already degrades gracefully, so there is nothing to hide.

### Improve — "Pending Fees" understates what is owed

Line 76 computes `pendingAmount` by summing `Payment` rows with status `PENDING`. A fee
that was never billed has no `Payment` row at all, so it contributes nothing. Once
finance exists this figure must become
`sum(FeeStructure for the child's class term) - sum(COMPLETED payments)`, or it will
read as "nothing owed" for a student who has paid nothing.

Decision:

- Status: `AUDITED`
- Notes: The linking model is correct and is the cleanest part of the schema. Fix the
  dashboard arithmetic; the parent flow is otherwise finance-ready.

## 6. Assessment Compiler Flow

Purpose: enter scores and generate academic results.

Admin pages:

- `/dashboard/admin/compiler/subject-results/entry`
- `/dashboard/admin/compiler/class-results`
- `/dashboard/admin/compiler/class-results/termly`
- `/dashboard/admin/compiler/continuous-assessments`
- `/dashboard/admin/compiler/student-reports`

Teacher pages:

- `/dashboard/teacher/compiler`
- `/dashboard/teacher/compiler/subject-results/entry`
- `/dashboard/teacher/compiler/continuous-assessments`

Test steps:

- [ ] Select term.
- [ ] Select class term.
- [ ] Select subject.
- [ ] Confirm only enrolled students load.
- [ ] Enter CA1, CA2, CA3, and exam.
- [ ] Test absent/exempt states.
- [ ] Save scores.
- [ ] Confirm save updates existing assessment instead of duplicating.
- [ ] Confirm grade and remark calculation.
- [ ] Check class result aggregation.
- [ ] Check termly class result aggregation.
- [ ] Generate student report card.
- [ ] Confirm PDF has correct school, class, term, subject, grading system.
- [ ] Test table usability on small screens.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/admin/compiler/subject-results/entry` | `Fix` | Cross-tenant validation gap plus the duplicate-assessment bug. See below. |
| `/dashboard/admin/compiler/class-results` | `Fix` | Averages divide by every class subject regardless of exemption or missing entry. See below. |
| `/dashboard/admin/compiler/class-results/termly` | `Improve` | Real aggregation, same averaging flaw. |
| `/dashboard/admin/compiler/continuous-assessments` | `Improve` | Real CA data; inherits the hardcoded 10/10/10/70 split. |
| `/dashboard/admin/compiler/student-reports` | `Improve` | Report data is real and uses the school's grading system, but a transient database error stamps the student with an `F`. See below. |
| `/dashboard/teacher/compiler` | `Keep` | `teacher-compiler.ts` authorizes through `authorizeTeacherAndGetData` and scopes every query by teacher and school. |
| `/dashboard/teacher/compiler/subject-results/entry` | `Fix` | This is the code path that creates duplicate assessment rows. See below. |
| `/dashboard/teacher/compiler/continuous-assessments` | `Improve` | Same hardcoded score split. |

### Fix — saving scores can create a second row for the same student, subject, and term

This is the most consequential correctness bug found, and it needs a schema migration,
so it must be resolved before real data exists.

`Assessment` is keyed `@@unique([studentId, subjectId, termId, teacherId])`. Because
`teacherId` is part of the key, the database permits two score rows for the same
student, subject, and term as long as a different teacher saved them. The two save
paths then disagree about how to find an existing row:

- **Admin path** — `compiler-improved.ts:583` queries existing assessments by
  `studentId, subjectId, termId` with **no** `teacherId` filter, so it correctly
  updates whatever row is already there.
- **Teacher path** — `teacher-assessments.ts:709` queries with
  `teacherId: teacher.id` included. A teacher never sees a row saved under a different
  teacher id, so it falls through to `prisma.assessment.create` and a **duplicate row
  is inserted**.

The teacher id written for a given save is itself unstable. `findAssignedTeacher`
(`compiler-improved.ts:67`) resolves it through a fallback chain: the subject teacher
from `TeacherSubject`, else the class teacher from `TeacherClassTerm`, else `null`
with the message "Assessments will be saved without teacher assignment." So the same
student, subject and term can accumulate separate rows for the subject teacher, the
class teacher, and `null` — and simply assigning a subject teacher *after* an admin
has entered scores is enough to trigger it.

Teacher reassignment mid-term is normal in schools, so this will happen in production.

- [ ] Change the key to `@@unique([studentId, subjectId, termId])` and keep
      `teacherId` as a plain attribute recording who entered the score.
- [ ] Make both save paths use a single `upsert` on that key.
- [ ] Check existing data for duplicates before migrating.

### Fix — class result averages divide by every subject

`compiler.ts:479` sets `subjectCount = classSubjects.length` and line 499 computes
`averageScore = totalScore / subjectCount`. Two consequences:

- An **exempt** student scores 0 for that subject (line 486, "Treat absent/exempt as
  0") and is still divided by the full subject count, so exemption is penalised exactly
  like a zero. An exempt subject should leave both the numerator and the denominator.
- **Mid-term entry looks like failure.** If only 3 of 9 subjects have been entered,
  every student is still divided by 9, so averages and positions are wrong and
  misleadingly low until the last subject is saved. Nothing on the page says the data
  is incomplete.

A missing assessment is also indistinguishable from a genuine zero, and positions are
ranked on `totalScore` while the displayed grade comes from `averageScore`.

### Fix — a database error becomes a failing grade

`calculateGradeFromScore` ends its `catch` with
`return { grade: "F", remark: "Error" }` — in `compiler-improved.ts`,
`teacher-assessments.ts`, and `teacher-compiler.ts`. A transient database failure while
reading the grading system stamps a student with an F that then flows onto the report
card. Return `null` and render "unavailable" instead.

The three copies are currently identical in their fallback bands (A1 at 80, A2 at 70,
B1 at 60, B2 at 50, C1 at 45, C2 at 40) so there is no divergence today — but three
copies of the grading rules is exactly how divergence starts. Collapse them into one.

### Fix — score entry does not verify the school owns the records

`compiler-improved.ts:491` — `saveAssessments(assessments, termId, subjectId, schoolId)`
takes `schoolId` from the caller and never uses it. It validates that the term, subject,
students, and student-class-terms exist (lines 523-567) but every one of those queries
is unscoped — `prisma.student.findMany({ where: { id: { in: studentIds } } })` matches
students in any school. `authorizeAndGetUser` knows the caller's real school; use it
and drop the client-supplied parameter.

### Improve — the score split is hardcoded

`validateScore(assessment.ca1, "CA1", 10)` and `validateScore(assessment.exam, "Exam", 70)`
fix the scheme at CA 10/10/10 plus a 70-mark exam. Schools that use 40/60 or two CAs
cannot be configured. Answering the plan's question "Are scores validated correctly?":
yes, bounds are enforced and rejected server-side — but only for that one scheme.

### Improve — absent and exempt are stored as zero

The save path writes `ca1: assessment.ca1 ?? 0` alongside `isAbsent` and `isExempt`
(`teacher-assessments.ts:764`). The flags are preserved, so aggregation can and does
check them, but the stored score for an absent student is `0` rather than `null`. Any
future query that forgets to check the flag will silently treat absence as a zero.

### Improve — production logging is very noisy

The compiler actions log full assessment payloads with
`JSON.stringify(data, null, 2)` per student (`teacher-assessments.ts:775`), plus batch
progress and teacher-resolution details. That is student score data in the application
log. Strip it before deployment.

Answers to the original test questions:

- **Do only enrolled students appear?** Yes — students come from `StudentClassTerm` for
  the selected class term.
- **Do only assigned subjects appear for a teacher?** Yes — the teacher path filters
  through `TeacherSubject` and `TeacherClassTerm`.
- **Are absent/exempt states handled?** Yes at save and in aggregation, with the
  storage caveat above.
- **Does save update instead of duplicating?** Not reliably — see the duplicate bug.
- **Does the class result calculate average and position correctly?** Positions and tie
  handling are correct. Averages are not, for exempt students and for partially entered
  terms.
- **Does the report card use the correct grading system?** Yes, the school's configured
  system, with a silent hardcoded fallback when none exists.

Decision:

- Status: `AUDITED`
- Notes: The most complex area and the one carrying the most risk. The
  `Assessment` unique-key change is a migration, so schedule it before real score data
  accumulates — this is the single strongest reason not to start finance yet.

## 7. Attendance Flow

Purpose: teacher marks attendance; student and parent see summary.

Pages:

- `/dashboard/teacher/attendance`
- `/dashboard/student`
- `/dashboard/parent`

Test steps:

- [ ] Login as teacher.
- [ ] Select assigned class.
- [ ] Select date.
- [ ] Confirm students load.
- [ ] Mark present, absent, and late.
- [ ] Confirm repeated same-date marking updates existing record.
- [ ] Login as student and confirm attendance snapshot.
- [ ] Login as parent and confirm child attendance snapshot.
- [ ] Confirm percentage calculations.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/teacher/attendance` | `Fix` | The write path has no authorization beyond "is a teacher". See below. |
| `/dashboard/student` (attendance card) | `Fix` | Percentage computed over the last 10 records. Covered in section 4. |
| `/dashboard/parent` (attendance card) | `Fix` | Percentage pooled across all children over their last 5 records each. Covered in section 5. |

### Fix — any teacher can mark attendance for any student in any school

`teacher-management.ts:1256` — `markAttendance` checks only
`session.user.role !== "TEACHER"`, then writes attendance for whatever `studentId` it is
given. There is no `TeacherClassTerm` check and no `schoolId` scoping, so a teacher at
one school can record attendance for a student at another.

The read path already does this correctly: `getClassAttendance` (line 1301) looks up
`teacherClassTerm` and returns "You are not assigned to this class" when the teacher is
not assigned. Apply the same check to the write.

### Improve — nothing prevents duplicate attendance rows

`Attendance` has no unique constraint at all — no `@@unique([studentId, date])` and no
`classTermId` on the model. Duplicate protection depends entirely on `markAttendance`
doing `findFirst` then `update`, which is a read-modify-write with no constraint behind
it. Add `@@unique([studentId, date])` and use `upsert`.

The date handling works today but is fragile. The UI sends
`format(selectedDate, "yyyy-MM-dd")`, which `new Date(...)` parses as **midnight UTC**,
while `getClassAttendance` builds its day window from `new Date(y, m, d)` — midnight
**local**. At UTC+1 the record still lands inside the window, so it behaves correctly
in Nigeria. At a negative UTC offset the record would fall on the previous day. Pin the
date handling explicitly rather than relying on the deployment timezone.

### Improve — attendance is not attributable to a class or term

`Attendance` stores only `studentId`, `date`, and `status`. There is no `classTermId` or
`termId`, so "attendance this term" has to be inferred from date ranges, and a student
who transfers class mid-term cannot have their attendance split between the two. Add
`classTermId` before the data grows.

### Improve — no bulk save

`teacher-attendance-view.tsx:78` calls `markAttendance` once per student, per click,
with `setSaving(true)` around each call. Marking a class of 40 is 40 separate server
round-trips. Answering the plan's question "Does the UI make bulk attendance easy
enough?" — no. Add a "mark all present" action and a single batched save.

The component does check the returned result correctly, so failures are reported
honestly.

Answers to the original test questions:

- **Does a teacher only see assigned classes?** For reading, yes. For writing, no.
- **Does same-date attendance update the existing record?** Yes in practice today, but
  only by convention — there is no database constraint enforcing it.
- **Are statuses consistent?** Yes, `PRESENT` / `ABSENT` / `LATE` throughout.
- **Does the dashboard calculate the percentage correctly?** No — see sections 4 and 5.

Decision:

- Status: `AUDITED`
- Notes: The missing authorization on `markAttendance` is the highest-severity
  authorization gap in the audit. Fix it before any pilot with more than one school.

## 8. Student Transition Flow

Purpose: move students between terms/classes.

Pages:

- `/dashboard/admin/compiler/student-transitions`

Test steps:

- [ ] Select source term.
- [ ] Select destination term.
- [ ] Select source class term.
- [ ] Select destination class term.
- [ ] Confirm eligible students load.
- [ ] Select students.
- [ ] Execute transition.
- [ ] Confirm transition history is recorded.
- [ ] Confirm student current class changes.
- [ ] Confirm duplicate active enrollments are not created.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/admin/compiler/student-transitions` | `Improve` | The core logic is the best-written transaction in the codebase — atomic, audited, with real eligibility checks. Three design gaps below stop it being `Keep`. |

What is already correct in `executeStudentTransitions` (`student-transitions.ts:506`):

- The whole batch runs inside `prisma.$transaction`, so a partial promotion cannot
  happen.
- Both the source and destination class terms are verified to belong to the admin's
  school (line 545).
- The student must actually be in the source class (line 574) and must not already be
  in the destination (line 579) — so promotion cannot create duplicates.
- Every move writes a `StudentTransition` audit row with `createdBy` and
  `transitionDate`.

### Fix — WITHDRAWAL still enrols the student somewhere

`transitionType` accepts `"WITHDRAWAL"`, but the function unconditionally requires a
`toClassTermId` and creates a `StudentClassTerm` at the destination (line 593). A
withdrawal should close the existing enrolment, not open a new one. `TRANSFER` has the
same problem if the destination is outside the school.

### Fix — the source enrolment is never closed

The destination `StudentClassTerm` is created, but the source record is left untouched —
no status change, no end date. For a promotion into a new term that is harmless, because
the two rows sit in different terms and the dashboards pick the current one. Within a
single term it is not harmless: `StudentClassTerm @@unique([studentId, termId, status])`
means the second row collides with the first and the transaction throws a raw Prisma
error rather than a readable message.

The schema has an `EnrollmentStatus` enum and a `StudentEnrollmentHistory` model for
exactly this, and neither is written here. Decide which of `StudentTransition` and
`StudentEnrollmentHistory` is the real history table — maintaining two is how they drift.

### Improve — one ineligible student fails the whole batch, with an unreadable message

Line 575 throws `Student ${studentId} not found in source class` from inside the
transaction loop, so a single bad row rolls back every other student, and the message
contains a raw UUID rather than a name or admission number. Validate the whole selection
up front and report the ineligible students by name before committing anything.

### Improve — super admin transitions are unscoped

`authorizeAndGetSchoolId` (line 9) returns `undefined` for a SUPER_ADMIN, and the school
check at line 545 is guarded by `if (schoolId && ...)`. For a super admin the check is
skipped entirely, so students can be moved between schools. If that is intended, make it
explicit; if not, require a school.

This matters more broadly. The same helper is used for the read queries, where
`where: { schoolId }` with `schoolId === undefined` does not match nothing — Prisma drops
the filter, so the query silently spans every school. The identical helper exists in
`compiler.ts:9`, `compiler-enhanced.ts`, and `student-reports.ts`. It is intentional for
super admins today, but any future path that returns `undefined` unexpectedly loses
tenant isolation without any error.

Answers to the original test questions:

- **Do source and destination class terms load correctly?** Yes, both are fetched and
  school-verified.
- **Does the eligibility logic make sense?** Yes for promotion — source membership and
  destination absence are both checked.
- **Can students be promoted without duplicates?** Yes, guarded in code and by
  `@@unique([studentId, classTermId])`.
- **Is transition history readable?** `getTransitionHistory` exists and returns real
  records. Confirm at runtime that it renders names rather than ids.
- **Does the student's current class update after transition?** Yes when the destination
  is in the current term, because the dashboards resolve the current class via
  `term.isCurrent`. It does not update if the destination term is not current.

Decision:

- Status: `AUDITED`
- Notes: Promotion is safe to use. Withdrawal and same-term transfer are not — restrict
  the transition type to `PROMOTION` in the UI until the enrolment-closing logic exists.

## 9. School Settings Flow

Purpose: manage school-level behavior.

Pages:

- `/dashboard/admin/school-settings`
- `/dashboard/admin/school-settings/information`
- `/dashboard/admin/school-settings/admission`
- `/dashboard/admin/school-settings/grading-systems`

Test steps:

- [ ] Update school contact details.
- [ ] Upload/change school logo.
- [ ] Confirm logo appears in dashboard/report areas.
- [ ] Configure admission prefix and format.
- [ ] Confirm admission number preview/generation.
- [ ] Configure grading system.
- [ ] Confirm compiler and reports use active grading system.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/admin/school-settings` | `Keep` | Hub page over real settings. |
| `/dashboard/admin/school-settings/information` | `Improve` | Writes correctly and is school-scoped. Errors are thrown rather than returned, so the admin only ever sees a generic toast — Next.js redacts thrown server-action messages in production. |
| `/dashboard/admin/school-settings/admission` | `Fix` | Preview disagrees with the generated number, and the sequence increment is not atomic. Detailed in section 2. |
| `/dashboard/admin/school-settings/grading-systems` | `Improve` | Real, and genuinely applied to results. Two gaps below. |

`school-settings.ts` is the most thoroughly guarded action file in the codebase — 14
actions, all authenticated, all role-checked, 63 `schoolId` references. Nothing here
leaks across schools.

### Improve — a missing grading system fails silently instead of loudly

`calculateGradeFromScore` falls back to a hardcoded WAEC-style band set when a school
has no grading system configured, so report cards can be produced carrying grades the
school never approved. Surface an explicit "no grading system configured" state, and
block result publishing until one exists.

### Improve — grade bands are not validated for gaps or overlaps

Grades are matched with `levels.find(l => score >= l.minScore && score <= l.maxScore)`.
Nothing stops an admin creating bands that overlap (the first match silently wins) or
that leave a gap (the score falls through to `F`). Validate on save that the bands cover
0-100 exactly once.

Answers to the original test questions:

- **Does the grading system affect result and report calculations?** Yes — it is read
  per school and applied to every score and to the overall average.
- **Does the admission format preview work?** It renders, but see the mismatch in
  section 2 — the preview and the real number disagree for the first student of a year.
- **Are settings grouped clearly?** Yes, the hub-and-spoke split across information,
  admission, and grading is sensible.
- **Does the logo upload and display work?** Not verified statically — the layout reads
  `school.logoUrl` and passes it through, so confirm the upload path at runtime.

Decision:

- Status: `AUDITED`
- Notes: Structurally the safest area. Fix the admission-number race and add the
  grading-band validation; both are small changes.

## 10. Finance Module Readiness

Do not add finance until these are confirmed:

- [ ] School exists and admin scoping is correct.
- [ ] Current session and term are correct.
- [ ] Classes exist.
- [ ] Class terms exist.
- [ ] Students are enrolled in class terms.
- [ ] Parents are linked to students.
- [ ] Parent dashboard shows linked children correctly.
- [ ] Student dashboard shows current academic data correctly.
- [ ] Payment model relationship to student and fee structure is clear.

Planned finance pages:

- `/dashboard/admin/finance`
- `/dashboard/admin/finance/fee-structures`
- `/dashboard/admin/finance/payments`
- `/dashboard/admin/finance/invoices`
- `/dashboard/admin/finance/reports`
- `/dashboard/parent/fees`
- `/dashboard/student/fees`

Planned finance flow:

- [ ] Admin creates fee structure for class and term.
- [ ] Admin records payment.
- [ ] Parent sees invoice/payment status.
- [ ] Student detail shows payment history.
- [ ] Admin sees paid, pending, and debtors.
- [ ] System generates receipts/statements.

Existing schema (already in `prisma/schema.prisma`):

The data model is partly built. Finance is a UI and server-action gap, not a schema
gap. `FeeStructure`, `Payment`, and `PaymentStatus` (PENDING, COMPLETED, FAILED,
REFUNDED) already exist, and `Class` already exposes `feeStructures`.

Resolve these schema questions before building the finance UI:

- [ ] `FeeStructure` is keyed on `classId` + `termId`, not `classTermId`. Every
      other flow in the app is built on `ClassTerm`. Decide whether to move
      `FeeStructure` onto `ClassTerm`, or accept that a fee can be defined for a
      class/term pair that has no `ClassTerm` record.
- [ ] `FeeStructure` has no `schoolId`. School scoping only works through
      `class.schoolId`. Confirm every finance query filters through the class, or
      add `schoolId`.
- [ ] `Payment` has no `schoolId`, `termId`, or `sessionId`. Term-level reports must
      join through `feeStructure`. Confirm that is acceptable for reporting.
- [ ] `Payment.amount` and `FeeStructure.amount` are `Float`. Money in floating
      point accumulates rounding errors. Switch to `Decimal` or integer kobo before
      recording real payments.
- [ ] There is no balance or outstanding field. Decide whether a student's balance
      is always computed as fee total minus completed payments, and whether partial
      payments create multiple `Payment` rows.
- [ ] There is no discount, waiver, or scholarship model. Decide whether that is
      needed for launch.
- [ ] `Payment.receiptNo` is globally unique. Confirm the generator is safe across
      schools and cannot collide under concurrent writes.

Decision:

- Status: `AUDITED — NOT READY`
- Notes: The prerequisites are in better shape than expected. School, session, term,
  class, class term, student enrolment, and parent linking are all real, transactional,
  and correctly school-scoped, and the parent dashboard already reads `Payment` rows
  with a sensible empty state. The blockers are not in the finance model itself:

  1. **Current term detection is broken for admins.** Every finance query will filter on
     the current term, and an admin currently cannot set it (section 2).
  2. **The `Assessment` unique key needs a migration** (section 6). Do that migration
     before adding finance tables, not after.
  3. **Money is stored as `Float`.** Change it before the first real payment is
     recorded.
  4. **`FeeStructure` is keyed on `classId` + `termId` rather than `classTermId`**,
     which sidesteps the join the rest of the app is built on.

  Items 2 and 3 are both schema migrations. Batch them together with the
  `Attendance @@unique` and `Student.admissionNo` decisions into one migration before
  building anything new.

## 11. Pages Not Covered Above

These routes exist in `app/dashboard` but were missing from the flow list.

Verdicts:

| Page | Verdict | Evidence |
| --- | --- | --- |
| `/dashboard/admin/calendar` | `Fix` | No role check at all (see Cross-Cutting Findings). Data itself comes from `getSchoolCalendarData`, which is authenticated. |
| `/dashboard/admin/classes/[id]/subjects/assign` | `Keep` | `assignSubjectsToClass` authenticates and scopes by school. |
| `/dashboard/admin/classes/edit` | `Fix` | Orphan route — renders the classes list under an "edit" URL. Delete it. |
| `/dashboard/admin/subjects/[id]/assign-teachers` | `Keep` | `assignTeachersToSubject` authenticates and scopes by school. |
| `/dashboard/super-admin/users/students` | `Keep` | Real global query — correct scope for a super admin. |
| `/dashboard/super-admin/users/teachers` | `Keep` | Same. |
| `/dashboard/super-admin/users/parents` | `Keep` | Same. |
| `/dashboard/teacher/my-classes` | `Improve` | Real class data, but the "Student Transitions" tab is an honestly-labelled "Coming Soon" placeholder (`teacher-classes-view.tsx:336`). Hide the tab until it does something. |
| `/dashboard/teacher/subjects` | `Keep` | Real, teacher-scoped subject listing. |
| `/dashboard/profile` | `Fix` | Adding an email, phone, or registration number creates a credential with an empty password hash that can never be used to log in, and can hit an unhandled unique-constraint error. See Cross-Cutting Findings. |
| `/dashboard/access-error` | `Keep` | Real styled page explaining the problem, with a way back. |
| `/maintenance` | — | Not audited. Confirm at runtime. |
| `/error` | — | Not audited. Confirm at runtime. |

Known issues to fix:

- [ ] `app/dashboard/(roles)/admin/classes/edit/page.tsx` renders the full classes list
      at `/dashboard/admin/classes/edit`. It is a duplicate of
      `/dashboard/admin/classes` and has no `[id]`, so the URL is misleading. The real
      edit route is `/dashboard/admin/classes/edit/[id]`. Delete the orphan page.
- [ ] Route naming is inconsistent: teachers use `/teachers/new` while students,
      parents, classes, subjects, sessions, and terms use `/create`. Pick one.
- [ ] Delete `app/actions/debug-student-assignments.ts` and
      `components/debug-student-assignments.tsx`. The component is never routed but the
      destructive server actions remain callable.
- [ ] Delete `app/actions/compiler-enhanced.ts` — nothing imports it.
- [ ] Delete `components/student-transitions/ClassTermSetupWizard.tsx` — never routed,
      and it fakes success.

Corrected from the first pass: `/dashboard/super-admin/system` and
`/dashboard/super-admin/analytics` are short because they are thin server wrappers that
delegate to components, not because they are placeholders. The real content lives in
`components/system/system-settings.tsx` and
`components/analytics/super-admin-analytics.tsx`. Their verdicts are in section 1 and
they are driven by what those components do, not by page length.

Decision:

- Status: `AUDITED`
- Notes: Mostly clean. The cleanup list above removes four dead files and one orphan
  route.

## Final Go/No-Go

Audit status per flow. "Accepted" means someone has signed off after the listed fixes
land — the audit itself does not accept anything.

| Flow | Audit result | Blockers | Accepted |
| --- | --- | --- | --- |
| 1. Super admin | Sound | `/system` is fake | [ ] |
| 2. Admin setup | Sound with one serious defect | Set-current is broken and lies | [ ] |
| 3. Teacher management | Strongest area | Super-admin school assignment | [ ] |
| 4. Student management | Data flow correct | Dashboard arithmetic | [ ] |
| 5. Parent management | Cleanest schema area | Dashboard arithmetic | [ ] |
| 6. Assessment compiler | Highest risk | Duplicate assessment rows; averaging | [ ] |
| 7. Attendance | Write path unauthorized | `markAttendance` authorization | [ ] |
| 8. Student transitions | Promotion is safe | Withdrawal and same-term transfer | [ ] |
| 9. School settings | Safest area | Admission-number race | [ ] |
| 10. Finance readiness | Not ready | Four items, two are migrations | [ ] |
| 11. Uncovered pages | Mostly clean | Five dead files, one orphan route | [ ] |

### Progress (2026-08-22)

Items 1, 2, 3, and 6 were completed in a parallel working session; items 5 and the missed
super-admin silent-success site were completed here. All verified against the current
working tree.

| Item | Status | What landed |
| --- | --- | --- |
| 1. `markAttendance` authorization | **Done** | Now takes `classTermId`, validates date and status, and requires an ACTIVE `StudentClassTerm` whose `classTerm.teachers` includes the caller. Also normalizes the stored date to local day-start and wraps the read-modify-write in a transaction, which closes the timezone mismatch too. Caller updated to pass `classTermId`. The race remains until `@@unique([studentId, date])` exists (item 14). |
| 2. Set-current session/term | **Done** | Both actions now accept ADMIN, and — importantly — verify ownership: `setCurrentSession` checks `admin.schoolId === schoolId` then that the session belongs to it; `setCurrentTerm` resolves the term's `session.schoolId` and compares. Widening the role did not open a cross-school hole. The three admin tables now check `result.success`. |
| 3. `createTeacher` super-admin branch | **Done** | `prisma.school.findFirst()` replaced with a required, validated `data.schoolId`. |
| 5. Role guards | **Done** | Added `app/dashboard/(roles)/admin/layout.tsx` guarding the whole admin subtree. It permits ADMIN and SUPER_ADMIN, because four admin pages deliberately allow super admins; their stricter per-page checks still apply. This covers `/dashboard/admin` and `/dashboard/admin/calendar` without editing the client component. |
| 6. Grade-on-error | **Done** | The three `return { grade: "F", remark: "Error" }` catches are gone. The two remaining `remark: "Error"` sites set `grade: null` and `totalScore: null`, so they report a failure rather than inventing one — those are fine as they are. |
| 2b. `terms-table.tsx` | **Done** | The super-admin table was missed by the item-2 pass; both `deleteTerm` and `setCurrentTerm` now check `result.success`. |
| 5b. Dead `/login` redirect | **Done** | The item-5 guards added in the parallel session redirected unauthenticated users to `/login`, which is not a route — the login page is `/auth/login`. Confirmed `GET /login` returns 404 against the running dev server. Fixed in `admin/page.tsx`, `admin/calendar/page.tsx`, and `admin/students/[id]/edit/page.tsx` (the last was pre-existing). |
| 4. `saveAssessments` scoping | **Done** | Completed in the parallel session, and beyond the original scope: the term is scoped via `session.schoolId`, the subject and students are checked against the school, and `studentClassTerm` is scoped by `termId`, `status: "ACTIVE"`, and school on both the student and the class. It also now validates that each `studentId` actually belongs to the `studentClassTermId` it was sent with, and rejects a batch spanning more than one class term — which removes the "take the first one" assumption flagged in section 6. For a SUPER_ADMIN the client-supplied `schoolId` is still trusted, since the authorized value is `undefined`; that is consistent with super-admin scope elsewhere. |
| 17a. Orphan route | **Done** | `app/dashboard/(roles)/admin/classes/edit/page.tsx` deleted. Verified first that nothing links to the bare path — both real links (`admin/classes/[id]/page.tsx:114` and `admin-all-classes.tsx:97`) target `classes/edit/[id]`, which is intact. |
| 17b. Remaining dead files | **Blocked — needs a decision** | `git rm` refused `compiler-enhanced.ts`, `debug-student-assignments.ts`, and `ClassTermSetupWizard.tsx` because all three carry uncommitted local edits (23 insertions, 7 deletions total) that git could not restore afterwards. Not forced. Commit or discard those edits first, then delete. `components/debug-student-assignments.tsx` is clean but was left in place so the debug pair is removed together. |

Verified against the running dev server: `/dashboard/admin/calendar` returns 307 and lands
on `/dashboard/super-admin` 200 for a super-admin session — the layout guard and the stricter
page guard compose correctly, and no route 404s.

The whole first group — items 1 through 6, correctness and authorization — is now
complete. Next open items: 7 (`getSystemSettings` still returns hardcoded
`defaultSettings`), 8, 12 (the `Assessment` unique key, still filtering by `teacherId` at
`teacher-assessments.ts:709`), 17b, and 20 (42 `console.log` calls remain across the two
compiler action files).

### Fix order

Work top down. Everything above the migration line is a code change; the migration
group should land as one migration before real data accumulates.

**Correctness and authorization — do first**

1. `markAttendance` — add the `TeacherClassTerm` check and school scoping
   (`teacher-management.ts:1256`). Any teacher can currently write attendance for any
   student in any school.
2. Set-current session/term — either allow ADMIN in
   `setCurrentSession` / `setCurrentTerm`, or remove the button from the admin tables.
   Then fix the six sites that discard the returned failure and toast success anyway.
3. `createTeacher` super-admin branch — stop using `prisma.school.findFirst()`
   (`teacher-management.ts:176`).
4. `saveAssessments` (`compiler-improved.ts:491`) — scope the validation queries by the
   caller's school instead of taking `schoolId` from the client.
5. Role guards on `/dashboard/admin` and `/dashboard/admin/calendar`, ideally via a
   shared `(roles)/layout.tsx`.
6. `calculateGradeFromScore` — stop returning `F` from the `catch`.

**Misleading output — do next**

7. Remove `performSystemBackup` and the settings form, or implement them. Reporting a
   backup that did not happen is the worst failure mode in the app.
8. Student and parent dashboard arithmetic — attendance denominators, the `score > 0`
   filter, and the `classTerms[0]` fallback.
9. Class-result averaging — exclude exempt subjects and unentered subjects from the
   denominator, and show an "incomplete" state.
10. Admin dashboard — remove the duplicate Academic tab, the dead Export Report button,
    and the placeholder Settings tab.
11. Relabel "top performing schools" on the super-admin dashboard and analytics page,
    and hide the two "coming soon" panels.

**Migrations — batch into one**

12. `Assessment` — change to `@@unique([studentId, subjectId, termId])` and make both
    save paths upsert on it. Check existing data for duplicates first.
13. `FeeStructure.amount` and `Payment.amount` — `Float` to `Decimal` or integer kobo.
14. `Attendance` — add `@@unique([studentId, date])` and a `classTermId`.
15. `Student.admissionNo` and `Credential.value` — decide whether to scope uniqueness
    per school, following the `Teacher` model's `@@unique([staffId, schoolId])`.
16. `FeeStructure` — decide between `classId` + `termId` and `classTermId`.

**Cleanup**

17. Delete `app/actions/debug-student-assignments.ts`,
    `components/debug-student-assignments.tsx`, `app/actions/compiler-enhanced.ts`,
    `components/student-transitions/ClassTermSetupWizard.tsx`, and
    `app/dashboard/(roles)/admin/classes/edit/page.tsx`.
18. Collapse the five compiler action files and the three copies of
    `calculateGradeFromScore` into one implementation.
19. Pick one error convention for the action layer — currently `session-management` and
    `term-management` return failures while the rest throw.
20. Strip `console.log` of score payloads and login identifiers.
21. Rename `/teachers/new` to `/teachers/create`.
22. Clear the 191 suppressed type errors, then turn off
    `typescript: { ignoreBuildErrors: true }` in `next.config.ts`.

### What this audit did not cover

Static code review only. Nothing below was exercised against a running app, and each
still needs a manual pass:

- [ ] Logo upload and display.
- [ ] Whether generated default passwords reach the teacher, student, or parent.
- [ ] Mobile layout on every table-heavy page.
- [ ] Report card PDF output against a real grading system.
- [ ] `/maintenance` and `/error`.
- [ ] Existing production data for the duplicate assessments and duplicate student
      assignments the schema now prevents but previously allowed.

Final decision:

- `READY_FOR_FINANCE`: No
- Notes: The foundation is stronger than the checklist assumed — real data everywhere,
  no mock data, consistent school scoping, and genuine transactions in the places that
  matter. What is missing is not features but truthfulness: several screens report
  success for work that did not happen. Fix items 1-11, land the migration batch, then
  reassess.
