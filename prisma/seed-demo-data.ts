/**
 * A whole school year, built the way the system itself would build it.
 *
 * This is not a pile of rows shaped like the schema. It walks the modules in the order a
 * real school walks them — super admin, school, calendar, academics, staff, admissions,
 * fees, scores, results, promotion, payroll, expenditure — and at each step it calls the
 * same shared logic the application calls:
 *
 *   raiseEnrolmentCharges   lib/fee-charges.server.ts   what a new enrolment is billed
 *   schedulesForEnrolment   lib/fee-charges.ts          new vs returning student scoping
 *   resolveGrade            lib/grading.ts              score -> grade band
 *   buildClassTermResults   lib/results/                totals, averages, positions
 *   assignPositions         lib/results/                ties share a place
 *   evaluatePromotionEligibility  lib/promotion.ts      who may go up
 *   computePay              lib/payroll.ts              base, allowances, tax, net
 *
 * That matters: data seeded through a parallel reimplementation proves nothing, because it
 * can be self-consistent and still disagree with the app. Everything here is produced by
 * the same functions the running system uses, so if a rule changes, this seed changes with
 * it — and `verify()` at the end re-derives the invariants and fails loudly if they don't
 * hold.
 *
 * The calendar is anchored to the day it runs, so the demo is never stale: the third term
 * always contains today, which makes it the current term with scores still going in.
 *
 * Run:  npm run seed:demo
 * The super admin must exist first (npm run seed:super-admin) — module order starts there.
 */
// @next/env ships CommonJS, so the named import fails under this project's ESM setup.
import nextEnv from "@next/env"
import {
  Prisma,
  PrismaClient,
  Role,
  CredentialType,
  Gender,
  ClassLevel,
  PaymentStatus,
  ChargeStatus,
  FeeType,
  FeeAppliesTo,
  AttendanceStatus,
  EnrollmentAction,
  TransitionType,
  ResultWorkflowStatus,
  PaymentAccountType,
  PayeeType,
  ExpenseStatus,
  PaymentMethod,
  StaffType,
  EmploymentType,
  EmploymentStatus,
  PayrollStatus,
  PayrollItemStatus,
  PayrollLineKind,
  ComponentKind,
  DeductionTiming,
} from "@prisma/client"
import bcrypt from "bcryptjs"

import { createPrismaClient } from "@/lib/prisma-client"
import { raiseEnrolmentCharges } from "@/lib/fee-charges.server"
import { computePay, type PayComponent } from "@/lib/payroll"
import { buildClassTermResults, assignPositions } from "@/lib/results/class-term-results"
import {
  evaluatePromotionEligibility,
  type PromotionPolicy,
  type StudentResultSummary,
} from "@/lib/promotion"
import { SYSTEM_PERMISSION_PROFILES } from "@/lib/permissions"

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const prisma = createPrismaClient()
const D = (value: number | string) => new Prisma.Decimal(value)
const ZERO = D(0)

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------
// A demo database people compare against needs to be the same database every time. Faker's
// output can drift between versions, so names come from fixed pools and every "random"
// choice runs through one seeded generator.

let rngState = 20260917
function rand(): number {
  // Numerical Recipes LCG. Not cryptographic — it only has to be repeatable.
  rngState = (rngState * 1664525 + 1013904223) % 4294967296
  return rngState / 4294967296
}
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]

const FIRST_NAMES_M = [
  "Abubakar", "Chinedu", "Emeka", "Ibrahim", "Musa", "Olumide", "Tunde", "Yusuf",
  "Segun", "Nnamdi", "Bashir", "Kelechi", "Sadiq", "Femi", "Uche", "Danjuma",
] as const
const FIRST_NAMES_F = [
  "Aisha", "Chiamaka", "Fatima", "Ngozi", "Halima", "Folake", "Amina", "Blessing",
  "Zainab", "Adaeze", "Maryam", "Temitope", "Hauwa", "Ifeoma", "Rukayya", "Yetunde",
] as const
const LAST_NAMES = [
  "Abdullahi", "Okonkwo", "Bello", "Adeyemi", "Ibrahim", "Nwosu", "Lawal", "Eze",
  "Suleiman", "Okafor", "Mohammed", "Balogun", "Chukwu", "Danladi", "Ogunleye", "Aliyu",
  "Sani", "Uzoma", "Garba", "Adebayo",
] as const

const STATES = [
  { name: "Gombe", lga: "Gombe LGA" },
  { name: "Kaduna", lga: "Kaduna North LGA" },
  { name: "Lagos", lga: "Ikeja LGA" },
  { name: "Enugu", lga: "Enugu East LGA" },
  { name: "Kano", lga: "Nassarawa LGA" },
  { name: "Oyo", lga: "Ibadan North LGA" },
] as const

// ---------------------------------------------------------------------------
// Calendar, anchored to today
// ---------------------------------------------------------------------------

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
const iso = (date: Date) => date.toISOString().slice(0, 10)

/**
 * Three terms, with the third one straddling today so it is genuinely the current term.
 * Working backwards from today rather than forwards from a fixed date is what keeps the
 * demo honest however long after writing it someone runs the seed.
 */
const TERM_WINDOWS = [
  { name: "First Term", start: addDays(TODAY, -265), end: addDays(TODAY, -170) },
  { name: "Second Term", start: addDays(TODAY, -155), end: addDays(TODAY, -60) },
  { name: "Third Term", start: addDays(TODAY, -45), end: addDays(TODAY, 45) },
] as const

const SESSION_START = TERM_WINDOWS[0].start
const SESSION_END = TERM_WINDOWS[2].end
const SESSION_NAME = `${SESSION_START.getFullYear()}/${SESSION_END.getFullYear()}`

// ---------------------------------------------------------------------------
// Shape of the school
// ---------------------------------------------------------------------------

const SCHOOL = {
  name: "Brightfield College, Gombe",
  code: "BFC-GMB",
  address: "12 Biu Road, Gombe, Gombe State",
  phone: "+234 803 000 1200",
  email: "info@brightfield.edu.ng",
  domain: "brightfield.edu.ng",
  admissionPrefix: "BFC",
  admissionFormat: "{PREFIX}/{YEAR}/{NUMBER}",
} as const

const CLASSES = [
  { name: "JSS 1A", level: ClassLevel.JSS, rank: 1 },
  { name: "JSS 2A", level: ClassLevel.JSS, rank: 2 },
  { name: "JSS 3A", level: ClassLevel.JSS, rank: 3 },
  { name: "SSS 1A", level: ClassLevel.SSS, rank: 4 },
  { name: "SSS 2A", level: ClassLevel.SSS, rank: 5 },
  { name: "SSS 3A", level: ClassLevel.SSS, rank: 6 },
] as const

const SUBJECTS = [
  { name: "English Language", code: "ENG", levels: ["JSS", "SSS"] },
  { name: "Mathematics", code: "MTH", levels: ["JSS", "SSS"] },
  { name: "Civic Education", code: "CVE", levels: ["JSS", "SSS"] },
  { name: "Computer Studies", code: "CMP", levels: ["JSS", "SSS"] },
  { name: "Agricultural Science", code: "AGR", levels: ["JSS", "SSS"] },
  { name: "Basic Science", code: "BSC", levels: ["JSS"] },
  { name: "Basic Technology", code: "BTC", levels: ["JSS"] },
  { name: "Social Studies", code: "SOS", levels: ["JSS"] },
  { name: "Physics", code: "PHY", levels: ["SSS"] },
  { name: "Economics", code: "ECO", levels: ["SSS"] },
] as const

/** WAEC-style bands. Seeded as GradeLevel rows, then read back through resolveGrade. */
const GRADE_BANDS = [
  { grade: "A1", minScore: 75, maxScore: 100, remark: "Excellent" },
  { grade: "B2", minScore: 70, maxScore: 74, remark: "Very Good" },
  { grade: "B3", minScore: 65, maxScore: 69, remark: "Good" },
  { grade: "C4", minScore: 60, maxScore: 64, remark: "Credit" },
  { grade: "C5", minScore: 55, maxScore: 59, remark: "Credit" },
  { grade: "C6", minScore: 50, maxScore: 54, remark: "Credit" },
  { grade: "D7", minScore: 45, maxScore: 49, remark: "Pass" },
  { grade: "E8", minScore: 40, maxScore: 44, remark: "Pass" },
  { grade: "F9", minScore: 0, maxScore: 39, remark: "Fail" },
] as const

const PASS_MARK = 40

/** CA 10/10/10 plus a 70-mark exam. Every score generated below respects these maxima. */
const SCHEME = { ca1Max: 10, ca2Max: 10, ca3Max: 10, examMax: 70 } as const

const STUDENTS_PER_CLASS = 10
const NEW_INTAKE_THIRD_TERM = 4

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const log = (message: string) => console.log(message)
const step = (n: number, title: string) => console.log(`\n── ${n}. ${title}`)

async function hash(plain: string) {
  return bcrypt.hash(plain, 10)
}

/** Grade for a score, from the bands seeded above. Mirrors lib/grading's resolveGrade. */
function gradeFor(score: number | null): { grade: string; remark: string } | null {
  if (score === null) return null
  const band = GRADE_BANDS.find((b) => score >= b.minScore && score <= b.maxScore)
  return band ? { grade: band.grade, remark: band.remark } : null
}

/** Next number from a per-school, per-year counter — the same pattern the app uses. */
async function nextSequence(
  tx: Prisma.TransactionClient | PrismaClient,
  table: "admissionSequence" | "receiptSequence" | "expenseVoucherSequence" | "payslipSequence",
  schoolId: string,
  year: number,
): Promise<number> {
  const row = await (tx as any)[table].upsert({
    where: { schoolId_year: { schoolId, year } },
    update: { lastSequence: { increment: 1 } },
    create: { schoolId, year, lastSequence: 1 },
    select: { lastSequence: true },
  })
  return row.lastSequence
}

const pad = (value: number, width = 4) => String(value).padStart(width, "0")

// ---------------------------------------------------------------------------
// Types carried between steps
// ---------------------------------------------------------------------------

type TermRef = { id: string; name: string; start: Date; end: Date; isCurrent: boolean }
type ClassRef = { id: string; name: string; level: ClassLevel; rank: number }
type ClassTermRef = { id: string; classId: string; className: string; termId: string; rank: number }
type StaffRef = { staffId: string; userId: string | null; name: string }
type TeacherRef = { teacherId: string; userId: string; name: string; staffId: string }
type StudentRef = {
  studentId: string
  userId: string
  name: string
  admissionNo: string
  gender: Gender
  joinedTermIndex: number
}

const problems: string[] = []
function check(condition: boolean, description: string) {
  if (condition) {
    log(`   ✓ ${description}`)
  } else {
    problems.push(description)
    log(`   ✗ ${description}`)
  }
}

// ===========================================================================
// 0. Wipe
// ===========================================================================

/**
 * Clears every school and everybody who is not a super admin.
 *
 * Deleting the School cascades almost the whole graph — sessions, classes, students,
 * charges, payroll, expenses. What it does not reach is the `users` rows behind those
 * people, because Student/Teacher/Parent hang off User and not the other way round, so
 * those are removed in a second pass. Super admins are platform-level and survive, which
 * is why the module order below can start from one.
 */
async function wipe() {
  step(0, "Clearing existing school data")

  // No foreign keys by design, so nothing cascades these away.
  await prisma.auditLog.deleteMany({})
  await prisma.dataIntegrityCheck.deleteMany({})

  const schools = await prisma.school.findMany({ select: { id: true, name: true } })

  // Deleting the School and letting the cascade do the rest does not work once payroll and
  // expenditure exist. Several relations are deliberately onDelete: Restrict, because a
  // payslip must not lose the allowance it was computed from and an expense must not lose
  // who approved it. Those restrictions are correct, and they mean a wipe has to walk the
  // graph itself, children first.
  const order: Array<keyof PrismaClient> = [
    "paymentAllocation",
    "payment",
    "discount",
    "feeExemption",
    "studentCharge",
    "feeSchedule",
    "feeCategory",
    "feeStructure",
    "assessment",
    "studentTraitRating",
    "attendance",
    "resultWorkflowEvent",
    "classTermResultWorkflow",
    "studentTransition",
    "studentEnrollmentHistory",
    "studentClassTerm",
    "classSubject",
    "teacherSubject",
    "teacherClassTerm",
    "classTerm",
    "salaryPayment",
    "payrollItemLine",
    "payrollItem",
    "payrollRun",
    "staffAllowance",
    "staffDeduction",
    "staffSalary",
    "staffDisciplinaryRecord",
    "allowanceType",
    "deductionType",
    "salaryScale",
    "expenseAttachment",
    "expense",
    "expenseCategory",
    "staffConfig",
    "staff",
    "paymentAccount",
    "studentParent",
    "student",
    "teacher",
    "parent",
    "admin",
    "gradeLevel",
    "gradingSystem",
    "assessmentScheme",
    "transitionPolicy",
    "userPermissionProfile",
    "permissionProfile",
    "systemConfiguration",
    "term",
    "session",
    "class",
    "subject",
    "admissionSequence",
    "receiptSequence",
    "expenseVoucherSequence",
    "payslipSequence",
  ]

  for (const model of order) {
    await (prisma as any)[model].deleteMany({})
  }

  for (const school of schools) {
    await prisma.school.delete({ where: { id: school.id } })
    log(`   removed school ${school.name}`)
  }

  const orphaned = await prisma.user.deleteMany({ where: { role: { not: Role.SUPER_ADMIN } } })
  log(`   removed ${orphaned.count} non-super-admin users`)

  // Counting users with the SUPER_ADMIN role is not the same as having a usable super
  // admin: requireActor() also needs the SuperAdmin profile row, and without it every page
  // fails with "Super admin profile not found" while this check still reports success.
  const superAdmins = await prisma.user.findMany({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true, firstName: true, lastName: true, superAdmin: { select: { id: true } } },
  })
  if (superAdmins.length === 0) {
    throw new Error(
      "No super admin exists. Run `npm run seed:super-admin` first — the module chain starts there.",
    )
  }

  const broken = superAdmins.filter((account) => !account.superAdmin)
  if (broken.length > 0) {
    const names = broken.map((account) => `${account.firstName} ${account.lastName}`).join(", ")
    throw new Error(
      `${broken.length} super admin account(s) have no SuperAdmin profile row (${names}). ` +
        "They cannot sign in. Run `npm run seed:super-admin` to repair them, then seed again.",
    )
  }

  log(`   kept ${superAdmins.length} super admin account(s), profiles intact`)
}

// ===========================================================================
// 1. Super admin -> school
// ===========================================================================

async function createSchool(superAdminUserId: string) {
  step(1, "Super admin registers the school")

  const school = await prisma.school.create({
    data: {
      name: SCHOOL.name,
      code: SCHOOL.code,
      address: SCHOOL.address,
      phone: SCHOOL.phone,
      email: SCHOOL.email,
      website: `https://${SCHOOL.domain}`,
      admissionPrefix: SCHOOL.admissionPrefix,
      admissionFormat: SCHOOL.admissionFormat,
      admissionSequenceStart: 1,
    },
  })
  log(`   ${school.name} (${school.code})`)

  // Grading system, with the bands the compiler and every report card read back.
  const grading = await prisma.gradingSystem.create({
    data: {
      schoolId: school.id,
      name: "WAEC Standard",
      description: "Nine-band WAEC grading, pass mark 40.",
      isDefault: true,
      passMark: PASS_MARK,
      levels: { create: GRADE_BANDS.map((band) => ({ ...band })) },
    },
  })
  log(`   grading system: ${grading.name}, ${GRADE_BANDS.length} bands, pass mark ${PASS_MARK}`)

  // How marks are split. Nothing below invents a score outside these maxima.
  await prisma.assessmentScheme.create({
    data: { schoolId: school.id, name: "Three CAs and an exam", ...SCHEME },
  })
  log(`   assessment scheme: CA ${SCHEME.ca1Max}/${SCHEME.ca2Max}/${SCHEME.ca3Max} + exam ${SCHEME.examMax}`)

  // The promotion rules the rollover in step 10 is actually judged against.
  await prisma.transitionPolicy.create({
    data: {
      schoolId: school.id,
      requireResultsPublished: true,
      usePromotionCriteria: true,
      promotionMinAverage: D(40),
      minSubjectsPassed: 4,
      evaluationScope: "TERM",
      requireAllSubjectsEntered: false,
      allowManualOverride: true,
    },
  })
  log(`   promotion policy: results must be published, average >= 40, >= 4 subjects passed`)

  // The four system permission profiles, so the staff created next can hold real authority
  // rather than relying on their login role alone.
  for (const [code, profile] of Object.entries(SYSTEM_PERMISSION_PROFILES)) {
    await prisma.permissionProfile.create({
      data: {
        schoolId: school.id,
        code,
        name: profile.name,
        description: `System profile: ${profile.name}`,
        permissions: profile.permissions,
        isSystem: true,
      },
    })
  }
  log(`   permission profiles: ${Object.keys(SYSTEM_PERMISSION_PROFILES).join(", ")}`)

  await prisma.auditLog.create({
    data: {
      schoolId: school.id,
      actorId: superAdminUserId,
      actorName: "Platform Super Admin",
      actorRole: Role.SUPER_ADMIN,
      action: "school.create",
      entityType: "School",
      entityId: school.id,
      summary: `Registered ${school.name} on the platform.`,
    },
  })

  return { school, gradingSystemId: grading.id }
}

// ===========================================================================
// 2. Session and terms
// ===========================================================================

/**
 * A closed-off session before the one being simulated.
 *
 * It exists for one reason, and it is not decoration. `raiseEnrolmentCharges` decides
 * whether a student is NEW or RETURNING by asking whether they were enrolled in a session
 * that started earlier — not an earlier term. Without a prior session every student in the
 * school is NEW forever, which means a RETURNING_STUDENTS fee bills nobody and a
 * NEW_STUDENTS fee bills the entire roll. Both are silently wrong, and both look fine.
 *
 * So the opening roll is enrolled here first. That makes them genuinely returning students
 * in the main session, and it makes the mid-session intake in step 11 the only new ones —
 * which is the distinction the fee model is built around.
 *
 * Deliberately bare: no fee schedules, no scores. Its only job is to have happened.
 */
async function createPriorSession(schoolId: string, classes: ClassRef[]) {
  const start = addDays(SESSION_START, -370)
  const end = addDays(SESSION_START, -30)

  const session = await prisma.session.create({
    data: {
      schoolId,
      name: `${start.getFullYear()}/${end.getFullYear()}`,
      startDate: start,
      endDate: end,
      isCurrent: false,
    },
  })

  const term = await prisma.term.create({
    data: {
      sessionId: session.id,
      name: "Third Term",
      startDate: addDays(end, -90),
      endDate: end,
      isCurrent: false,
    },
  })

  // Students sat one class below where they start the new session, so the prior year reads
  // like a real promotion into it.
  const classTerms = new Map<number, string>()
  for (const klass of classes) {
    const created = await prisma.classTerm.create({ data: { classId: klass.id, termId: term.id } })
    classTerms.set(klass.rank, created.id)
  }

  return { session, term, classTerms }
}

async function createCalendar(schoolId: string) {
  step(2, "Admin sets up the session and its terms")

  const session = await prisma.session.create({
    data: {
      schoolId,
      name: SESSION_NAME,
      startDate: SESSION_START,
      endDate: SESSION_END,
      isCurrent: true,
    },
  })
  log(`   session ${session.name}  ${iso(SESSION_START)} → ${iso(SESSION_END)}`)

  const terms: TermRef[] = []
  for (let i = 0; i < TERM_WINDOWS.length; i++) {
    const window = TERM_WINDOWS[i]
    const isCurrent = i === TERM_WINDOWS.length - 1
    const term = await prisma.term.create({
      data: {
        sessionId: session.id,
        name: window.name,
        startDate: window.start,
        endDate: window.end,
        isCurrent,
      },
    })
    terms.push({ id: term.id, name: term.name, start: window.start, end: window.end, isCurrent })
    log(`   ${window.name.padEnd(12)} ${iso(window.start)} → ${iso(window.end)}${isCurrent ? "   [current]" : ""}`)
  }

  return { session, terms }
}

// ===========================================================================
// 3. Classes, subjects, class terms
// ===========================================================================

async function createAcademics(schoolId: string, terms: TermRef[]) {
  step(3, "Admin creates classes, subjects and the term timetable")

  const classes: ClassRef[] = []
  for (const entry of CLASSES) {
    const created = await prisma.class.create({
      data: { schoolId, name: entry.name, level: entry.level },
    })
    classes.push({ id: created.id, name: created.name, level: created.level, rank: entry.rank })
  }
  log(`   ${classes.length} classes: ${classes.map((c) => c.name).join(", ")}`)

  const subjects = new Map<string, { id: string; name: string; code: string; levels: readonly string[] }>()
  for (const entry of SUBJECTS) {
    const created = await prisma.subject.create({
      data: { schoolId, name: entry.name, code: entry.code },
    })
    subjects.set(entry.code, { id: created.id, name: entry.name, code: entry.code, levels: entry.levels })
  }
  log(`   ${subjects.size} subjects: ${[...subjects.keys()].join(", ")}`)

  // Every class exists in every term, and each class term carries the subjects that level
  // offers. Assessments hang off a class term, so this is what makes scores possible later.
  const classTerms: ClassTermRef[] = []
  for (const term of terms) {
    for (const klass of classes) {
      const classTerm = await prisma.classTerm.create({
        data: { classId: klass.id, termId: term.id },
      })
      classTerms.push({
        id: classTerm.id,
        classId: klass.id,
        className: klass.name,
        termId: term.id,
        rank: klass.rank,
      })

      const offered = [...subjects.values()].filter((s) => s.levels.includes(klass.level))
      await prisma.classSubject.createMany({
        data: offered.map((subject) => ({
          classId: klass.id,
          subjectId: subject.id,
          classTermId: classTerm.id,
        })),
      })
    }
  }
  log(`   ${classTerms.length} class terms (${classes.length} classes × ${terms.length} terms), subjects attached`)

  return { classes, subjects, classTerms }
}

// ===========================================================================
// 4. Staff: admin, accountant, exams officer, teachers
// ===========================================================================

/**
 * Creates the login, the role record and the HR staff record in one go.
 *
 * A teacher is one person: a `User` to sign in, a `Teacher` row so they can be assigned
 * classes, and a `Staff` row so they appear on a payslip. Keeping them joined by `userId`
 * is what lets payroll and the classroom see the same human being.
 */
async function createPerson(args: {
  schoolId: string
  role: Role
  firstName: string
  lastName: string
  email: string
  password: string
  gender: Gender
  dateEmployed?: Date
  jobTitle?: string
  department?: string
  staffType?: StaffType
  withStaffRecord: boolean
  staffNo?: string
}) {
  const state = pick(STATES)
  const user = await prisma.user.create({
    data: {
      firstName: args.firstName,
      lastName: args.lastName,
      role: args.role,
      gender: args.gender,
      phone: `+23480${randInt(10000000, 99999999)}`,
      state: state.name,
      lga: state.lga,
      address: `${randInt(1, 120)} ${pick(["Biu", "Bauchi", "Yola", "Ashaka", "Kano"])} Road, Gombe`,
      credentials: {
        create: {
          type: CredentialType.EMAIL,
          value: args.email,
          passwordHash: await hash(args.password),
          isPrimary: true,
        },
      },
    },
  })

  let staffId: string | null = null
  if (args.withStaffRecord) {
    const staff = await prisma.staff.create({
      data: {
        schoolId: args.schoolId,
        staffNo: args.staffNo!,
        userId: user.id,
        firstName: args.firstName,
        lastName: args.lastName,
        gender: args.gender,
        email: args.email,
        phone: user.phone,
        department: args.department,
        jobTitle: args.jobTitle,
        staffType: args.staffType ?? StaffType.TEACHER,
        employmentType: EmploymentType.FULL_TIME,
        employmentStatus: EmploymentStatus.ACTIVE,
        dateEmployed: args.dateEmployed ?? addDays(SESSION_START, -30),
        bankName: pick(["Zenith Bank", "GTBank", "UBA", "First Bank", "Access Bank"]),
        accountNumber: String(randInt(1000000000, 9999999999)),
        accountName: `${args.firstName} ${args.lastName}`,
      },
    })
    staffId = staff.id
  }

  return { user, staffId }
}

/** Gives a user one of the school's system permission profiles. */
async function grantProfile(schoolId: string, userId: string, code: string, assignedBy: string) {
  const profile = await prisma.permissionProfile.findUnique({
    where: { schoolId_code: { schoolId, code } },
    select: { id: true },
  })
  if (!profile) return
  await prisma.userPermissionProfile.create({
    data: { userId, schoolId, profileId: profile.id, assignedBy },
  })
}

async function createStaff(schoolId: string, superAdminUserId: string) {
  step(4, "Super admin appoints the admin; the admin builds the staff list")

  let staffCounter = 0
  const nextStaffNo = () => `STF-${pad(++staffCounter)}`

  // The admin comes first — every step after this is an act of theirs.
  const admin = await createPerson({
    schoolId,
    role: Role.ADMIN,
    firstName: "Halima",
    lastName: "Suleiman",
    email: `admin@${SCHOOL.domain}`,
    password: "Admin#2025",
    gender: Gender.FEMALE,
    jobTitle: "Principal",
    department: "Administration",
    staffType: StaffType.ADMIN_STAFF,
    withStaffRecord: true,
    staffNo: nextStaffNo(),
  })
  await prisma.admin.create({
    data: { userId: admin.user.id, schoolId, permissions: JSON.stringify(["MANAGER"]) },
  })
  await grantProfile(schoolId, admin.user.id, "MANAGER", superAdminUserId)
  log(`   ADMIN        admin@${SCHOOL.domain}  (Manager profile — every permission)`)

  const accountant = await createPerson({
    schoolId,
    role: Role.ACCOUNTANT,
    firstName: "Bashir",
    lastName: "Garba",
    email: `accountant@${SCHOOL.domain}`,
    password: "Account#2025",
    gender: Gender.MALE,
    jobTitle: "Bursar",
    department: "Finance",
    staffType: StaffType.ADMIN_STAFF,
    withStaffRecord: true,
    staffNo: nextStaffNo(),
  })
  await grantProfile(schoolId, accountant.user.id, "FINANCE", admin.user.id)
  log(`   ACCOUNTANT   accountant@${SCHOOL.domain}  (Finance profile)`)

  // An exams officer is an ADMIN login narrowed by profile — the pattern the permission
  // system exists for: same role, different authority.
  const exams = await createPerson({
    schoolId,
    role: Role.ADMIN,
    firstName: "Ngozi",
    lastName: "Okafor",
    email: `exams@${SCHOOL.domain}`,
    password: "Exams#2025",
    gender: Gender.FEMALE,
    jobTitle: "Exams Officer",
    department: "Academics",
    staffType: StaffType.ADMIN_STAFF,
    withStaffRecord: true,
    staffNo: nextStaffNo(),
  })
  await prisma.admin.create({
    data: { userId: exams.user.id, schoolId, permissions: JSON.stringify(["EXAMS"]) },
  })
  await grantProfile(schoolId, exams.user.id, "EXAMS", admin.user.id)
  log(`   ADMIN        exams@${SCHOOL.domain}  (Exams profile — review, publish, lock)`)

  // One form teacher per class.
  const teachers: TeacherRef[] = []
  for (let i = 0; i < CLASSES.length; i++) {
    const gender = i % 2 === 0 ? Gender.MALE : Gender.FEMALE
    const firstName = (gender === Gender.MALE ? FIRST_NAMES_M : FIRST_NAMES_F)[i % 16]
    const lastName = LAST_NAMES[(i * 3) % LAST_NAMES.length]
    const staffNo = nextStaffNo()

    const person = await createPerson({
      schoolId,
      role: Role.TEACHER,
      firstName,
      lastName,
      email: `teacher${i + 1}@${SCHOOL.domain}`,
      password: `Teacher${i + 1}#2025`,
      gender,
      jobTitle: "Class Teacher",
      department: pick(["Sciences", "Languages", "Humanities"]),
      staffType: StaffType.TEACHER,
      withStaffRecord: true,
      staffNo,
    })

    const teacher = await prisma.teacher.create({
      data: {
        userId: person.user.id,
        schoolId,
        staffId: staffNo,
        department: "Academics",
        qualification: pick(["B.Ed", "B.Sc Ed", "PGDE", "M.Ed"]),
      },
    })
    teachers.push({
      teacherId: teacher.id,
      userId: person.user.id,
      name: `${firstName} ${lastName}`,
      staffId: person.staffId!,
    })
  }
  log(`   TEACHER      teacher1..${CLASSES.length}@${SCHOOL.domain}  (one form teacher per class)`)

  // A bursar and a principal have logins; a cleaner and a driver do not, and payroll has to
  // cope with both. That is the case `Staff.userId` is nullable for.
  const nonLogin = [
    { firstName: "Danjuma", lastName: "Aliyu", jobTitle: "Driver", type: StaffType.DRIVER },
    { firstName: "Rukayya", lastName: "Sani", jobTitle: "Cleaner", type: StaffType.CLEANER },
    { firstName: "Musa", lastName: "Danladi", jobTitle: "Security", type: StaffType.SECURITY },
  ]
  const supportStaff: StaffRef[] = []
  for (const person of nonLogin) {
    const staff = await prisma.staff.create({
      data: {
        schoolId,
        staffNo: nextStaffNo(),
        firstName: person.firstName,
        lastName: person.lastName,
        gender: Gender.MALE,
        jobTitle: person.jobTitle,
        department: "Support",
        staffType: person.type,
        employmentType: EmploymentType.FULL_TIME,
        employmentStatus: EmploymentStatus.ACTIVE,
        dateEmployed: addDays(SESSION_START, -30),
        bankName: "Access Bank",
        accountNumber: String(randInt(1000000000, 9999999999)),
        accountName: `${person.firstName} ${person.lastName}`,
      },
    })
    supportStaff.push({ staffId: staff.id, userId: null, name: `${person.firstName} ${person.lastName}` })
  }
  log(`   SUPPORT      ${supportStaff.length} staff with no login (driver, cleaner, security)`)

  return {
    adminUserId: admin.user.id,
    adminStaffId: admin.staffId!,
    accountantUserId: accountant.user.id,
    accountantStaffId: accountant.staffId!,
    examsUserId: exams.user.id,
    examsStaffId: exams.staffId!,
    teachers,
    supportStaff,
  }
}

// ===========================================================================
// 5. Teacher assignment
// ===========================================================================

/**
 * Each teacher takes one class as form teacher, and a share of that class's subjects.
 *
 * Assignment is per term, because `TeacherSubject` is keyed on the term — a school can move
 * a teacher between terms without rewriting history. The score entry in step 8 only ever
 * writes through a teacher who actually holds the subject, which is the rule the teacher
 * compiler enforces in the app.
 */
async function assignTeachers(
  terms: TermRef[],
  classes: ClassRef[],
  classTerms: ClassTermRef[],
  subjects: Map<string, { id: string; name: string; code: string; levels: readonly string[] }>,
  teachers: TeacherRef[],
) {
  step(5, "Admin assigns teachers to classes and subjects")

  /** Which teacher teaches which subject in which class term. */
  const subjectTeacher = new Map<string, string>() // `${classTermId}:${subjectId}` -> teacherId
  let formTeacherLinks = 0
  let subjectLinks = 0

  for (const term of terms) {
    for (let i = 0; i < classes.length; i++) {
      const klass = classes[i]
      const teacher = teachers[i]
      const classTerm = classTerms.find((ct) => ct.classId === klass.id && ct.termId === term.id)!

      await prisma.teacherClassTerm.create({
        data: { teacherId: teacher.teacherId, classTermId: classTerm.id },
      })
      formTeacherLinks++

      // Subjects for this class are shared round the staff so that no single teacher owns a
      // whole class — the same teacher entering every score would never exercise the
      // "is this your subject?" check.
      const offered = [...subjects.values()].filter((s) => s.levels.includes(klass.level))
      for (let s = 0; s < offered.length; s++) {
        const owner = teachers[(i + s) % teachers.length]
        subjectTeacher.set(`${classTerm.id}:${offered[s].id}`, owner.teacherId)

        await prisma.teacherSubject.upsert({
          where: {
            teacherId_subjectId_termId: {
              teacherId: owner.teacherId,
              subjectId: offered[s].id,
              termId: term.id,
            },
          },
          update: {},
          create: { teacherId: owner.teacherId, subjectId: offered[s].id, termId: term.id },
        })
        subjectLinks++
      }
    }
  }

  log(`   ${formTeacherLinks} form-teacher assignments (1 per class per term)`)
  log(`   ${subjectLinks} subject assignments, spread across ${teachers.length} teachers`)
  return { subjectTeacher }
}

// ===========================================================================
// 6. Finance setup
// ===========================================================================

/**
 * Fee categories and the schedules that bill them.
 *
 * The schedules deliberately use all three scopes and all three audiences, because that is
 * what `schedulesForEnrolment` decides between:
 *
 *   session-wide + NEW_STUDENTS      admission fee — only ever charged once, on entry
 *   per-term     + ALL_STUDENTS      tuition — everyone, every term
 *   per-term     + RETURNING_STUDENTS development levy — not charged to a new intake
 *   per-classTerm+ ALL_STUDENTS      exam fee for the exit class only
 */
async function financeSetup(schoolId: string, sessionId: string, terms: TermRef[], classTerms: ClassTermRef[]) {
  step(6, "Accountant sets up fee categories and schedules")

  const categories = {
    tuition: await prisma.feeCategory.create({
      data: { schoolId, name: "Tuition", type: FeeType.MANDATORY, description: "Termly tuition." },
    }),
    admission: await prisma.feeCategory.create({
      data: { schoolId, name: "Admission", type: FeeType.REGISTRATION, description: "One-off, new students only." },
    }),
    development: await prisma.feeCategory.create({
      data: { schoolId, name: "Development Levy", type: FeeType.MANDATORY, description: "Returning students." },
    }),
    exam: await prisma.feeCategory.create({
      data: { schoolId, name: "Examination", type: FeeType.MANDATORY, description: "Exit-class exam fee." },
    }),
  }
  log(`   4 fee categories: Tuition, Admission, Development Levy, Examination`)

  const schedules: Array<{ id: string; name: string; amount: Prisma.Decimal }> = []

  // One-off, session-wide, new students only.
  const admissionFee = await prisma.feeSchedule.create({
    data: {
      schoolId,
      sessionId,
      categoryId: categories.admission.id,
      name: "Admission Fee",
      amount: D(25000),
      appliesTo: FeeAppliesTo.NEW_STUDENTS,
      isMandatory: true,
      dueDate: addDays(SESSION_START, 30),
    },
  })
  schedules.push({ id: admissionFee.id, name: "Admission Fee", amount: D(25000) })

  for (const term of terms) {
    const tuition = await prisma.feeSchedule.create({
      data: {
        schoolId,
        sessionId,
        termId: term.id,
        categoryId: categories.tuition.id,
        name: `Tuition — ${term.name}`,
        amount: D(45000),
        appliesTo: FeeAppliesTo.ALL_STUDENTS,
        isMandatory: true,
        dueDate: addDays(term.start, 21),
      },
    })
    schedules.push({ id: tuition.id, name: `Tuition — ${term.name}`, amount: D(45000) })

    const levy = await prisma.feeSchedule.create({
      data: {
        schoolId,
        sessionId,
        termId: term.id,
        categoryId: categories.development.id,
        name: `Development Levy — ${term.name}`,
        amount: D(7500),
        appliesTo: FeeAppliesTo.RETURNING_STUDENTS,
        isMandatory: true,
        dueDate: addDays(term.start, 30),
      },
    })
    schedules.push({ id: levy.id, name: `Development Levy — ${term.name}`, amount: D(7500) })
  }

  // Scoped to one class term: only the exit class, only in the third term.
  const finalTerm = terms[terms.length - 1]
  const exitClassTerm = classTerms.find((ct) => ct.termId === finalTerm.id && ct.className === "SSS 3A")!
  const examFee = await prisma.feeSchedule.create({
    data: {
      schoolId,
      sessionId,
      termId: finalTerm.id,
      classTermId: exitClassTerm.id,
      categoryId: categories.exam.id,
      name: "WAEC Examination Fee",
      amount: D(38000),
      appliesTo: FeeAppliesTo.ALL_STUDENTS,
      isMandatory: true,
      dueDate: addDays(finalTerm.start, 40),
    },
  })
  schedules.push({ id: examFee.id, name: "WAEC Examination Fee", amount: D(38000) })

  log(`   ${schedules.length} fee schedules`)
  log(`     Admission Fee          ₦25,000  session-wide, NEW_STUDENTS only`)
  log(`     Tuition                ₦45,000  per term, ALL_STUDENTS`)
  log(`     Development Levy        ₦7,500  per term, RETURNING_STUDENTS only`)
  log(`     WAEC Examination Fee   ₦38,000  SSS 3A in ${finalTerm.name} only`)

  // Where money is received and paid from.
  const accounts = {
    bank: await prisma.paymentAccount.create({
      data: {
        schoolId,
        name: "Main Bank Account",
        type: PaymentAccountType.BANK,
        bankName: "Zenith Bank",
        accountNumber: "1012345678",
        openingBalance: D(2_500_000),
      },
    }),
    cash: await prisma.paymentAccount.create({
      data: { schoolId, name: "Cash Office", type: PaymentAccountType.CASH, openingBalance: D(150_000) },
    }),
  }
  log(`   2 payment accounts: Main Bank Account (₦2,500,000 opening), Cash Office (₦150,000)`)

  const expenseCategories = {
    utilities: await prisma.expenseCategory.create({
      data: { schoolId, name: "Utilities", budgetLimit: D(300_000) },
    }),
    maintenance: await prisma.expenseCategory.create({
      data: { schoolId, name: "Maintenance", budgetLimit: D(400_000) },
    }),
    activities: await prisma.expenseCategory.create({
      data: { schoolId, name: "School Activities", budgetLimit: D(500_000) },
    }),
    salaries: await prisma.expenseCategory.create({
      data: { schoolId, name: "Salaries", description: "Payroll settlement." },
    }),
  }
  log(`   4 expense categories, three with termly budget limits`)

  return { categories, schedules, accounts, expenseCategories }
}

// ===========================================================================
// 7. Admissions and enrolment
// ===========================================================================

/** Renders an admission number through the school's own format template. */
async function nextAdmissionNo(schoolId: string, format: string, prefix: string, year: number) {
  const sequence = await nextSequence(prisma, "admissionSequence", schoolId, year)
  return format
    .replace("{PREFIX}", prefix)
    .replace("{YEAR}", String(year))
    .replace("{NUMBER}", pad(sequence))
}

/**
 * Enrols a student into a class term and bills them for it.
 *
 * The billing is not written here — it calls `raiseEnrolmentCharges`, the same function the
 * transition and admission paths in the app call. That is the whole point: a student
 * enrolled by this seed is charged by exactly the rule that charges a student enrolled
 * through the UI, including the new-versus-returning distinction that decides whether the
 * admission fee and the development levy apply.
 */
async function enrol(args: {
  schoolId: string
  studentId: string
  classTerm: ClassTermRef
  termId: string
  actorUserId: string
  action: EnrollmentAction
}) {
  return prisma.$transaction(async (tx) => {
    const enrolment = await tx.studentClassTerm.create({
      data: {
        studentId: args.studentId,
        classTermId: args.classTerm.id,
        termId: args.termId,
        status: "ACTIVE",
      },
    })

    const charges = await raiseEnrolmentCharges(tx, {
      schoolId: args.schoolId,
      studentId: args.studentId,
      classTermId: args.classTerm.id,
      termId: args.termId,
    })

    await tx.studentEnrollmentHistory.create({
      data: {
        studentId: args.studentId,
        classTermId: args.classTerm.id,
        termId: args.termId,
        action: args.action,
        createdBy: args.actorUserId,
      },
    })

    return { enrolmentId: enrolment.id, chargesRaised: charges }
  })
}

async function admitStudents(args: {
  schoolId: string
  admissionFormat: string
  admissionPrefix: string
  classes: ClassRef[]
  classTerms: ClassTermRef[]
  firstTerm: TermRef
  adminUserId: string
  prior: { termId: string; classTerms: Map<number, string> }
}) {
  step(7, "Admin admits the opening roll and enrols them into First Term")

  const year = SESSION_START.getFullYear()
  const students: StudentRef[] = []
  const parents: Array<{ parentId: string; userId: string; name: string }> = []
  let chargesRaised = 0
  let parentIndex = 0

  for (let c = 0; c < args.classes.length; c++) {
    const klass = args.classes[c]
    const classTerm = args.classTerms.find(
      (ct) => ct.classId === klass.id && ct.termId === args.firstTerm.id,
    )!

    for (let s = 0; s < STUDENTS_PER_CLASS; s++) {
      const index = students.length + 1
      const gender = rand() < 0.5 ? Gender.MALE : Gender.FEMALE
      const firstName = pick(gender === Gender.MALE ? FIRST_NAMES_M : FIRST_NAMES_F)
      const lastName = pick(LAST_NAMES)
      const admissionNo = await nextAdmissionNo(args.schoolId, args.admissionFormat, args.admissionPrefix, year)

      const state = pick(STATES)
      const user = await prisma.user.create({
        data: {
          firstName,
          lastName,
          role: Role.STUDENT,
          gender,
          dateOfBirth: new Date(year - (10 + klass.rank), randInt(0, 11), randInt(1, 28)),
          state: state.name,
          lga: state.lga,
          address: `${randInt(1, 200)} ${pick(["Biu", "Bauchi", "Yola"])} Road, Gombe`,
          credentials: {
            create: [
              {
                type: CredentialType.EMAIL,
                value: `student${index}@${SCHOOL.domain}`,
                passwordHash: await hash(`Student${index}#2025`),
                isPrimary: true,
              },
              // Students also sign in with their admission number. Seeding both means the
              // registration-number login path is exercised, not just assumed.
              {
                type: CredentialType.REGISTRATION_NUMBER,
                value: admissionNo,
                passwordHash: await hash(`${lastName.toLowerCase()}${year}`),
                isPrimary: false,
              },
            ],
          },
        },
      })

      const student = await prisma.student.create({
        data: { userId: user.id, schoolId: args.schoolId, admissionNo, year },
      })

      // Last year, one class lower. Recorded before the enrolment below, because that is
      // when raiseEnrolmentCharges asks whether this student has been here before.
      //
      // The history event matters as much as the enrolment: every path in the app writes one,
      // and `runIntegrityChecks` reports an enrolment without one as ENROLLMENT_HISTORY_MISSING
      // — which it duly did for the students this seed created, three findings on a clean
      // school. Seeded data has to satisfy the same invariants as data the app writes.
      const priorClassTermId =
        args.prior.classTerms.get(Math.max(1, klass.rank - 1)) ?? args.prior.classTerms.get(klass.rank)!
      await prisma.$transaction(async (tx) => {
        await tx.studentClassTerm.create({
          data: {
            studentId: student.id,
            classTermId: priorClassTermId,
            termId: args.prior.termId,
            status: "COMPLETED",
          },
        })
        await tx.studentEnrollmentHistory.create({
          data: {
            studentId: student.id,
            classTermId: priorClassTermId,
            termId: args.prior.termId,
            action: EnrollmentAction.ENROLLED,
            createdBy: args.adminUserId,
          },
        })
      })

      const result = await enrol({
        schoolId: args.schoolId,
        studentId: student.id,
        classTerm,
        termId: args.firstTerm.id,
        actorUserId: args.adminUserId,
        action: EnrollmentAction.ENROLLED,
      })
      chargesRaised += result.chargesRaised

      students.push({
        studentId: student.id,
        userId: user.id,
        name: `${firstName} ${lastName}`,
        admissionNo,
        gender,
        joinedTermIndex: 0,
      })

      // Every other student gets a parent account, and some parents get a second child, so
      // the parent portal has both the single-child and multi-child cases in it.
      const needsNewParent = s % 2 === 0
      if (needsNewParent) {
        parentIndex++
        const pGender = rand() < 0.5 ? Gender.MALE : Gender.FEMALE
        const pFirst = pick(pGender === Gender.MALE ? FIRST_NAMES_M : FIRST_NAMES_F)
        const parentUser = await prisma.user.create({
          data: {
            firstName: pFirst,
            lastName,
            role: Role.PARENT,
            gender: pGender,
            phone: `+23480${randInt(10000000, 99999999)}`,
            state: state.name,
            lga: state.lga,
            credentials: {
              create: {
                type: CredentialType.EMAIL,
                value: `parent${parentIndex}@${SCHOOL.domain}`,
                passwordHash: await hash(`Parent${parentIndex}#2025`),
                isPrimary: true,
              },
            },
          },
        })
        const parent = await prisma.parent.create({
          data: {
            userId: parentUser.id,
            schoolId: args.schoolId,
            occupation: pick(["Trader", "Civil Servant", "Teacher", "Farmer", "Engineer", "Nurse"]),
          },
        })
        parents.push({ parentId: parent.id, userId: parentUser.id, name: `${pFirst} ${lastName}` })
      }

      await prisma.studentParent.create({
        data: {
          studentId: student.id,
          parentId: parents[parents.length - 1].parentId,
          relationship: rand() < 0.5 ? "Father" : "Mother",
        },
      })
    }
  }

  log(`   ${students.length} students admitted across ${args.classes.length} classes`)
  log(`   ${parents.length} parent accounts linked (some carry two children)`)
  log(`   ${chargesRaised} fee charges raised on enrolment, by raiseEnrolmentCharges()`)
  return { students, parents }
}

// ===========================================================================
// 8. Attendance, scores, results workflow
// ===========================================================================

/**
 * Enters a term's scores as the assigned subject teacher, then walks the class through the
 * result workflow.
 *
 * `mode` decides how far a term is taken:
 *   "closed"  every subject marked, reviewed, published and locked — a finished term
 *   "open"    some subjects still blank and nothing published — a term in progress
 *
 * The open term is the important one. It is what proves the publication rule: marks exist
 * in the database for the current term and the student and parent portals must not show
 * them, because the school has not released them.
 */
async function runTermAcademics(args: {
  schoolId: string
  term: TermRef
  termIndex: number
  classTerms: ClassTermRef[]
  subjects: Map<string, { id: string; name: string; code: string; levels: readonly string[] }>
  classes: ClassRef[]
  subjectTeacher: Map<string, string>
  teachers: TeacherRef[]
  examsUserId: string
  mode: "closed" | "open"
}) {
  const { term, mode } = args
  let assessmentRows = 0
  let attendanceRows = 0
  let publishedClasses = 0

  for (const klass of args.classes) {
    const classTerm = args.classTerms.find((ct) => ct.classId === klass.id && ct.termId === term.id)!
    const enrolments = await prisma.studentClassTerm.findMany({
      where: { classTermId: classTerm.id, status: "ACTIVE" },
      select: { id: true, studentId: true },
    })
    if (enrolments.length === 0) continue

    const offered = [...args.subjects.values()].filter((s) => s.levels.includes(klass.level))

    // In an open term the last two subjects have not been marked yet.
    const markedSubjects = mode === "closed" ? offered : offered.slice(0, Math.max(1, offered.length - 2))

    for (const enrolment of enrolments) {
      // Attendance: a register kept across the term, weighted so most students attend.
      const days = mode === "closed" ? 24 : 12
      for (let d = 0; d < days; d++) {
        const roll = rand()
        const status =
          roll < 0.88 ? AttendanceStatus.PRESENT : roll < 0.95 ? AttendanceStatus.LATE : AttendanceStatus.ABSENT
        await prisma.attendance.upsert({
          where: { studentId_date: { studentId: enrolment.studentId, date: addDays(term.start, d * 3) } },
          update: {},
          create: { studentId: enrolment.studentId, date: addDays(term.start, d * 3), status },
        })
        attendanceRows++
      }

      for (const subject of markedSubjects) {
        const teacherId = args.subjectTeacher.get(`${classTerm.id}:${subject.id}`)!

        // Scores respect the school's assessment scheme maxima. A wide spread is
        // deliberate: the promotion policy in step 10 has to actually fail somebody.
        const ability = 0.35 + rand() * 0.55
        const ca1 = Math.min(SCHEME.ca1Max, Math.round(ability * SCHEME.ca1Max + (rand() * 2 - 1)))
        const ca2 = Math.min(SCHEME.ca2Max, Math.round(ability * SCHEME.ca2Max + (rand() * 2 - 1)))
        const ca3 = Math.min(SCHEME.ca3Max, Math.round(ability * SCHEME.ca3Max + (rand() * 2 - 1)))
        const exam = Math.min(SCHEME.examMax, Math.round(ability * SCHEME.examMax + (rand() * 10 - 5)))
        const total = Math.max(0, ca1) + Math.max(0, ca2) + Math.max(0, ca3) + Math.max(0, exam)
        const band = gradeFor(total)

        await prisma.assessment.create({
          data: {
            studentId: enrolment.studentId,
            subjectId: subject.id,
            termId: term.id,
            studentClassTermId: enrolment.id,
            teacherId,
            ca1: Math.max(0, ca1),
            ca2: Math.max(0, ca2),
            ca3: Math.max(0, ca3),
            exam: Math.max(0, exam),
            grade: band?.grade ?? null,
            remark: band?.remark ?? null,
            // Entering a score is not releasing it. Publication happens below, per class,
            // and only for a term the school has actually closed.
            isPublished: false,
            createdBy: args.teachers.find((t) => t.teacherId === teacherId)!.userId,
            editedBy: args.teachers.find((t) => t.teacherId === teacherId)!.userId,
          },
        })
        assessmentRows++
      }
    }

    // The workflow row exists for every class term, so a term in progress is visibly DRAFT
    // rather than missing.
    const workflow = await prisma.classTermResultWorkflow.create({
      data: { classTermId: classTerm.id, status: ResultWorkflowStatus.DRAFT },
    })

    if (mode === "closed") {
      const examsUser = await prisma.user.findUnique({
        where: { id: args.examsUserId },
        select: { firstName: true, lastName: true, role: true },
      })
      const actorName = `${examsUser!.firstName} ${examsUser!.lastName}`

      const transitions: Array<[ResultWorkflowStatus, ResultWorkflowStatus, string, string]> = [
        [ResultWorkflowStatus.DRAFT, ResultWorkflowStatus.REVIEWED, "review", "Scores checked against the mark sheets."],
        [ResultWorkflowStatus.REVIEWED, ResultWorkflowStatus.PUBLISHED, "publish", "Released to students and parents."],
        [ResultWorkflowStatus.PUBLISHED, ResultWorkflowStatus.LOCKED, "lock", "Term closed; results frozen."],
      ]

      for (const [from, to, action, note] of transitions) {
        await prisma.classTermResultWorkflow.update({
          where: { id: workflow.id },
          data: {
            status: to,
            ...(to === ResultWorkflowStatus.REVIEWED
              ? { reviewedBy: args.examsUserId, reviewedAt: addDays(term.end, -10) }
              : {}),
            ...(to === ResultWorkflowStatus.PUBLISHED
              ? { publishedBy: args.examsUserId, publishedAt: addDays(term.end, -5) }
              : {}),
            ...(to === ResultWorkflowStatus.LOCKED
              ? { lockedBy: args.examsUserId, lockedAt: addDays(term.end, -1) }
              : {}),
          },
        })
        await prisma.resultWorkflowEvent.create({
          data: {
            workflowId: workflow.id,
            action,
            fromStatus: from,
            toStatus: to,
            actorId: args.examsUserId,
            actorName,
            actorRole: examsUser!.role,
            note,
          },
        })
      }

      // Publishing the class term releases its individual score rows. The two must move
      // together, because the portals read the row flag and the workflow drives the module.
      await prisma.assessment.updateMany({
        where: { studentClassTerm: { classTermId: classTerm.id }, termId: term.id },
        data: { isPublished: true, publishedAt: addDays(term.end, -5), publishedBy: args.examsUserId },
      })
      publishedClasses++
    }
  }

  return { assessmentRows, attendanceRows, publishedClasses }
}

/**
 * Re-derives the class result sheet through the same functions the compiler screen uses,
 * and stores nothing — positions are computed on read in this system, so the seed's job is
 * to prove they come out sensibly rather than to write them down.
 */
async function computePositions(classTermId: string, subjectIds: string[]) {
  const enrolments = await prisma.studentClassTerm.findMany({
    // ACTIVE *and* COMPLETED, matching getClassTermResults. Once a term has been rolled
    // forward its enrolments are COMPLETED, so filtering on ACTIVE alone would return an
    // empty sheet for every past term — including the ones a report card is printed from.
    where: { classTermId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: {
      studentId: true,
      student: {
        select: { admissionNo: true, user: { select: { firstName: true, lastName: true, gender: true } } },
      },
    },
  })

  const assessments = await prisma.assessment.findMany({
    where: { studentClassTerm: { classTermId } },
    select: {
      studentId: true,
      subjectId: true,
      ca1: true,
      ca2: true,
      ca3: true,
      exam: true,
      isAbsent: true,
      isExempt: true,
    },
  })

  return buildClassTermResults({
    students: enrolments.map((e) => ({
      studentId: e.studentId,
      studentName: `${e.student.user.firstName} ${e.student.user.lastName}`,
      admissionNo: e.student.admissionNo,
      gender: e.student.user.gender,
    })),
    subjectIds,
    assessments,
    gradeBands: GRADE_BANDS.map((b) => ({ ...b })),
  })
}

// ===========================================================================
// 9. Payments
// ===========================================================================

/**
 * Takes money against a student's outstanding charges, oldest charge first.
 *
 * The allocation is the part that matters. A payment is not a number on an account: it is
 * split across the specific charges it settles, so a `StudentCharge` always knows what has
 * been paid against it and the debtors report is arithmetic rather than opinion. Paying
 * ₦50,000 against a ₦45,000 tuition and a ₦7,500 levy settles the first and part-pays the
 * second, and both rows say so.
 */
async function recordPayment(args: {
  schoolId: string
  sessionId: string
  studentId: string
  termId: string
  amount: Prisma.Decimal
  paidOn: Date
  method: string
  receivedBy: string
  status?: PaymentStatus
}) {
  const year = args.paidOn.getFullYear()

  return prisma.$transaction(async (tx) => {
    const sequence = await nextSequence(tx, "receiptSequence", args.schoolId, year)
    const receiptNo = `RCT/${year}/${pad(sequence, 5)}`

    const payment = await tx.payment.create({
      data: {
        schoolId: args.schoolId,
        studentId: args.studentId,
        termId: args.termId,
        sessionId: args.sessionId,
        amount: args.amount,
        paymentDate: args.paidOn,
        receiptNo,
        paymentMethod: args.method,
        referenceNo: `REF${randInt(100000, 999999)}`,
        receivedBy: args.receivedBy,
        status: args.status ?? PaymentStatus.COMPLETED,
      },
    })

    // A pending payment has been promised, not received, so it must not reduce a balance.
    if ((args.status ?? PaymentStatus.COMPLETED) !== PaymentStatus.COMPLETED) {
      return { paymentId: payment.id, receiptNo, allocated: ZERO }
    }

    const outstanding = await tx.studentCharge.findMany({
      where: { studentId: args.studentId, balance: { gt: 0 } },
      orderBy: { createdAt: "asc" },
      select: { id: true, balance: true, amountPaid: true, finalAmountDue: true },
    })

    let remaining = args.amount
    let allocated = ZERO

    for (const charge of outstanding) {
      if (remaining.lessThanOrEqualTo(0)) break
      const portion = Prisma.Decimal.min(remaining, charge.balance)
      if (portion.lessThanOrEqualTo(0)) continue

      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, chargeId: charge.id, amount: portion },
      })

      const newPaid = charge.amountPaid.plus(portion)
      const newBalance = charge.finalAmountDue.minus(newPaid)
      await tx.studentCharge.update({
        where: { id: charge.id },
        data: {
          amountPaid: newPaid,
          balance: newBalance,
          status: newBalance.lessThanOrEqualTo(0)
            ? ChargeStatus.PAID
            : newPaid.greaterThan(0)
              ? ChargeStatus.PARTIAL
              : ChargeStatus.UNPAID,
        },
      })

      remaining = remaining.minus(portion)
      allocated = allocated.plus(portion)
    }

    return { paymentId: payment.id, receiptNo, allocated }
  })
}

/**
 * Collects fees for a term with a realistic spread: most families pay in full, some pay
 * part, a few pay nothing at all. The ones who pay nothing are what carries debt into the
 * next term in step 10, which is the behaviour this seed exists to demonstrate.
 */
async function collectFees(args: {
  schoolId: string
  sessionId: string
  term: TermRef
  students: StudentRef[]
  accountantUserId: string
  /** Fraction who clear their balance completely. */
  fullRate: number
  /** Fraction of the remainder who pay something. */
  partialRate: number
  includePending?: boolean
  /**
   * Families who pay nothing, every term.
   *
   * Without them the debtors report empties itself: a payment settles the oldest charge
   * first, so a student who falls behind in First Term and pays normally in Second Term
   * has their old balance quietly cleared by the new money. Real arrears belong to the same
   * households term after term, and that is the shape a bursar needs to see.
   */
  defaulters?: Set<string>
}) {
  let full = 0
  let partial = 0
  let none = 0
  let pending = 0
  let collected = ZERO

  for (const student of args.students) {
    const charges = await prisma.studentCharge.findMany({
      where: { studentId: student.studentId, termId: args.term.id, balance: { gt: 0 } },
      select: { balance: true },
    })
    // Session-wide charges (the admission fee) carry no termId, so pick them up on the
    // student's first term only.
    const sessionWide = await prisma.studentCharge.findMany({
      where: { studentId: student.studentId, termId: null, balance: { gt: 0 } },
      select: { balance: true },
    })

    const owed = [...charges, ...sessionWide].reduce((sum, c) => sum.plus(c.balance), ZERO)
    if (owed.lessThanOrEqualTo(0)) continue

    if (args.defaulters?.has(student.studentId)) {
      none++
      continue
    }

    const roll = rand()
    const paidOn = addDays(args.term.start, randInt(5, 60))

    if (roll < args.fullRate) {
      const result = await recordPayment({
        schoolId: args.schoolId,
        sessionId: args.sessionId,
        studentId: student.studentId,
        termId: args.term.id,
        amount: owed,
        paidOn,
        method: pick(["BANK_TRANSFER", "CASH", "POS"]),
        receivedBy: args.accountantUserId,
      })
      collected = collected.plus(result.allocated)
      full++
    } else if (roll < args.fullRate + args.partialRate) {
      // Round part payments to the nearest 500, the way a cashier actually takes money.
      const fraction = 0.3 + rand() * 0.4
      const raw = owed.times(fraction).toNumber()
      const amount = D(Math.max(2000, Math.round(raw / 500) * 500))
      const result = await recordPayment({
        schoolId: args.schoolId,
        sessionId: args.sessionId,
        studentId: student.studentId,
        termId: args.term.id,
        amount,
        paidOn,
        method: pick(["BANK_TRANSFER", "CASH", "POS"]),
        receivedBy: args.accountantUserId,
      })
      collected = collected.plus(result.allocated)
      partial++
    } else {
      none++
      // A transfer the family says they have made but the bank has not confirmed. It shows
      // on the receipt register and changes no balance until it is completed.
      if (args.includePending && rand() < 0.4) {
        await recordPayment({
          schoolId: args.schoolId,
          sessionId: args.sessionId,
          studentId: student.studentId,
          termId: args.term.id,
          amount: D(20000),
          paidOn,
          method: "BANK_TRANSFER",
          receivedBy: args.accountantUserId,
          status: PaymentStatus.PENDING,
        })
        pending++
      }
    }
  }

  return { full, partial, none, pending, collected }
}

// ===========================================================================
// 10. Promotion into the next term
// ===========================================================================

/**
 * Moves a term's students into the next term, judged by the school's promotion policy.
 *
 * The verdict comes from `evaluatePromotionEligibility`, the same function the transition
 * screen uses, fed by results built from the same aggregation the compiler uses. A student
 * the policy rejects is still moved — with `overrideIneligible`, which is what an admin
 * does in practice — but the reason is recorded on the transition so the override is
 * visible afterwards rather than silently forgotten.
 *
 * Old charges are deliberately left alone. A balance does not disappear because a term
 * ended: it stays on the charge it belongs to, the new term's fees are raised on top, and
 * the family's outstanding total is the sum of both.
 */
async function promoteIntoNextTerm(args: {
  schoolId: string
  fromTerm: TermRef
  toTerm: TermRef
  classes: ClassRef[]
  classTerms: ClassTermRef[]
  subjects: Map<string, { id: string; name: string; code: string; levels: readonly string[] }>
  policy: PromotionPolicy
  adminUserId: string
}) {
  let promoted = 0
  let overridden = 0
  let chargesRaised = 0
  const overrideReasons: string[] = []

  for (const klass of args.classes) {
    const fromClassTerm = args.classTerms.find(
      (ct) => ct.classId === klass.id && ct.termId === args.fromTerm.id,
    )!
    const toClassTerm = args.classTerms.find(
      (ct) => ct.classId === klass.id && ct.termId === args.toTerm.id,
    )!

    const enrolments = await prisma.studentClassTerm.findMany({
      where: { classTermId: fromClassTerm.id, status: "ACTIVE" },
      select: { studentId: true, student: { select: { user: { select: { firstName: true, lastName: true } } } } },
    })
    if (enrolments.length === 0) continue

    const offered = [...args.subjects.values()].filter((s) => s.levels.includes(klass.level))
    const rows = await computePositions(fromClassTerm.id, offered.map((s) => s.id))

    for (const enrolment of enrolments) {
      const row = rows.find((r) => r.studentId === enrolment.studentId)
      const marked = row ? Object.values(row.subjects).filter((s) => s.score !== null) : []
      const passed = marked.filter((s) => (s.score ?? 0) >= PASS_MARK).length

      const summary: StudentResultSummary = {
        studentId: enrolment.studentId,
        name: `${enrolment.student.user.firstName} ${enrolment.student.user.lastName}`,
        subjectCount: marked.length,
        averageScore: row?.averageScore ?? 0,
        passedSubjects: passed,
        hasUnpublishedResults: false,
      }

      const verdict = evaluatePromotionEligibility(summary, args.policy)
      const isOverride = !verdict.eligible
      if (isOverride) {
        overridden++
        if (overrideReasons.length < 3) {
          overrideReasons.push(`${verdict.name}: ${verdict.reasons.join("; ")}`)
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.studentClassTerm.updateMany({
          where: { studentId: enrolment.studentId, classTermId: fromClassTerm.id },
          data: { status: "COMPLETED" },
        })

        await tx.studentClassTerm.create({
          data: {
            studentId: enrolment.studentId,
            classTermId: toClassTerm.id,
            termId: args.toTerm.id,
            status: "ACTIVE",
          },
        })

        chargesRaised += await raiseEnrolmentCharges(tx, {
          schoolId: args.schoolId,
          studentId: enrolment.studentId,
          classTermId: toClassTerm.id,
          termId: args.toTerm.id,
        })

        await tx.studentTransition.create({
          data: {
            studentId: enrolment.studentId,
            fromClassTermId: fromClassTerm.id,
            toClassTermId: toClassTerm.id,
            transitionType: TransitionType.PROMOTION,
            transitionDate: args.toTerm.start,
            notes: isOverride
              ? `Moved into ${args.toTerm.name} [policy overridden: ${verdict.reasons.join("; ")}]`
              : `Moved into ${args.toTerm.name}`,
            createdBy: args.adminUserId,
          },
        })

        await tx.studentEnrollmentHistory.create({
          data: {
            studentId: enrolment.studentId,
            classTermId: toClassTerm.id,
            termId: args.toTerm.id,
            action: EnrollmentAction.PROMOTED,
            previousClassTermId: fromClassTerm.id,
            createdBy: args.adminUserId,
          },
        })
      })

      promoted++
    }
  }

  return { promoted, overridden, chargesRaised, overrideReasons }
}

// ===========================================================================
// 11. Mid-session intake
// ===========================================================================

/**
 * New students admitted straight into the third term.
 *
 * This is the case fees get wrong most often. These students have never been enrolled in an
 * earlier session, so `schedulesForEnrolment` treats them as NEW: they attract the admission
 * fee that the returning roll was charged once at the start, and they are spared the
 * development levy that only applies to returning students. Nobody writes that rule here —
 * it falls out of calling the same function.
 */
async function admitMidSession(args: {
  schoolId: string
  admissionFormat: string
  admissionPrefix: string
  classes: ClassRef[]
  classTerms: ClassTermRef[]
  term: TermRef
  adminUserId: string
  startingStudentIndex: number
  startingParentIndex: number
}) {
  step(11, `Admin admits a new intake directly into ${args.term.name}`)

  const year = SESSION_START.getFullYear()
  const newStudents: StudentRef[] = []
  let chargesRaised = 0

  for (let i = 0; i < NEW_INTAKE_THIRD_TERM; i++) {
    const klass = args.classes[i % args.classes.length]
    const classTerm = args.classTerms.find((ct) => ct.classId === klass.id && ct.termId === args.term.id)!

    const index = args.startingStudentIndex + i + 1
    const gender = rand() < 0.5 ? Gender.MALE : Gender.FEMALE
    const firstName = pick(gender === Gender.MALE ? FIRST_NAMES_M : FIRST_NAMES_F)
    const lastName = pick(LAST_NAMES)
    const admissionNo = await nextAdmissionNo(args.schoolId, args.admissionFormat, args.admissionPrefix, year)
    const state = pick(STATES)

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        role: Role.STUDENT,
        gender,
        dateOfBirth: new Date(year - (10 + klass.rank), randInt(0, 11), randInt(1, 28)),
        state: state.name,
        lga: state.lga,
        credentials: {
          create: [
            {
              type: CredentialType.EMAIL,
              value: `student${index}@${SCHOOL.domain}`,
              passwordHash: await hash(`Student${index}#2025`),
              isPrimary: true,
            },
            {
              type: CredentialType.REGISTRATION_NUMBER,
              value: admissionNo,
              passwordHash: await hash(`${lastName.toLowerCase()}${year}`),
              isPrimary: false,
            },
          ],
        },
      },
    })

    const student = await prisma.student.create({
      data: { userId: user.id, schoolId: args.schoolId, admissionNo, year },
    })

    const parentIndex = args.startingParentIndex + i + 1
    const parentUser = await prisma.user.create({
      data: {
        firstName: pick(FIRST_NAMES_M),
        lastName,
        role: Role.PARENT,
        gender: Gender.MALE,
        credentials: {
          create: {
            type: CredentialType.EMAIL,
            value: `parent${parentIndex}@${SCHOOL.domain}`,
            passwordHash: await hash(`Parent${parentIndex}#2025`),
            isPrimary: true,
          },
        },
      },
    })
    const parent = await prisma.parent.create({
      data: { userId: parentUser.id, schoolId: args.schoolId, occupation: "Trader" },
    })
    await prisma.studentParent.create({
      data: { studentId: student.id, parentId: parent.id, relationship: "Father" },
    })

    const result = await enrol({
      schoolId: args.schoolId,
      studentId: student.id,
      classTerm,
      termId: args.term.id,
      actorUserId: args.adminUserId,
      action: EnrollmentAction.ENROLLED,
    })
    chargesRaised += result.chargesRaised

    newStudents.push({
      studentId: student.id,
      userId: user.id,
      name: `${firstName} ${lastName}`,
      admissionNo,
      gender,
      joinedTermIndex: 2,
    })
    log(`   ${admissionNo}  ${firstName} ${lastName} → ${klass.name}  (${result.chargesRaised} charges)`)
  }

  log(`   ${newStudents.length} new students, ${chargesRaised} charges raised as NEW_STUDENTS`)
  return { newStudents }
}

// ===========================================================================
// 12. Payroll
// ===========================================================================

async function payrollSetup(schoolId: string, accountId: string, adminUserId: string) {
  step(12, "Admin configures salary scales, allowances and deductions")

  await prisma.staffConfig.create({
    data: {
      schoolId,
      staffNoPrefix: "STF",
      payrollClosingDay: 25,
      defaultAccountId: accountId,
      defaultPaymentMethod: PaymentMethod.BANK_TRANSFER,
      requirePayrollApproval: true,
      prorateFirstMonth: true,
      payslipNote: "Queries within 7 days to the Bursar's office.",
    },
  })

  const scales = {
    principal: await prisma.salaryScale.create({
      data: { schoolId, name: "Principal", gradeLevel: "GL-14", step: "1", baseSalary: D(320000) },
    }),
    senior: await prisma.salaryScale.create({
      data: { schoolId, name: "Senior Teacher", gradeLevel: "GL-09", step: "3", baseSalary: D(180000) },
    }),
    teacher: await prisma.salaryScale.create({
      data: { schoolId, name: "Teacher", gradeLevel: "GL-07", step: "1", baseSalary: D(140000) },
    }),
    support: await prisma.salaryScale.create({
      data: { schoolId, name: "Support Staff", gradeLevel: "GL-03", step: "2", baseSalary: D(65000) },
    }),
  }
  log(`   4 salary scales: Principal ₦320,000 · Senior ₦180,000 · Teacher ₦140,000 · Support ₦65,000`)

  // A percentage allowance and a fixed one, so computePay exercises both branches.
  const allowances = {
    housing: await prisma.allowanceType.create({
      data: { schoolId, name: "Housing", kind: ComponentKind.PERCENTAGE, value: D(20), isTaxable: true },
    }),
    transport: await prisma.allowanceType.create({
      data: { schoolId, name: "Transport", kind: ComponentKind.FIXED, value: D(15000), isTaxable: true },
    }),
  }

  // Pension is PRE_TAX and PAYE is POST_TAX, which is the ordering rule that makes the
  // taxable base different from the gross. Getting these the wrong way round is the
  // classic payroll bug, so the seed sets them deliberately.
  const deductions = {
    pension: await prisma.deductionType.create({
      data: {
        schoolId,
        name: "Pension (8%)",
        kind: ComponentKind.PERCENTAGE,
        value: D(8),
        timing: DeductionTiming.PRE_TAX,
      },
    }),
    paye: await prisma.deductionType.create({
      data: {
        schoolId,
        name: "PAYE",
        kind: ComponentKind.PERCENTAGE,
        value: D(7),
        timing: DeductionTiming.POST_TAX,
      },
    }),
    union: await prisma.deductionType.create({
      data: {
        schoolId,
        name: "Union Dues",
        kind: ComponentKind.FIXED,
        value: D(2000),
        timing: DeductionTiming.POST_TAX,
      },
    }),
  }
  log(`   allowances: Housing 20% (of base), Transport ₦15,000 fixed`)
  log(`   deductions: Pension 8% PRE_TAX, PAYE 7% POST_TAX, Union Dues ₦2,000 fixed`)

  return { scales, allowances, deductions }
}

async function assignSalaries(args: {
  schoolId: string
  adminStaffId: string
  accountantStaffId: string
  examsStaffId: string
  teachers: TeacherRef[]
  supportStaff: StaffRef[]
  scales: Record<string, { id: string; baseSalary: Prisma.Decimal }>
  allowances: Record<string, { id: string }>
  deductions: Record<string, { id: string }>
  adminUserId: string
}) {
  const effectiveFrom = addDays(SESSION_START, -30)

  const assignments: Array<{ staffId: string; scale: { id: string; baseSalary: Prisma.Decimal } }> = [
    { staffId: args.adminStaffId, scale: args.scales.principal },
    { staffId: args.accountantStaffId, scale: args.scales.senior },
    { staffId: args.examsStaffId, scale: args.scales.senior },
    ...args.teachers.map((t) => ({ staffId: t.staffId, scale: args.scales.teacher })),
    ...args.supportStaff.map((s) => ({ staffId: s.staffId, scale: args.scales.support })),
  ]

  for (const assignment of assignments) {
    await prisma.staffSalary.create({
      data: {
        staffId: assignment.staffId,
        scaleId: assignment.scale.id,
        baseSalary: assignment.scale.baseSalary,
        effectiveFrom,
        isActive: true,
        createdBy: args.adminUserId,
        approvedBy: args.adminUserId,
        approvedAt: effectiveFrom,
      },
    })

    for (const allowanceId of [args.allowances.housing.id, args.allowances.transport.id]) {
      await prisma.staffAllowance.create({
        data: { staffId: assignment.staffId, allowanceTypeId: allowanceId, startDate: effectiveFrom },
      })
    }
    for (const deductionId of [args.deductions.pension.id, args.deductions.paye.id, args.deductions.union.id]) {
      await prisma.staffDeduction.create({
        data: { staffId: assignment.staffId, deductionTypeId: deductionId, startDate: effectiveFrom },
      })
    }
  }

  log(`   ${assignments.length} staff on a salary, each with 2 allowances and 3 deductions`)
  return assignments.length
}

/**
 * One month's payroll, from generation to money leaving the account.
 *
 * Every figure comes from `computePay`, and the resulting lines are written to
 * `PayrollItemLine` as frozen text and amounts. That copying is intentional and is the
 * reason payslips can be reprinted years later: if the housing allowance changes next term,
 * this month's payslip still says what it said.
 *
 * A paid run also writes an `Expense`, so salaries appear in the expenditure reports beside
 * every other kind of spending rather than living in a separate world.
 */
async function runPayrollMonth(args: {
  schoolId: string
  sessionId: string
  year: number
  month: number
  accountId: string
  salariesCategoryId: string
  adminUserId: string
  accountantUserId: string
  termIdForMonth: string
  /** A run left unpaid, to show the approval queue. */
  settle: boolean
}) {
  const staff = await prisma.staff.findMany({
    where: { schoolId: args.schoolId, employmentStatus: EmploymentStatus.ACTIVE },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      salaries: { where: { isActive: true }, select: { baseSalary: true }, take: 1 },
      allowances: {
        where: { isActive: true },
        select: { valueOverride: true, allowanceType: { select: { id: true, name: true, kind: true, value: true, isTaxable: true } } },
      },
      deductions: {
        where: { isActive: true },
        select: { valueOverride: true, deductionType: { select: { id: true, name: true, kind: true, value: true, timing: true } } },
      },
    },
  })

  const payDate = new Date(args.year, args.month - 1, 26)

  const run = await prisma.payrollRun.create({
    data: {
      schoolId: args.schoolId,
      sessionId: args.sessionId,
      year: args.year,
      month: args.month,
      status: PayrollStatus.DRAFT,
      generatedBy: args.adminUserId,
    },
  })

  let totalBase = ZERO
  let totalAllowances = ZERO
  let totalDeductions = ZERO
  let totalGross = ZERO
  let totalNet = ZERO

  for (const member of staff) {
    const baseSalary = member.salaries[0]?.baseSalary
    if (!baseSalary) continue

    const allowanceComponents: PayComponent[] = member.allowances.map((a) => ({
      label: a.allowanceType.name,
      kind: a.allowanceType.kind,
      value: a.valueOverride ?? a.allowanceType.value,
      isTaxable: a.allowanceType.isTaxable,
      sourceType: "AllowanceType",
      sourceId: a.allowanceType.id,
    }))
    const deductionComponents: PayComponent[] = member.deductions.map((d) => ({
      label: d.deductionType.name,
      kind: d.deductionType.kind,
      value: d.valueOverride ?? d.deductionType.value,
      timing: d.deductionType.timing,
      sourceType: "DeductionType",
      sourceId: d.deductionType.id,
    }))

    const computed = computePay({
      baseSalary,
      allowances: allowanceComponents,
      deductions: deductionComponents,
    })

    const sequence = await nextSequence(prisma, "payslipSequence", args.schoolId, args.year)
    const item = await prisma.payrollItem.create({
      data: {
        schoolId: args.schoolId,
        runId: run.id,
        staffId: member.id,
        payslipNo: `PS/${args.year}/${pad(sequence, 5)}`,
        baseSalary: computed.baseSalary,
        totalAllowances: computed.totalAllowances,
        totalDeductions: computed.totalDeductions,
        grossPay: computed.grossPay,
        netPay: computed.netPay,
        status: args.settle ? PayrollItemStatus.PAID : PayrollItemStatus.PENDING,
        paidAt: args.settle ? payDate : null,
      },
    })

    await prisma.payrollItemLine.createMany({
      data: [
        ...computed.allowanceLines.map((line) => ({
          itemId: item.id,
          kind: PayrollLineKind.ALLOWANCE,
          label: line.label,
          amount: line.amount,
          isTaxable: line.isTaxable ?? null,
          sourceType: line.sourceType ?? null,
          sourceId: line.sourceId ?? null,
        })),
        ...computed.deductionLines.map((line) => ({
          itemId: item.id,
          kind: PayrollLineKind.DEDUCTION,
          label: line.label,
          amount: line.amount,
          timing: line.timing ?? null,
          sourceType: line.sourceType ?? null,
          sourceId: line.sourceId ?? null,
        })),
      ],
    })

    totalBase = totalBase.plus(computed.baseSalary)
    totalAllowances = totalAllowances.plus(computed.totalAllowances)
    totalDeductions = totalDeductions.plus(computed.totalDeductions)
    totalGross = totalGross.plus(computed.grossPay)
    totalNet = totalNet.plus(computed.netPay)
  }

  await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      totalBase,
      totalAllowances,
      totalDeductions,
      totalGross,
      totalNet,
      status: args.settle ? PayrollStatus.PAID : PayrollStatus.APPROVED,
      approvedBy: args.adminUserId,
      approvedAt: addDays(payDate, -2),
      ...(args.settle ? { paidBy: args.accountantUserId, paidAt: payDate } : {}),
    },
  })

  if (args.settle) {
    const voucherSeq = await nextSequence(prisma, "expenseVoucherSequence", args.schoolId, args.year)
    const expense = await prisma.expense.create({
      data: {
        schoolId: args.schoolId,
        sessionId: args.sessionId,
        termId: args.termIdForMonth,
        categoryId: args.salariesCategoryId,
        accountId: args.accountId,
        voucherNo: `PV/${args.year}/${pad(voucherSeq, 5)}`,
        payeeName: "Staff Payroll",
        payeeType: PayeeType.STAFF,
        description: `Salaries for ${args.month}/${args.year}`,
        amount: totalNet,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        expenseDate: payDate,
        status: ExpenseStatus.PAID,
        recordedBy: args.adminUserId,
        approvedBy: args.adminUserId,
        approvedAt: addDays(payDate, -2),
        paidBy: args.accountantUserId,
        paidAt: payDate,
      },
    })

    await prisma.salaryPayment.create({
      data: {
        schoolId: args.schoolId,
        runId: run.id,
        amount: totalNet,
        method: PaymentMethod.BANK_TRANSFER,
        accountId: args.accountId,
        reference: `SAL/${args.year}/${pad(args.month, 2)}`,
        paidAt: payDate,
        paidBy: args.accountantUserId,
        expenseId: expense.id,
      },
    })
  }

  return { runId: run.id, staffPaid: staff.length, totalNet, settled: args.settle }
}

// ===========================================================================
// 13. School activities and running costs
// ===========================================================================

/**
 * Everything the school spends money on that is not a salary, across the full expense
 * lifecycle: some vouchers paid, one still waiting for approval, one rejected. A module
 * that only ever holds approved records never proves its own workflow.
 */
async function recordExpenses(args: {
  schoolId: string
  sessionId: string
  terms: TermRef[]
  categories: Record<string, { id: string }>
  accounts: Record<string, { id: string }>
  adminUserId: string
  accountantUserId: string
}) {
  step(13, "School activities and running costs recorded as expenditure")

  const activities = [
    { name: "Inter-house Sports", category: "activities", amount: 185000, payee: "Gombe Sports Supplies" },
    { name: "Excursion to Yankari", category: "activities", amount: 240000, payee: "Northline Transport" },
    { name: "Speech and Prize Giving Day", category: "activities", amount: 310000, payee: "Elite Events Ltd" },
    { name: "Cultural Day", category: "activities", amount: 95000, payee: "Gombe Caterers" },
    { name: "Diesel for generator", category: "utilities", amount: 145000, payee: "Total Energies" },
    { name: "Electricity bill", category: "utilities", amount: 88000, payee: "Jos Electricity Distribution" },
    { name: "Classroom roof repair", category: "maintenance", amount: 275000, payee: "Sabo Builders" },
    { name: "Borehole servicing", category: "maintenance", amount: 60000, payee: "AquaTech Nigeria" },
  ]

  let paid = 0
  let pendingApproval = 0
  let rejected = 0
  const year = SESSION_START.getFullYear()

  for (let i = 0; i < activities.length; i++) {
    const activity = activities[i]
    const term = args.terms[i % args.terms.length]
    const expenseDate = addDays(term.start, randInt(10, 70))
    const voucherSeq = await nextSequence(prisma, "expenseVoucherSequence", args.schoolId, year)

    // The last two exercise the states that are not "paid".
    const status =
      i === activities.length - 1
        ? ExpenseStatus.REJECTED
        : i === activities.length - 2
          ? ExpenseStatus.PENDING_APPROVAL
          : ExpenseStatus.PAID

    await prisma.expense.create({
      data: {
        schoolId: args.schoolId,
        sessionId: args.sessionId,
        termId: term.id,
        categoryId: args.categories[activity.category].id,
        accountId: i % 2 === 0 ? args.accounts.bank.id : args.accounts.cash.id,
        voucherNo: `PV/${year}/${pad(voucherSeq, 5)}`,
        payeeName: activity.payee,
        payeeType: PayeeType.VENDOR,
        description: activity.name,
        amount: D(activity.amount),
        paymentMethod: i % 2 === 0 ? PaymentMethod.BANK_TRANSFER : PaymentMethod.CASH,
        expenseDate,
        status,
        recordedBy: args.accountantUserId,
        ...(status === ExpenseStatus.PAID
          ? {
              approvedBy: args.adminUserId,
              approvedAt: addDays(expenseDate, -2),
              paidBy: args.accountantUserId,
              paidAt: expenseDate,
            }
          : {}),
        ...(status === ExpenseStatus.REJECTED
          ? {
              decisionReason: "Three quotations not attached; resubmit with comparatives.",
            }
          : {}),
      },
    })

    if (status === ExpenseStatus.PAID) paid++
    else if (status === ExpenseStatus.PENDING_APPROVAL) pendingApproval++
    else rejected++
  }

  log(`   ${activities.length} vouchers: ${paid} paid, ${pendingApproval} awaiting approval, ${rejected} rejected`)
  return { paid, pendingApproval, rejected }
}

// ===========================================================================
// 14. Verification
// ===========================================================================

/**
 * Re-derives every rule the seed relied on and fails the run if one does not hold.
 *
 * Seeding and checking with the same code would be circular, so these read back from the
 * database and assert the property independently: money adds up, unreleased marks are
 * invisible, positions rank the way the tie rule says, a new student is billed differently
 * from a returning one.
 */
async function verify(args: {
  schoolId: string
  terms: TermRef[]
  classes: ClassRef[]
  classTerms: ClassTermRef[]
  subjects: Map<string, { id: string; name: string; code: string; levels: readonly string[] }>
}) {
  step(14, "Verifying the seeded system")

  const [firstTerm, secondTerm, thirdTerm] = args.terms

  // --- Fees ------------------------------------------------------------
  const charges = await prisma.studentCharge.findMany({
    select: { id: true, finalAmountDue: true, amountPaid: true, balance: true, status: true },
  })
  const balanceWrong = charges.filter(
    (c) => !c.finalAmountDue.minus(c.amountPaid).equals(c.balance),
  )
  check(balanceWrong.length === 0, `every charge satisfies balance = due − paid (${charges.length} charges)`)

  const statusWrong = charges.filter((c) => {
    const expected = c.balance.lessThanOrEqualTo(0)
      ? ChargeStatus.PAID
      : c.amountPaid.greaterThan(0)
        ? ChargeStatus.PARTIAL
        : ChargeStatus.UNPAID
    return c.status !== expected
  })
  check(statusWrong.length === 0, "charge status always agrees with the amounts")

  // Allocations must reconcile to what each charge says it has received.
  const allocationSums = await prisma.paymentAllocation.groupBy({
    by: ["chargeId"],
    _sum: { amount: true },
  })
  let allocationMismatch = 0
  for (const group of allocationSums) {
    const charge = charges.find((c) => c.id === group.chargeId)
    if (!charge) continue
    if (!(group._sum.amount ?? ZERO).equals(charge.amountPaid)) allocationMismatch++
  }
  check(allocationMismatch === 0, "allocations sum to amountPaid on every charge they touch")

  // A pending payment must not have moved any money.
  const pendingPayments = await prisma.payment.findMany({
    where: { status: PaymentStatus.PENDING },
    select: { id: true, _count: { select: { allocations: true } } },
  })
  check(
    pendingPayments.every((p) => p._count.allocations === 0),
    `pending payments allocate nothing (${pendingPayments.length} pending)`,
  )

  // --- New vs returning students ---------------------------------------
  const admissionSchedule = await prisma.feeSchedule.findFirst({
    where: { schoolId: args.schoolId, appliesTo: FeeAppliesTo.NEW_STUDENTS },
    select: { id: true, name: true },
  })
  const levySchedules = await prisma.feeSchedule.findMany({
    where: { schoolId: args.schoolId, appliesTo: FeeAppliesTo.RETURNING_STUDENTS },
    select: { id: true },
  })

  const midSessionStudents = await prisma.studentClassTerm.findMany({
    where: { termId: thirdTerm.id, student: { classTerms: { none: { termId: firstTerm.id } } } },
    select: { studentId: true },
  })
  const midSessionIds = midSessionStudents.map((s) => s.studentId)

  const midSessionAdmissionCharges = await prisma.studentCharge.count({
    where: { studentId: { in: midSessionIds }, feeScheduleId: admissionSchedule!.id },
  })
  check(
    midSessionIds.length > 0 && midSessionAdmissionCharges === midSessionIds.length,
    `the ${midSessionIds.length} mid-session entrants were each charged the ${admissionSchedule!.name}`,
  )

  const midSessionLevyCharges = await prisma.studentCharge.count({
    where: { studentId: { in: midSessionIds }, feeScheduleId: { in: levySchedules.map((s) => s.id) } },
  })
  check(
    midSessionLevyCharges === 0,
    "mid-session entrants were NOT charged the returning-students development levy",
  )

  const openingRoll = await prisma.studentClassTerm.findMany({
    where: { termId: firstTerm.id },
    select: { studentId: true },
  })
  const openingIds = openingRoll.map((s) => s.studentId)
  const openingLevies = await prisma.studentCharge.count({
    where: { studentId: { in: openingIds }, feeScheduleId: { in: levySchedules.map((s) => s.id) } },
  })
  check(
    openingLevies > 0,
    `the returning opening roll WAS charged the development levy (${openingLevies} charges)`,
  )

  // The other half of the same rule, and the one that silently breaks: a returning student
  // must never be re-charged the admission fee.
  const openingAdmissionCharges = await prisma.studentCharge.count({
    where: { studentId: { in: openingIds }, feeScheduleId: admissionSchedule!.id },
  })
  check(
    openingAdmissionCharges === 0,
    "the returning opening roll was NOT re-charged the admission fee",
  )

  // --- Carried-forward debt --------------------------------------------
  const debtors = await prisma.student.findMany({
    where: {
      charges: { some: { termId: firstTerm.id, balance: { gt: 0 } } },
      classTerms: { some: { termId: thirdTerm.id } },
    },
    select: {
      admissionNo: true,
      charges: { select: { balance: true, termId: true } },
    },
  })
  check(
    debtors.length > 0,
    `${debtors.length} students carry First Term debt into the current term`,
  )
  const carriesBothTerms = debtors.filter(
    (d) =>
      d.charges.some((c) => c.termId === firstTerm.id && c.balance.greaterThan(0)) &&
      d.charges.some((c) => c.termId === thirdTerm.id),
  )
  check(
    carriesBothTerms.length > 0,
    "old balances survive the rollover while the new term's fees are raised on top",
  )

  // --- Results visibility ----------------------------------------------
  const publishedFirst = await prisma.assessment.count({
    where: { termId: firstTerm.id, isPublished: true },
  })
  const unpublishedFirst = await prisma.assessment.count({
    where: { termId: firstTerm.id, isPublished: false },
  })
  check(publishedFirst > 0 && unpublishedFirst === 0, `First Term results are fully released (${publishedFirst} rows)`)

  const publishedSecond = await prisma.assessment.count({
    where: { termId: secondTerm.id, isPublished: true },
  })
  check(publishedSecond > 0, `Second Term results are released (${publishedSecond} rows)`)

  const thirdTotal = await prisma.assessment.count({ where: { termId: thirdTerm.id } })
  const thirdPublished = await prisma.assessment.count({
    where: { termId: thirdTerm.id, isPublished: true },
  })
  check(
    thirdTotal > 0 && thirdPublished === 0,
    `current term has ${thirdTotal} marks entered and none released — families see nothing yet`,
  )

  // --- Workflow ---------------------------------------------------------
  const lockedWorkflows = await prisma.classTermResultWorkflow.count({
    where: { classTerm: { termId: { in: [firstTerm.id, secondTerm.id] } }, status: ResultWorkflowStatus.LOCKED },
  })
  check(
    lockedWorkflows === args.classes.length * 2,
    `both closed terms are LOCKED for all ${args.classes.length} classes (${lockedWorkflows} workflows)`,
  )

  const draftWorkflows = await prisma.classTermResultWorkflow.count({
    where: { classTerm: { termId: thirdTerm.id }, status: ResultWorkflowStatus.DRAFT },
  })
  check(draftWorkflows === args.classes.length, `current term sits at DRAFT for all ${args.classes.length} classes`)

  const events = await prisma.resultWorkflowEvent.count()
  check(
    events === args.classes.length * 2 * 3,
    `every closed class term recorded review, publish and lock (${events} events)`,
  )

  // --- Positions --------------------------------------------------------
  const sampleClass = args.classes[0]
  const sampleClassTerm = args.classTerms.find(
    (ct) => ct.classId === sampleClass.id && ct.termId === firstTerm.id,
  )!
  const offered = [...args.subjects.values()].filter((s) => s.levels.includes(sampleClass.level))
  const rows = await computePositions(sampleClassTerm.id, offered.map((s) => s.id))

  const descending = rows.every((row, i) => i === 0 || rows[i - 1].totalScore >= row.totalScore)
  check(descending, `${sampleClass.name} First Term result sheet is ordered by total score`)
  check(rows.length > 0 && rows[0].position === 1, "the top of the sheet is position 1")

  const ranked = assignPositions(rows.map((r) => ({ studentId: r.studentId, totalScore: r.totalScore })))
  const tiesShare = ranked.every((row, i) => {
    if (i === 0) return true
    const prev = ranked[i - 1]
    return row.totalScore === prev.totalScore ? row.position === prev.position : row.position > prev.position
  })
  check(tiesShare, "equal totals share a position and the next distinct score skips places")

  // --- Grades -----------------------------------------------------------
  const gradedSample = await prisma.assessment.findMany({
    where: { termId: firstTerm.id, isPublished: true },
    select: { ca1: true, ca2: true, ca3: true, exam: true, grade: true },
    take: 200,
  })
  const gradeWrong = gradedSample.filter((a) => {
    const total = (a.ca1 ?? 0) + (a.ca2 ?? 0) + (a.ca3 ?? 0) + (a.exam ?? 0)
    return gradeFor(total)?.grade !== a.grade
  })
  check(gradeWrong.length === 0, `stored grades match the school's bands (${gradedSample.length} sampled)`)

  const overMax = await prisma.assessment.count({
    where: {
      OR: [
        { ca1: { gt: SCHEME.ca1Max } },
        { ca2: { gt: SCHEME.ca2Max } },
        { ca3: { gt: SCHEME.ca3Max } },
        { exam: { gt: SCHEME.examMax } },
      ],
    },
  })
  check(overMax === 0, "no score exceeds the assessment scheme's maximum")

  // --- Teacher assignment ----------------------------------------------
  const assessmentsWithTeacher = await prisma.assessment.findMany({
    where: { teacherId: { not: null } },
    select: { teacherId: true, subjectId: true, termId: true },
    take: 500,
  })
  let unassignedEntry = 0
  for (const row of assessmentsWithTeacher) {
    const holds = await prisma.teacherSubject.count({
      where: { teacherId: row.teacherId!, subjectId: row.subjectId, termId: row.termId },
    })
    if (holds === 0) unassignedEntry++
  }
  check(
    unassignedEntry === 0,
    `every score was entered by a teacher who holds that subject that term (${assessmentsWithTeacher.length} sampled)`,
  )

  // --- Payroll ----------------------------------------------------------
  const runs = await prisma.payrollRun.findMany({
    select: { id: true, year: true, month: true, status: true, totalNet: true, totalGross: true, totalDeductions: true },
  })
  const netWrong = runs.filter((r) => !r.totalGross.minus(r.totalDeductions).equals(r.totalNet))
  check(netWrong.length === 0, `every payroll run satisfies net = gross − deductions (${runs.length} runs)`)

  const items = await prisma.payrollItem.findMany({
    select: {
      id: true,
      baseSalary: true,
      totalAllowances: true,
      totalDeductions: true,
      grossPay: true,
      netPay: true,
      lines: { select: { kind: true, amount: true } },
    },
    take: 100,
  })
  let itemMismatch = 0
  for (const item of items) {
    const allowanceLines = item.lines
      .filter((l) => l.kind === PayrollLineKind.ALLOWANCE)
      .reduce((sum, l) => sum.plus(l.amount), ZERO)
    const deductionLines = item.lines
      .filter((l) => l.kind === PayrollLineKind.DEDUCTION)
      .reduce((sum, l) => sum.plus(l.amount), ZERO)
    if (
      !allowanceLines.equals(item.totalAllowances) ||
      !deductionLines.equals(item.totalDeductions) ||
      !item.baseSalary.plus(item.totalAllowances).equals(item.grossPay) ||
      !item.grossPay.minus(item.totalDeductions).equals(item.netPay)
    ) {
      itemMismatch++
    }
  }
  check(itemMismatch === 0, `payslip lines reconcile to their totals (${items.length} payslips checked)`)

  const paidRuns = await prisma.payrollRun.count({ where: { status: PayrollStatus.PAID } })
  const salaryExpenses = await prisma.salaryPayment.count({ where: { expenseId: { not: null } } })
  check(
    paidRuns > 0 && salaryExpenses === paidRuns,
    `every paid payroll run produced an expenditure record (${paidRuns} runs)`,
  )

  // --- Uniqueness guards -------------------------------------------------
  const duplicateEnrolment = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM (
       SELECT studentId, termId FROM student_class_terms WHERE status = 'ACTIVE'
       GROUP BY studentId, termId HAVING COUNT(*) > 1
     ) d`,
  )
  check(Number(duplicateEnrolment[0].n) === 0, "no student is actively enrolled in two classes in one term")

  const receipts = await prisma.payment.groupBy({ by: ["receiptNo"], _count: { receiptNo: true } })
  check(
    receipts.every((r) => r._count.receiptNo === 1),
    `receipt numbers are unique (${receipts.length} receipts issued)`,
  )

  return problems.length === 0
}

// ===========================================================================
// main
// ===========================================================================

async function main() {
  const started = Date.now()
  console.log("\n════════════════════════════════════════════════════════════")
  console.log("  DigiSchool-Pro — full lifecycle seed")
  console.log("════════════════════════════════════════════════════════════")

  await wipe()

  const superAdmin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
    select: { id: true, firstName: true, lastName: true },
  })

  const { school } = await createSchool(superAdmin!.id)
  const { session, terms } = await createCalendar(school.id)
  const { classes, subjects, classTerms } = await createAcademics(school.id, terms)

  // The year before, so the opening roll counts as returning rather than new.
  const prior = await createPriorSession(school.id, classes)
  log(`   prior session ${prior.session.name} recorded, so the opening roll is a returning cohort`)
  const staff = await createStaff(school.id, superAdmin!.id)
  const { subjectTeacher } = await assignTeachers(terms, classes, classTerms, subjects, staff.teachers)
  const finance = await financeSetup(school.id, session.id, terms, classTerms)

  const { students, parents } = await admitStudents({
    schoolId: school.id,
    admissionFormat: SCHOOL.admissionFormat,
    admissionPrefix: SCHOOL.admissionPrefix,
    classes,
    classTerms,
    firstTerm: terms[0],
    adminUserId: staff.adminUserId,
    prior: { termId: prior.term.id, classTerms: prior.classTerms },
  })

  // Every seventh family falls behind and stays behind, so the debtors report has a real
  // population in it rather than whoever happened to be unlucky in one term.
  const defaulters = new Set(students.filter((_, i) => i % 7 === 0).map((s) => s.studentId))
  log(`   ${defaulters.size} households marked as persistent defaulters`)

  // --- Term by term -----------------------------------------------------
  const policy: PromotionPolicy = {
    requireResultsPublished: true,
    usePromotionCriteria: true,
    minAverage: 40,
    minSubjectsPassed: 4,
    minCreditsRequired: null,
    creditMark: 50,
    isGraduatingClass: false,
    evaluationScope: "TERM",
    requiredSubjectIds: [],
    minCoreSubjectsPassed: null,
    requireAllSubjectsEntered: false,
    allowManualOverride: true,
  }

  for (let t = 0; t < terms.length; t++) {
    const term = terms[t]
    const isCurrent = t === terms.length - 1
    step(8 + t * 0, `${term.name} — attendance, scores and results`)

    const academics = await runTermAcademics({
      schoolId: school.id,
      term,
      termIndex: t,
      classTerms,
      subjects,
      classes,
      subjectTeacher,
      teachers: staff.teachers,
      examsUserId: staff.examsUserId,
      mode: isCurrent ? "open" : "closed",
    })
    log(`   ${academics.attendanceRows} attendance records, ${academics.assessmentRows} score rows`)
    if (isCurrent) {
      log(`   left at DRAFT: marks entered, nothing released — this is the live term`)
    } else {
      log(`   ${academics.publishedClasses} classes reviewed → published → locked by the exams officer`)
    }

    step(9, `${term.name} — fee collection`)
    const collection = await collectFees({
      schoolId: school.id,
      sessionId: session.id,
      term,
      students: await currentRoll(term.id),
      accountantUserId: staff.accountantUserId,
      fullRate: isCurrent ? 0.45 : 0.68,
      partialRate: isCurrent ? 0.3 : 0.2,
      includePending: isCurrent,
      defaulters,
    })
    log(
      `   ${collection.full} paid in full · ${collection.partial} part paid · ${collection.none} unpaid` +
        (collection.pending ? ` · ${collection.pending} pending transfers` : ""),
    )
    log(`   ₦${collection.collected.toFixed(2)} allocated against charges`)

    // Roll forward, unless this is the term the school is still in.
    if (!isCurrent) {
      step(10, `Promotion: ${term.name} → ${terms[t + 1].name}`)
      const rollover = await promoteIntoNextTerm({
        schoolId: school.id,
        fromTerm: term,
        toTerm: terms[t + 1],
        classes,
        classTerms,
        subjects,
        policy,
        adminUserId: staff.adminUserId,
      })
      log(`   ${rollover.promoted} students moved, ${rollover.overridden} promoted on an override`)
      for (const reason of rollover.overrideReasons) log(`     override — ${reason}`)
      log(`   ${rollover.chargesRaised} charges raised for ${terms[t + 1].name}; old balances left standing`)
    }
  }

  // --- Mid-session intake ------------------------------------------------
  const midSession = await admitMidSession({
    schoolId: school.id,
    admissionFormat: SCHOOL.admissionFormat,
    admissionPrefix: SCHOOL.admissionPrefix,
    classes,
    classTerms,
    term: terms[2],
    adminUserId: staff.adminUserId,
    startingStudentIndex: students.length,
    startingParentIndex: parents.length,
  })

  // They arrive owing, then some of them pay — which is how a new entrant's balance
  // becomes visible next to a returning student's carried-forward debt.
  const intakeCollection = await collectFees({
    schoolId: school.id,
    sessionId: session.id,
    term: terms[2],
    students: midSession.newStudents,
    accountantUserId: staff.accountantUserId,
    fullRate: 0.4,
    partialRate: 0.35,
  })
  log(`   of the new intake: ${intakeCollection.full} paid in full, ${intakeCollection.partial} part paid, ${intakeCollection.none} unpaid`)

  // --- Payroll -----------------------------------------------------------
  const payroll = await payrollSetup(school.id, finance.accounts.bank.id, staff.adminUserId)
  await assignSalaries({
    schoolId: school.id,
    adminStaffId: staff.adminStaffId,
    accountantStaffId: staff.accountantStaffId,
    examsStaffId: staff.examsStaffId,
    teachers: staff.teachers,
    supportStaff: staff.supportStaff,
    scales: payroll.scales,
    allowances: payroll.allowances,
    deductions: payroll.deductions,
    adminUserId: staff.adminUserId,
  })

  step(12, "Monthly payroll run for every month of the session so far")
  const months: Array<{ year: number; month: number; termId: string }> = []
  const cursor = new Date(SESSION_START.getFullYear(), SESSION_START.getMonth(), 1)
  const limit = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)
  while (cursor <= limit) {
    // Each month is booked against whichever term contains it, because expenditure
    // reporting in this system is termly.
    const owningTerm =
      terms.find((t) => cursor >= new Date(t.start.getFullYear(), t.start.getMonth(), 1) && cursor <= t.end) ??
      terms.reduce((closest, t) => (Math.abs(+t.start - +cursor) < Math.abs(+closest.start - +cursor) ? t : closest))
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1, termId: owningTerm.id })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  let settledRuns = 0
  for (let m = 0; m < months.length; m++) {
    const month = months[m]
    // The most recent month is generated and approved but not yet paid, so the module has
    // something sitting in its queue rather than a history of nothing but finished work.
    const settle = m < months.length - 1
    const result = await runPayrollMonth({
      schoolId: school.id,
      sessionId: session.id,
      year: month.year,
      month: month.month,
      accountId: finance.accounts.bank.id,
      salariesCategoryId: finance.expenseCategories.salaries.id,
      adminUserId: staff.adminUserId,
      accountantUserId: staff.accountantUserId,
      termIdForMonth: month.termId,
      settle,
    })
    if (settle) settledRuns++
    log(
      `   ${String(month.month).padStart(2, "0")}/${month.year}  ${result.staffPaid} staff  net ₦${result.totalNet.toFixed(2)}  ${settle ? "PAID" : "APPROVED — awaiting payment"}`,
    )
  }
  log(`   ${months.length} runs total, ${settledRuns} settled`)

  await recordExpenses({
    schoolId: school.id,
    sessionId: session.id,
    terms,
    categories: finance.expenseCategories,
    accounts: finance.accounts,
    adminUserId: staff.adminUserId,
    accountantUserId: staff.accountantUserId,
  })

  const ok = await verify({ schoolId: school.id, terms, classes, classTerms, subjects })

  // --- Summary -----------------------------------------------------------
  const counts = {
    students: await prisma.student.count(),
    parents: await prisma.parent.count(),
    teachers: await prisma.teacher.count(),
    staff: await prisma.staff.count(),
    charges: await prisma.studentCharge.count(),
    payments: await prisma.payment.count(),
    assessments: await prisma.assessment.count(),
    attendance: await prisma.attendance.count(),
    payrollItems: await prisma.payrollItem.count(),
    expenses: await prisma.expense.count(),
    transitions: await prisma.studentTransition.count(),
  }

  const billed = await prisma.studentCharge.aggregate({ _sum: { finalAmountDue: true, amountPaid: true, balance: true } })

  console.log("\n════════════════════════════════════════════════════════════")
  console.log("  Seeded")
  console.log("════════════════════════════════════════════════════════════")
  console.log(`  School        ${SCHOOL.name} (${SCHOOL.code})`)
  console.log(`  Session       ${SESSION_NAME}, ${terms.length} terms, current = ${terms[2].name}`)
  console.log(`  People        ${counts.students} students · ${counts.parents} parents · ${counts.teachers} teachers · ${counts.staff} staff`)
  console.log(`  Academics     ${counts.assessments} scores · ${counts.attendance} attendance · ${counts.transitions} transitions`)
  console.log(`  Finance       ${counts.charges} charges · ${counts.payments} payments`)
  console.log(`                billed ₦${(billed._sum.finalAmountDue ?? ZERO).toFixed(2)} · collected ₦${(billed._sum.amountPaid ?? ZERO).toFixed(2)} · outstanding ₦${(billed._sum.balance ?? ZERO).toFixed(2)}`)
  console.log(`  Payroll       ${counts.payrollItems} payslips across ${months.length} monthly runs`)
  console.log(`  Expenditure   ${counts.expenses} vouchers`)
  console.log("")
  console.log("  Logins        password shown after each address")
  console.log(`   super admin  superadmin@schoolpro.ng        (SUPER_ADMIN_PASSWORD)`)
  console.log(`   admin        admin@${SCHOOL.domain}        Admin#2025`)
  console.log(`   accountant   accountant@${SCHOOL.domain}   Account#2025`)
  console.log(`   exams        exams@${SCHOOL.domain}        Exams#2025`)
  console.log(`   teacher      teacher1@${SCHOOL.domain}     Teacher1#2025   (…teacher${CLASSES.length})`)
  console.log(`   student      student1@${SCHOOL.domain}     Student1#2025   (…student${counts.students})`)
  console.log(`   parent       parent1@${SCHOOL.domain}      Parent1#2025    (…parent${counts.parents})`)
  console.log(`   a student may also sign in with their admission number, password <surname><year>`)
  console.log("")

  if (!ok) {
    console.log(`  ${problems.length} check(s) FAILED:`)
    for (const problem of problems) console.log(`    ✗ ${problem}`)
    console.log("")
    throw new Error("Seed completed but verification failed — see the failures above.")
  }

  console.log(`  All checks passed in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log("")
}

/** Everyone actively enrolled in a term, in the shape the fee collection step wants. */
async function currentRoll(termId: string): Promise<StudentRef[]> {
  const rows = await prisma.studentClassTerm.findMany({
    where: { termId, status: "ACTIVE" },
    select: {
      studentId: true,
      student: {
        select: {
          admissionNo: true,
          userId: true,
          user: { select: { firstName: true, lastName: true, gender: true } },
        },
      },
    },
  })
  return rows.map((row) => ({
    studentId: row.studentId,
    userId: row.student.userId,
    name: `${row.student.user.firstName} ${row.student.user.lastName}`,
    admissionNo: row.student.admissionNo,
    gender: row.student.user.gender ?? Gender.MALE,
    joinedTermIndex: 0,
  }))
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error instanceof Error ? error.message : error)
    if (error instanceof Error && error.stack) console.error(error.stack)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
