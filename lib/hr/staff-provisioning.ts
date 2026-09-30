import type { Prisma, StaffType } from "@prisma/client"

/**
 * Creating the HR side of a person who was added on the academic side.
 *
 * The gap: `createTeacher` wrote a `User` and a `Teacher` and stopped. HR never heard about
 * them. `Teacher.staffId` looks like a link to `Staff` and is not — it is a plain string
 * holding the school's own staff number, with no foreign key. The only real link is the
 * optional `Staff.userId`, which somebody had to set by hand from a dropdown in the HR
 * form, having first noticed there was somebody to set it for.
 *
 * Two rules shape everything here:
 *
 *  1. **Provisioning must never cost the school a teacher.** If HR configuration is
 *     missing, or a staff number collides, the teacher is still created and the record
 *     shows up in the onboarding queue instead. A half-built HR module must not be able to
 *     block the academic side.
 *  2. **A provisioned record must not look finished.** It carries `onboardingStatus:
 *     NOT_STARTED` and `autoProvisioned: true`, because a row with a name and nothing else
 *     otherwise looks to payroll exactly like a complete one. What "finished" means is
 *     decided by `lib/hr/staff-onboarding.ts` from the fields themselves.
 *
 * Everything takes a client parameter so it can run inside the same transaction as the
 * teacher it belongs to, or outside one when HR links an existing teacher by hand.
 */

/** Accepts both the full client and a transaction client. */
export type StaffWriteClient = Prisma.TransactionClient

/**
 * The next staff number for a school, as PREFIX-0001.
 *
 * Derived from the highest existing number rather than a counter table: staff numbers are
 * created one at a time by a person, so the race a sequence table protects against does
 * not arise, and there is no second source of truth to drift.
 *
 * Lifted out of `app/actions/hr.ts`, which had this inline against the global client and
 * so could not be reused from inside a transaction.
 */
export async function nextStaffNo(
  client: StaffWriteClient,
  schoolId: string,
  prefix: string,
): Promise<string> {
  const existing = await client.staff.findMany({
    where: { schoolId, staffNo: { startsWith: `${prefix}-` } },
    select: { staffNo: true },
  })
  const highest = existing.reduce((max, row) => {
    const parsed = Number.parseInt(row.staffNo.slice(prefix.length + 1), 10)
    return Number.isFinite(parsed) && parsed > max ? parsed : max
  }, 0)
  return `${prefix}-${String(highest + 1).padStart(4, "0")}`
}

export type TeacherProvisionInput = {
  schoolId: string
  userId: string
  firstName: string
  lastName: string
  /**
   * The staff ID the admin typed on the teacher form.
   *
   * Used as the HR staff number when it is free, so one person does not end up with two
   * different numbers on two screens — which is precisely the confusion this whole feature
   * exists to remove. Falls back to a generated one when it is taken or blank.
   */
  preferredStaffNo?: string | null
  phone?: string | null
  email?: string | null
  gender?: "MALE" | "FEMALE" | "OTHER" | null
  dateOfBirth?: Date | null
  address?: string | null
  department?: string | null
  qualification?: string | null
  /** Defaults to now. Passed in so a backfill can use the teacher's own creation date. */
  dateEmployed?: Date
}

export type ProvisionOutcome =
  | { created: true; staffId: string; staffNo: string }
  | { created: false; reason: "ALREADY_LINKED"; staffId: string; staffNo: string }
  /** HR had already hired them under that staff number; the new login was attached to it. */
  | { created: false; reason: "LINKED_EXISTING"; staffId: string; staffNo: string }
  | { created: false; reason: "FAILED"; error: string }

/** The HR record a provisioning run ended up pointing at, whichever way it got there. */
export function provisionedStaffNo(outcome: ProvisionOutcome): string | null {
  return outcome.created || outcome.reason !== "FAILED" ? outcome.staffNo : null
}

export type LoginProvisionInput = TeacherProvisionInput & {
  staffType: StaffType
  /** What a payslip prints. Defaults from the staff type. */
  jobTitle?: string | null
}

/**
 * Creates the HR record for a teacher, if there is not one already.
 *
 * Never throws. The caller is inside the transaction that creates the teacher, and an HR
 * problem must not roll that back — see rule 1 above. A failure here is recoverable
 * because `unlinkedTeachers` will find the teacher and offer to link them.
 */
export async function provisionStaffForTeacher(
  client: StaffWriteClient,
  input: TeacherProvisionInput,
): Promise<ProvisionOutcome> {
  return provisionStaffForLogin(client, {
    ...input,
    staffType: "TEACHER",
    // Not "Teacher": the job title is what payroll and a payslip print, and the department
    // they were added under is the most specific thing known so far.
    jobTitle: input.department ? `${input.department} Teacher` : "Teacher",
  })
}

/**
 * Creates, or finds, the HR record for any staff login - a teacher, or a finance officer.
 *
 * Employment is HR's. Whichever screen creates a staff login, the person must land in HR's
 * onboarding queue, or they are a member of staff payroll has never heard of. Finance
 * officers were exactly that: `createFinanceOfficer` wrote a login and stopped.
 *
 * When HR hired the person first, under the staff number now typed on the login form, the
 * login is attached to that record instead of opening a second one. Before this, the typed
 * number was simply "taken", a fresh one was generated, and the same human existed twice in
 * HR - once with the bank details and salary HR entered, once as an empty shell.
 *
 * Never throws - see rule 1 at the top of this file.
 */
export async function provisionStaffForLogin(
  client: StaffWriteClient,
  input: LoginProvisionInput,
): Promise<ProvisionOutcome> {
  try {
    // `Staff.userId` is @unique, so this both answers "is there one already" and prevents
    // the insert below from failing on a constraint.
    const existing = await client.staff.findUnique({
      where: { userId: input.userId },
      select: { id: true, staffNo: true },
    })
    if (existing) {
      return {
        created: false,
        reason: "ALREADY_LINKED",
        staffId: existing.id,
        staffNo: existing.staffNo,
      }
    }

    // HR's own record for this person, waiting for its login. Only one with no login yet,
    // and only when the name agrees too: a mistyped staff number must not hand somebody
    // else's salary and bank details to a new account.
    const preferred = input.preferredStaffNo?.trim()
    if (preferred) {
      const hired = await client.staff.findFirst({
        where: { schoolId: input.schoolId, staffNo: preferred, userId: null },
        select: { id: true, staffNo: true, firstName: true, lastName: true, employmentStatus: true },
      })
      // A former employee's record is not handed a new working login. The login is still
      // created (rule 1) and waits in HR's queue for HR to reinstate or re-hire them.
      if (hired && sameName(hired, input) && hired.employmentStatus !== "ACTIVE") {
        return {
          created: false,
          reason: "FAILED",
          error: `HR record ${hired.staffNo} is ${hired.employmentStatus.toLowerCase()}; reinstate it in HR to link this login`,
        }
      }
      if (hired && sameName(hired, input)) {
        await client.staff.update({
          where: { id: hired.id },
          data: { userId: input.userId },
        })
        return {
          created: false,
          reason: "LINKED_EXISTING",
          staffId: hired.id,
          staffNo: hired.staffNo,
        }
      }
    }

    const config = await client.staffConfig.findUnique({
      where: { schoolId: input.schoolId },
      select: { staffNoPrefix: true },
    })
    const prefix = config?.staffNoPrefix ?? "STF"

    const staffNo = await resolveStaffNo(client, input.schoolId, prefix, input.preferredStaffNo)

    const staff = await client.staff.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        staffNo,
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender === "OTHER" ? null : (input.gender ?? null),
        dateOfBirth: input.dateOfBirth ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        department: input.department ?? null,
        jobTitle: input.jobTitle ?? defaultJobTitle(input.staffType),
        staffType: input.staffType,
        employmentType: "FULL_TIME",
        employmentStatus: "ACTIVE",
        dateEmployed: input.dateEmployed ?? new Date(),
        qualification: input.qualification ?? null,
        onboardingStatus: "NOT_STARTED",
        autoProvisioned: true,
      },
      select: { id: true, staffNo: true },
    })

    return { created: true, staffId: staff.id, staffNo: staff.staffNo }
  } catch (error) {
    // Swallowed deliberately. See rule 1: the login is the thing that must survive.
    console.error("Failed to provision an HR record for user", input.userId, error)
    return {
      created: false,
      reason: "FAILED",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

function normalName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

/** First and last name agree, ignoring case and spacing. */
function sameName(
  a: { firstName: string; lastName: string },
  b: { firstName: string; lastName: string },
): boolean {
  return normalName(a.firstName) === normalName(b.firstName) && normalName(a.lastName) === normalName(b.lastName)
}

const JOB_TITLES: Partial<Record<StaffType, string>> = {
  TEACHER: "Teacher",
  ACCOUNTANT: "Accountant",
  ADMIN_STAFF: "Administrative Officer",
}

function defaultJobTitle(staffType: StaffType): string | null {
  return JOB_TITLES[staffType] ?? null
}

/**
 * The staff number to use: the one the admin typed, if it is free, otherwise a fresh one.
 *
 * The collision check is a read followed by a write, which is not atomic. That is
 * acceptable here and nowhere near as bad as it sounds: `@@unique([schoolId, staffNo])`
 * still refuses a duplicate, and a refusal lands in the catch above, leaving the teacher
 * created and the record in the onboarding queue. The failure mode is a manual link, not a
 * corrupt row.
 */
async function resolveStaffNo(
  client: StaffWriteClient,
  schoolId: string,
  prefix: string,
  preferred: string | null | undefined,
): Promise<string> {
  const trimmed = preferred?.trim()
  if (trimmed) {
    const taken = await client.staff.findFirst({
      where: { schoolId, staffNo: trimmed },
      select: { id: true },
    })
    if (!taken) return trimmed
  }
  return nextStaffNo(client, schoolId, prefix)
}

/**
 * Teachers in a school with no HR record at all.
 *
 * The safety net for every way provisioning can be skipped: teachers created before this
 * shipped, and the rare live failure above. Without this, "it usually works" would be the
 * whole guarantee.
 */
export async function unlinkedTeachers(client: StaffWriteClient, schoolId: string) {
  const [teachers, staffUserIds] = await Promise.all([
    client.teacher.findMany({
      where: { schoolId, user: { isActive: true } },
      select: {
        id: true,
        userId: true,
        staffId: true,
        department: true,
        qualification: true,
        createdAt: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            gender: true,
            dateOfBirth: true,
            address: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    client.staff
      .findMany({ where: { schoolId, userId: { not: null } }, select: { userId: true } })
      .then((rows) => new Set(rows.map((row) => row.userId))),
  ])

  return teachers.filter((teacher) => !staffUserIds.has(teacher.userId))
}

/**
 * Finance officers in a school with no HR record at all.
 *
 * The same safety net as `unlinkedTeachers`, for the accountants created before
 * `createFinanceOfficer` provisioned them. An accountant is staff with a payslip, and was
 * invisible to HR until now.
 */
export async function unlinkedFinanceOfficers(client: StaffWriteClient, schoolId: string) {
  return client.user.findMany({
    where: {
      role: "ACCOUNTANT",
      admin: { schoolId },
      staffRecord: { is: null },
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      gender: true,
      dateOfBirth: true,
      address: true,
      isActive: true,
      createdAt: true,
      credentials: { where: { type: "EMAIL" }, select: { value: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Why a staff member's login may not be switched back on, or null when it may.
 *
 * Employment belongs to HR: suspending or ending it switches the login off, and only
 * reinstating it in HR switches it back on. The Finance Staff screen and the platform's
 * user list could each switch a login on directly, which gave a dismissed bursar their
 * access back while HR still recorded them as gone.
 */
export async function loginBlockedByEmployment(client: StaffWriteClient, userId: string): Promise<string | null> {
  const staff = await client.staff.findUnique({ where: { userId }, select: { staffNo: true, employmentStatus: true } })
  if (!staff || staff.employmentStatus === "ACTIVE") return null
  return `HR records this person (${staff.staffNo}) as ${staff.employmentStatus.toLowerCase()}. `
    + "Reinstate them in HR, which switches their login back on."
}
