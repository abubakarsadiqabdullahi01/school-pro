import type { Role } from "@prisma/client"

import { MODULE_GUIDES, type ModuleGuide, type ModuleGuideKey } from "@/lib/module-guides"

/**
 * The short tour shown the first time somebody signs in.
 *
 * Each stop is a guide key plus where it lives, so the wording comes from
 * `lib/module-guides.ts` rather than being written twice. A tour that drifted
 * away from the ⓘ on the screen it points at would be worse than none: the user
 * would be told two different things about the same page.
 */
export type TourStop = {
  guideKey: ModuleGuideKey
  /** Where the stop takes the user. */
  href: string
  /** Why this stop matters to this role, in one line. Not a repeat of the purpose. */
  why: string
}

const ADMIN_TOUR: TourStop[] = [
  {
    guideKey: "admin.terms",
    href: "/dashboard/admin/school-terms",
    why: "Start here. The term you mark current is the one the whole system works in.",
  },
  {
    guideKey: "admin.classTerms",
    href: "/dashboard/admin/class-terms",
    why: "Classes only become usable once they exist for a term, with subjects attached.",
  },
  {
    guideKey: "admin.students",
    href: "/dashboard/admin/students",
    why: "Admitting a student also raises their fees, in the same step.",
  },
  {
    guideKey: "admin.teacherAssignment",
    href: "/dashboard/admin/teachers",
    why: "Teachers can only enter marks for subjects assigned to them this term.",
  },
  {
    guideKey: "compiler.classResults",
    href: "/dashboard/admin/compiler/class-results",
    why: "Marks stay invisible to families until results are published here.",
  },
  {
    guideKey: "finance.fees",
    href: "/dashboard/admin/finance/fees",
    why: "What students are billed, and who each fee reaches.",
  },
  {
    guideKey: "admin.permissions",
    href: "/dashboard/admin/permissions",
    why: "Two people can both be admins and still see different screens.",
  },
]

const ACCOUNTANT_TOUR: TourStop[] = [
  {
    guideKey: "finance.dashboard",
    href: "/dashboard/accountant",
    why: "Billed, collected and outstanding for the current term at a glance.",
  },
  {
    guideKey: "finance.studentPayments",
    href: "/dashboard/accountant/student-payments",
    why: "Taking money issues a receipt and settles specific charges, oldest first.",
  },
  {
    guideKey: "finance.receipts",
    href: "/dashboard/accountant/receipts",
    why: "Where you find and reprint a receipt a parent has lost.",
  },
  {
    guideKey: "finance.debtors",
    href: "/dashboard/accountant/debtors",
    why: "Who is behind, so chasing is aimed at the right households.",
  },
  {
    guideKey: "expenditure.new",
    href: "/dashboard/accountant/expenditure/new",
    why: "Raising a voucher is not spending — approval and payment come after.",
  },
  {
    guideKey: "hr.payroll",
    href: "/dashboard/accountant/hr/payroll",
    why: "One run per month, and paying it also records the salary bill as expenditure.",
  },
]

const TEACHER_TOUR: TourStop[] = [
  {
    guideKey: "teacher.subjects",
    href: "/dashboard/teacher/subjects",
    why: "What you are assigned this term. Anything missing here you cannot mark.",
  },
  {
    guideKey: "teacher.myClasses",
    href: "/dashboard/teacher/my-classes",
    why: "The class you are form teacher for, and where behaviour ratings are entered.",
  },
  {
    guideKey: "compiler.subjectResultsEntry",
    href: "/dashboard/teacher/compiler",
    why: "Entering a mark is not releasing it — publishing is done elsewhere.",
  },
  {
    guideKey: "teacher.attendance",
    href: "/dashboard/teacher/attendance",
    why: "The daily register, which feeds the attendance figure on report cards.",
  },
]

const PARENT_TOUR: TourStop[] = [
  {
    guideKey: "parent.children",
    href: "/dashboard/parent/children",
    why: "Your children, their classes, and what is still owed.",
  },
  {
    guideKey: "parent.dashboard",
    href: "/dashboard/parent",
    why: "Results appear only once the school publishes them — an empty page is normal mid-term.",
  },
]

const STUDENT_TOUR: TourStop[] = [
  {
    guideKey: "student.dashboard",
    href: "/dashboard/student",
    why: "Your class, subjects, fees, and results once your school publishes them.",
  },
]

const SUPER_ADMIN_TOUR: TourStop[] = [
  {
    guideKey: "superAdmin.schools",
    href: "/dashboard/super-admin/schools",
    why: "Registering a school also creates the grading, assessment and permission setup it needs.",
  },
  {
    guideKey: "superAdmin.users",
    href: "/dashboard/super-admin/users/admins",
    why: "Accounts across every school, and where access is switched off.",
  },
  {
    guideKey: "admin.terms",
    href: "/dashboard/super-admin/terms",
    why: "The current-term flag drives what every role in that school sees.",
  },
  {
    guideKey: "superAdmin.analytics",
    href: "/dashboard/super-admin/analytics",
    why: "Activity across the whole deployment rather than one school.",
  },
]

const BY_ROLE: Record<Role, TourStop[]> = {
  SUPER_ADMIN: SUPER_ADMIN_TOUR,
  ADMIN: ADMIN_TOUR,
  ACCOUNTANT: ACCOUNTANT_TOUR,
  TEACHER: TEACHER_TOUR,
  PARENT: PARENT_TOUR,
  STUDENT: STUDENT_TOUR,
}

/**
 * The stops this person should actually be shown: their role's tour, minus any
 * stop whose screen their permissions would refuse. Pointing somebody at a page
 * that then bounces them is worse than leaving it out.
 */
export function tourStopsFor(role: Role, permissions: readonly string[]): TourStop[] {
  const held = new Set(permissions)
  return (BY_ROLE[role] ?? []).filter((stop) => {
    // Widened: the registry is `as const`, so each entry narrows to its own
    // literal shape and the optional fields do not exist on the union.
    const guide: ModuleGuide = MODULE_GUIDES[stop.guideKey]
    const required = guide.permissions
    if (!required || required.length === 0) return true
    return required.some((permission) => held.has(permission))
  })
}

/** Storage key — per user, so a shared computer does not hide the tour from the next person. */
export function tourStorageKey(userId: string): string {
  return `digischool.welcome-tour.v1.${userId}`
}
