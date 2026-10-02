"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { recordAudit } from "@/lib/audit"
import { AuthorizationError, assertSchoolAccess, requirePermission, type Actor } from "@/lib/authz"
import { prisma } from "@/lib/db"
import { localFileKey } from "@/lib/local-storage"
import {
  onboardingSummary,
  staffOnboardingProgress,
  type OnboardingProgress,
} from "@/lib/hr/staff-onboarding"
import {
  SCHOOL_ADMIN_JOB_TITLE,
  provisionStaffForLogin,
  provisionStaffForTeacher,
  unlinkedFinanceOfficers,
  unlinkedSchoolAdmins,
  unlinkedTeachers,
} from "@/lib/hr/staff-provisioning"
import { getActiveSchool } from "@/lib/school-context.server"

/**
 * HR onboarding: who has just arrived, and what HR still needs from them.
 *
 * Kept out of `app/actions/hr.ts` because that file is already three thousand lines about
 * payroll, and because this is a different question — not "what is this person paid" but
 * "is this person's file complete enough to pay them at all".
 *
 * Two entry points into the queue, and both matter:
 *
 *  - Teachers created from now on arrive with a `Staff` record already made, courtesy of
 *    `provisionStaffForTeacher` inside the teacher-creation transaction.
 *  - Teachers created before that shipped, or during a failure, have none. `unlinkedTeachers`
 *    finds them and `linkTeacherToHr` fixes them one at a time or all at once.
 *
 * Without the second, "it usually works" would be the whole guarantee.
 */

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

function toError(error: unknown, fallback: string): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    const [issue] = error.issues
    return { success: false, error: issue?.message ?? fallback }
  }
  console.error(fallback, error)
  return { success: false, error: error instanceof Error ? error.message : fallback }
}

/** Same permission as the rest of HR — see the note on `requireHrManager` in hr.ts. */
async function requireHr(): Promise<Actor> {
  return requirePermission("payroll.manage")
}

async function actorSchool(actor: Actor): Promise<string> {
  if (actor.schoolId) return actor.schoolId
  if (actor.role === "SUPER_ADMIN") {
    const active = await getActiveSchool()
    if (active) return active.id
  }
  throw new AuthorizationError("Select a school before using HR")
}

function revalidateHr() {
  for (const base of ["/dashboard/admin/hr", "/dashboard/accountant/hr"]) {
    revalidatePath(base)
    revalidatePath(`${base}/onboarding`)
    revalidatePath(`${base}/staff`)
  }
}

/** Loads everything the checklist reads for one staff member. */
async function progressFor(staffId: string): Promise<OnboardingProgress | null> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      phone: true,
      email: true,
      dateOfBirth: true,
      gender: true,
      address: true,
      jobTitle: true,
      department: true,
      qualification: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
      pensionPfa: true,
      pensionPin: true,
      taxId: true,
      salaries: { where: { isActive: true }, select: { id: true }, take: 1 },
      documents: { select: { type: true } },
    },
  })
  if (!staff) return null

  return staffOnboardingProgress({
    ...staff,
    hasActiveSalary: staff.salaries.length > 0,
    documentTypes: staff.documents.map((document) => document.type),
  })
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

type UnlinkedLogin = {
  userId: string
  name: string
  email: string | null
  createdAt: string
  isActive: boolean
}

function unlinkedLoginView(user: Awaited<ReturnType<typeof unlinkedFinanceOfficers>>[number]): UnlinkedLogin {
  return {
    userId: user.id,
    name: `${user.firstName} ${user.lastName}`,
    email: user.credentials[0]?.value ?? null,
    createdAt: user.createdAt.toISOString(),
    isActive: user.isActive,
  }
}

export type OnboardingQueue = {
  /** Teachers with no HR record at all. */
  unlinked: Array<{
    teacherId: string
    name: string
    staffId: string
    department: string | null
    createdAt: string
    isActive: boolean
  }>
  /** Finance officers with no HR record - accountants created before they were provisioned. */
  unlinkedFinance: UnlinkedLogin[]
  /** School administrators with no HR record - created by the platform before it opened one. */
  unlinkedAdmins: UnlinkedLogin[]
  /** Staff records that exist but are not finished. */
  incomplete: Array<{
    staffId: string
    staffNo: string
    name: string
    jobTitle: string | null
    status: string
    autoProvisioned: boolean
    percentComplete: number
    summary: string
    outstanding: string[]
  }>
}

export async function getOnboardingQueue(): Promise<ActionResult<OnboardingQueue>> {
  try {
    const actor = await requireHr()
    const schoolId = await actorSchool(actor)

    const [teachers, financeOfficers, admins, staff] = await Promise.all([
      unlinkedTeachers(prisma, schoolId),
      unlinkedFinanceOfficers(prisma, schoolId),
      unlinkedSchoolAdmins(prisma, schoolId),
      prisma.staff.findMany({
        where: {
          schoolId,
          onboardingStatus: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          // A staff member who has left is not an onboarding problem.
          employmentStatus: { in: ["ACTIVE", "SUSPENDED"] },
        },
        select: {
          id: true,
          staffNo: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          onboardingStatus: true,
          autoProvisioned: true,
        },
        orderBy: [{ autoProvisioned: "desc" }, { createdAt: "desc" }],
      }),
    ])

    const incomplete = await Promise.all(
      staff.map(async (row) => {
        const progress = await progressFor(row.id)
        return {
          staffId: row.id,
          staffNo: row.staffNo,
          name: `${row.firstName} ${row.lastName}`,
          jobTitle: row.jobTitle,
          status: row.onboardingStatus,
          autoProvisioned: row.autoProvisioned,
          percentComplete: progress?.percentComplete ?? 0,
          summary: progress ? onboardingSummary(progress) : "",
          outstanding: progress?.outstandingRequired.map((item) => item.label) ?? [],
        }
      }),
    )

    return {
      success: true,
      data: {
        unlinked: teachers.map((teacher) => ({
          teacherId: teacher.id,
          name: `${teacher.user.firstName} ${teacher.user.lastName}`,
          staffId: teacher.staffId,
          department: teacher.department,
          createdAt: teacher.createdAt.toISOString(),
          isActive: teacher.user.isActive,
        })),
        unlinkedFinance: financeOfficers.map(unlinkedLoginView),
        unlinkedAdmins: admins.map(unlinkedLoginView),
        incomplete,
      },
    }
  } catch (error) {
    return toError(error, "Failed to load the onboarding queue")
  }
}

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------

const linkSchema = z.object({ teacherId: z.string().min(1) })

export async function linkTeacherToHr(input: unknown): Promise<ActionResult<{ staffNo: string }>> {
  try {
    const actor = await requireHr()
    const schoolId = await actorSchool(actor)
    const { teacherId } = linkSchema.parse(input)

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: {
        schoolId: true,
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
          },
        },
      },
    })
    if (!teacher) throw new Error("Teacher not found")
    assertSchoolAccess(actor, teacher.schoolId)
    if (teacher.schoolId !== schoolId) throw new AuthorizationError("That teacher is in another school")

    const outcome = await provisionStaffForTeacher(prisma, {
      schoolId,
      userId: teacher.userId,
      firstName: teacher.user.firstName,
      lastName: teacher.user.lastName,
      preferredStaffNo: teacher.staffId,
      phone: teacher.user.phone,
      gender: teacher.user.gender,
      dateOfBirth: teacher.user.dateOfBirth,
      address: teacher.user.address,
      department: teacher.department,
      qualification: teacher.qualification,
      // Their real start date, not today's — this is a backfill, and a wrong dateEmployed
      // would prorate their first payroll against the wrong month.
      dateEmployed: teacher.createdAt,
    })

    if (!outcome.created && outcome.reason === "FAILED") {
      throw new Error(`Could not create the staff record: ${outcome.error}`)
    }

    await recordAudit({
      actor,
      action: "staff.link_teacher",
      entityType: "Staff",
      entityId: outcome.created ? outcome.staffId : outcome.staffId,
      summary: `Linked ${teacher.user.firstName} ${teacher.user.lastName} to HR as ${outcome.staffNo}`,
    })

    revalidateHr()
    revalidatePath("/dashboard/admin/teachers")
    return { success: true, data: { staffNo: outcome.staffNo } }
  } catch (error) {
    return toError(error, "Failed to link that teacher to HR")
  }
}

const linkFinanceSchema = z.object({ userId: z.string().min(1) })

/** One finance officer's or administrator's HR record, created from their login. */
async function provisionLoginHolder(
  schoolId: string,
  holder: Awaited<ReturnType<typeof unlinkedFinanceOfficers>>[number],
  kind: "FINANCE" | "ADMIN",
) {
  return provisionStaffForLogin(prisma, {
    schoolId,
    userId: holder.id,
    firstName: holder.firstName,
    lastName: holder.lastName,
    phone: holder.phone,
    email: holder.credentials[0]?.value ?? null,
    gender: holder.gender,
    dateOfBirth: holder.dateOfBirth,
    address: holder.address,
    ...(kind === "FINANCE"
      ? { department: "Finance", staffType: "ACCOUNTANT" as const }
      : { department: "Administration", staffType: "ADMIN_STAFF" as const, jobTitle: SCHOOL_ADMIN_JOB_TITLE }),
    // Their real start date, for the same proration reason as a teacher backfill.
    dateEmployed: holder.createdAt,
  })
}

export async function linkFinanceOfficerToHr(input: unknown): Promise<ActionResult<{ staffNo: string }>> {
  try {
    const actor = await requireHr()
    const schoolId = await actorSchool(actor)
    const { userId } = linkFinanceSchema.parse(input)

    // Looked up through the unlinked list itself, so the school scope, the role and "has no
    // HR record yet" are all one query rather than three checks that could disagree.
    const officer = (await unlinkedFinanceOfficers(prisma, schoolId)).find((row) => row.id === userId)
    if (!officer) throw new Error("That finance officer is not in this school, or is already in HR")

    const outcome = await provisionLoginHolder(schoolId, officer, "FINANCE")
    if (!outcome.created && outcome.reason === "FAILED") {
      throw new Error(`Could not create the staff record: ${outcome.error}`)
    }

    await recordAudit({
      actor,
      action: "staff.link_finance_officer",
      entityType: "Staff",
      entityId: outcome.staffId,
      summary: `Linked ${officer.firstName} ${officer.lastName} to HR as ${outcome.staffNo}`,
    })

    revalidateHr()
    return { success: true, data: { staffNo: outcome.staffNo } }
  } catch (error) {
    return toError(error, "Failed to link that finance officer to HR")
  }
}

/**
 * A school administrator's HR record, created from their login.
 *
 * Only the record: it opens no access and changes none. From then on the administrator's
 * employment is HR's like everyone else's, and changing it needs `users.manage` (see
 * `setStaffEmploymentStatus`).
 */
export async function linkSchoolAdminToHr(input: unknown): Promise<ActionResult<{ staffNo: string }>> {
  try {
    const actor = await requireHr()
    const schoolId = await actorSchool(actor)
    const { userId } = linkFinanceSchema.parse(input)

    // Through the unlinked list, for the same reason as linkFinanceOfficerToHr.
    const admin = (await unlinkedSchoolAdmins(prisma, schoolId)).find((row) => row.id === userId)
    if (!admin) throw new Error("That administrator is not in this school, or is already in HR")

    const outcome = await provisionLoginHolder(schoolId, admin, "ADMIN")
    if (!outcome.created && outcome.reason === "FAILED") {
      throw new Error(`Could not create the staff record: ${outcome.error}`)
    }

    await recordAudit({
      actor,
      action: "staff.link_school_admin",
      entityType: "Staff",
      entityId: outcome.staffId,
      summary: `Linked administrator ${admin.firstName} ${admin.lastName} to HR as ${outcome.staffNo}`,
    })

    revalidateHr()
    return { success: true, data: { staffNo: outcome.staffNo } }
  } catch (error) {
    return toError(error, "Failed to link that administrator to HR")
  }
}

/** Every unlinked teacher, finance officer and administrator, in one go. */
export async function linkAllUnlinkedTeachers(): Promise<
  ActionResult<{ linked: number; failed: number }>
> {
  try {
    const actor = await requireHr()
    const schoolId = await actorSchool(actor)
    const [teachers, financeOfficers, admins] = await Promise.all([
      unlinkedTeachers(prisma, schoolId),
      unlinkedFinanceOfficers(prisma, schoolId),
      unlinkedSchoolAdmins(prisma, schoolId),
    ])

    let linked = 0
    let failed = 0
    // Sequential rather than parallel: staff numbers are derived from the highest existing
    // one, so concurrent provisioning would hand out the same number twice.
    for (const teacher of teachers) {
      const outcome = await provisionStaffForTeacher(prisma, {
        schoolId,
        userId: teacher.userId,
        firstName: teacher.user.firstName,
        lastName: teacher.user.lastName,
        preferredStaffNo: teacher.staffId,
        phone: teacher.user.phone,
        gender: teacher.user.gender,
        dateOfBirth: teacher.user.dateOfBirth,
        address: teacher.user.address,
        department: teacher.department,
        qualification: teacher.qualification,
        dateEmployed: teacher.createdAt,
      })
      if (outcome.created) linked += 1
      else if (outcome.reason === "FAILED") failed += 1
    }
    for (const officer of financeOfficers) {
      const outcome = await provisionLoginHolder(schoolId, officer, "FINANCE")
      if (outcome.created) linked += 1
      else if (outcome.reason === "FAILED") failed += 1
    }
    for (const admin of admins) {
      const outcome = await provisionLoginHolder(schoolId, admin, "ADMIN")
      if (outcome.created) linked += 1
      else if (outcome.reason === "FAILED") failed += 1
    }

    await recordAudit({
      actor,
      action: "staff.link_teachers_bulk",
      entityType: "Staff",
      summary: `Created ${linked} HR record(s) from unlinked staff logins${failed ? `, ${failed} failed` : ""}`,
    })

    revalidateHr()
    return { success: true, data: { linked, failed } }
  } catch (error) {
    return toError(error, "Failed to link the unlinked teachers")
  }
}

// ---------------------------------------------------------------------------
// One staff member's checklist
// ---------------------------------------------------------------------------

export type StaffOnboardingView = {
  staffId: string
  staffNo: string
  name: string
  status: string
  autoProvisioned: boolean
  percentComplete: number
  canComplete: boolean
  summary: string
  items: OnboardingProgress["items"]
  documents: Array<{
    id: string
    type: string
    title: string
    fileName: string | null
    storageKey: string
    expiresAt: string | null
    verifiedAt: string | null
    uploadedAt: string
  }>
}

export async function getStaffOnboarding(staffId: string): Promise<ActionResult<StaffOnboardingView>> {
  try {
    const actor = await requireHr()
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        schoolId: true,
        staffNo: true,
        firstName: true,
        lastName: true,
        onboardingStatus: true,
        autoProvisioned: true,
        documents: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            title: true,
            fileName: true,
            storageKey: true,
            expiresAt: true,
            verifiedAt: true,
            createdAt: true,
          },
        },
      },
    })
    if (!staff) throw new Error("Staff record not found")
    assertSchoolAccess(actor, staff.schoolId)

    const progress = await progressFor(staffId)
    if (!progress) throw new Error("Staff record not found")

    return {
      success: true,
      data: {
        staffId: staff.id,
        staffNo: staff.staffNo,
        name: `${staff.firstName} ${staff.lastName}`,
        status: staff.onboardingStatus,
        autoProvisioned: staff.autoProvisioned,
        percentComplete: progress.percentComplete,
        canComplete: progress.canComplete,
        summary: onboardingSummary(progress),
        items: progress.items,
        documents: staff.documents.map((document) => ({
          id: document.id,
          type: document.type,
          title: document.title,
          fileName: document.fileName,
          storageKey: document.storageKey,
          expiresAt: document.expiresAt?.toISOString() ?? null,
          verifiedAt: document.verifiedAt?.toISOString() ?? null,
          uploadedAt: document.createdAt.toISOString(),
        })),
      },
    }
  } catch (error) {
    return toError(error, "Failed to load that onboarding record")
  }
}

/**
 * Marks a staff member's file complete.
 *
 * Refuses while any REQUIRED item is outstanding. That refusal is the point of the whole
 * module: a stored flag saying "complete" over empty bank details is worse than no flag,
 * because payroll would believe it.
 */
export async function completeStaffOnboarding(
  staffId: string,
): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireHr()
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { schoolId: true, firstName: true, lastName: true },
    })
    if (!staff) throw new Error("Staff record not found")
    assertSchoolAccess(actor, staff.schoolId)

    const progress = await progressFor(staffId)
    if (!progress) throw new Error("Staff record not found")
    if (!progress.canComplete) {
      throw new Error(
        `Still outstanding: ${progress.outstandingRequired.map((item) => item.label).join(", ")}.`,
      )
    }

    await prisma.staff.update({
      where: { id: staffId },
      data: { onboardingStatus: "COMPLETE" },
    })

    await recordAudit({
      actor,
      action: "staff.onboarding_complete",
      entityType: "Staff",
      entityId: staffId,
      summary: `Onboarding completed for ${staff.firstName} ${staff.lastName}`,
    })

    revalidateHr()
    return { success: true, data: { status: "COMPLETE" } }
  } catch (error) {
    return toError(error, "Failed to complete that onboarding record")
  }
}

const reopenSchema = z.object({
  staffId: z.string().min(1),
  reason: z.string().trim().min(3).max(300),
})

export async function reopenStaffOnboarding(input: unknown): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireHr()
    const { staffId, reason } = reopenSchema.parse(input)
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { schoolId: true, firstName: true, lastName: true },
    })
    if (!staff) throw new Error("Staff record not found")
    assertSchoolAccess(actor, staff.schoolId)

    await prisma.staff.update({
      where: { id: staffId },
      data: { onboardingStatus: "IN_PROGRESS" },
    })

    await recordAudit({
      actor,
      action: "staff.onboarding_reopen",
      entityType: "Staff",
      entityId: staffId,
      summary: `Onboarding reopened for ${staff.firstName} ${staff.lastName}: ${reason}`,
    })

    revalidateHr()
    return { success: true, data: { status: "IN_PROGRESS" } }
  } catch (error) {
    return toError(error, "Failed to reopen that onboarding record")
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  staffId: z.string().min(1),
  type: z.enum([
    "APPOINTMENT_LETTER",
    "IDENTIFICATION",
    "QUALIFICATION_CERTIFICATE",
    "BIRTH_CERTIFICATE",
    "MEDICAL_REPORT",
    "REFERENCE_LETTER",
    "GUARANTOR_FORM",
    "CONTRACT",
    "OTHER",
  ]),
  title: z.string().trim().min(1).max(160),
  storageKey: z.string().trim().min(1).max(400),
  fileName: z.string().trim().max(200).optional().nullable(),
  fileSize: z.coerce.number().int().nonnegative().optional().nullable(),
  mimeType: z.string().trim().max(120).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
})

/**
 * Records a document already written to storage.
 *
 * Takes a storage key rather than a file: the upload route writes the bytes and calls this,
 * mirroring how expense receipts already work, so there is one place that knows about disk.
 */
export async function recordStaffDocument(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHr()
    const data = documentSchema.parse(input)

    const staff = await prisma.staff.findUnique({
      where: { id: data.staffId },
      select: { schoolId: true, onboardingStatus: true },
    })
    if (!staff) throw new Error("Staff record not found")
    assertSchoolAccess(actor, staff.schoolId)
    // Only a file uploaded as this school's staff document. Any other stored key - another
    // school's document, or an expense receipt - would otherwise be served back under this
    // staff record to whoever may read it.
    const key = localFileKey(data.storageKey)
    if (!key?.startsWith(`staff-documents/${staff.schoolId}/`)) {
      throw new Error("Upload the document for this school first")
    }

    const document = await prisma.staffDocument.create({
      data: {
        staffId: data.staffId,
        type: data.type,
        title: data.title,
        storageKey: data.storageKey,
        fileName: data.fileName ?? null,
        fileSize: data.fileSize ?? null,
        mimeType: data.mimeType ?? null,
        expiresAt: data.expiresAt ?? null,
        notes: data.notes ?? null,
        uploadedBy: actor.userId,
      },
      select: { id: true },
    })

    // Uploading the first thing moves a record out of NOT_STARTED, so the queue reflects
    // that somebody has begun rather than leaving it looking untouched.
    if (staff.onboardingStatus === "NOT_STARTED") {
      await prisma.staff.update({
        where: { id: data.staffId },
        data: { onboardingStatus: "IN_PROGRESS" },
      })
    }

    await recordAudit({
      actor,
      action: "staff.document_add",
      entityType: "StaffDocument",
      entityId: document.id,
      summary: `Added ${data.type.toLowerCase().replace(/_/g, " ")} for staff ${data.staffId}`,
    })

    revalidateHr()
    return { success: true, data: document }
  } catch (error) {
    return toError(error, "Failed to record that document")
  }
}

export async function verifyStaffDocument(documentId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHr()
    const document = await prisma.staffDocument.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, staff: { select: { schoolId: true } } },
    })
    if (!document) throw new Error("Document not found")
    assertSchoolAccess(actor, document.staff.schoolId)

    await prisma.staffDocument.update({
      where: { id: documentId },
      data: { verifiedAt: new Date(), verifiedBy: actor.userId },
    })

    await recordAudit({
      actor,
      action: "staff.document_verify",
      entityType: "StaffDocument",
      entityId: documentId,
      summary: `Verified "${document.title}"`,
    })

    revalidateHr()
    return { success: true, data: { id: documentId } }
  } catch (error) {
    return toError(error, "Failed to verify that document")
  }
}

export async function deleteStaffDocument(documentId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireHr()
    const document = await prisma.staffDocument.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, staff: { select: { schoolId: true } } },
    })
    if (!document) throw new Error("Document not found")
    assertSchoolAccess(actor, document.staff.schoolId)

    await prisma.staffDocument.delete({ where: { id: documentId } })

    await recordAudit({
      actor,
      action: "staff.document_delete",
      entityType: "StaffDocument",
      entityId: documentId,
      summary: `Removed "${document.title}"`,
    })

    revalidateHr()
    return { success: true, data: { id: documentId } }
  } catch (error) {
    return toError(error, "Failed to remove that document")
  }
}
