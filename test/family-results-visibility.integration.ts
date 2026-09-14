import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * What a student and a parent are allowed to see of results.
 *
 * Publishing is a controlled, audited event: `publishResults` stamps `isPublished`,
 * `publishedAt` and `publishedBy`, and `unpublishResults` can pull a release back. The
 * student and parent dashboards ignored all of it and read every assessment row, so a mark
 * reached the family the moment a teacher typed it — mid-entry, pre-moderation, and before
 * the school had decided to release anything.
 */

const { prisma } = await import("@/lib/db")
const { publishedAssessmentsForStudent } = await import("@/lib/results-visibility")

const STAMP = "ZZFamilyResults"

const created = {
  userIds: [] as string[],
  studentIds: [] as string[],
  subjectIds: [] as string[],
}

let studentId = ""
let publishedSubjectId = ""
let draftSubjectId = ""
let publishedAssessmentId = ""
let draftAssessmentId = ""

beforeAll(async () => {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, admin: { schoolId: { not: null } } },
    select: { id: true, admin: { select: { schoolId: true } } },
  })
  if (!admin?.admin?.schoolId) throw new Error("No admin with a school")
  const schoolId = admin.admin.schoolId

  const term = await prisma.term.findFirst({
    where: { session: { schoolId } },
    orderBy: { startDate: "desc" },
    select: { id: true },
  })
  if (!term) throw new Error("The school has no term")

  const classTerm = await prisma.classTerm.findFirst({
    where: { termId: term.id, class: { schoolId } },
    select: { id: true },
  })
  if (!classTerm) throw new Error("The school has no class term")

  const studentUser = await prisma.user.create({
    data: { firstName: STAMP, lastName: "Child", role: "STUDENT" },
    select: { id: true },
  })
  created.userIds.push(studentUser.id)

  const student = await prisma.student.create({
    data: {
      userId: studentUser.id,
      schoolId,
      admissionNo: `${STAMP}-${Date.now()}`,
      year: 2024,
    },
    select: { id: true },
  })
  studentId = student.id
  created.studentIds.push(student.id)

  const sct = await prisma.studentClassTerm.create({
    data: { studentId: student.id, classTermId: classTerm.id, termId: term.id, status: "ACTIVE" },
    select: { id: true },
  })

  // Two subjects, so the published and the draft mark are genuinely distinct rows rather
  // than one row being toggled — the dashboard reads a list, and a list is what is tested.
  const published = await prisma.subject.create({
    data: { schoolId, name: `${STAMP} Released`, code: `${STAMP}-REL` },
    select: { id: true },
  })
  publishedSubjectId = published.id
  created.subjectIds.push(published.id)

  const draft = await prisma.subject.create({
    data: { schoolId, name: `${STAMP} Draft`, code: `${STAMP}-DRF` },
    select: { id: true },
  })
  draftSubjectId = draft.id
  created.subjectIds.push(draft.id)

  const publishedRow = await prisma.assessment.create({
    data: {
      studentId: student.id,
      subjectId: published.id,
      termId: term.id,
      studentClassTermId: sct.id,
      ca1: 10,
      ca2: 10,
      ca3: 10,
      exam: 50,
      isPublished: true,
      publishedAt: new Date(),
      publishedBy: admin.id,
      editedBy: admin.id,
      createdBy: admin.id,
    },
    select: { id: true },
  })
  publishedAssessmentId = publishedRow.id

  const draftRow = await prisma.assessment.create({
    data: {
      studentId: student.id,
      subjectId: draft.id,
      termId: term.id,
      studentClassTermId: sct.id,
      // Mid-entry: one CA in, nothing else marked. This is the shape that reached families.
      ca1: 4,
      isPublished: false,
      editedBy: admin.id,
      createdBy: admin.id,
    },
    select: { id: true },
  })
  draftAssessmentId = draftRow.id
})

afterAll(async () => {
  await prisma.assessment.deleteMany({ where: { studentId: { in: created.studentIds } } })
  await prisma.studentClassTerm.deleteMany({ where: { studentId: { in: created.studentIds } } })
  await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } })
  await prisma.subject.deleteMany({ where: { id: { in: created.subjectIds } } })
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } })
  await prisma.$disconnect()
})

describe("the fixture is real", () => {
  it("has one published mark and one unpublished mark for the same student", async () => {
    const rows = await prisma.assessment.findMany({
      where: { studentId },
      select: { id: true, isPublished: true },
    })
    expect(rows, "the fixture assessments were not created").toHaveLength(2)
    expect(
      rows.filter((row) => row.isPublished),
      "no published mark in the fixture",
    ).toHaveLength(1)
    expect(
      rows.filter((row) => !row.isPublished),
      "no unpublished mark in the fixture — the test would prove nothing",
    ).toHaveLength(1)
  })
})

describe("results visible to a family", () => {
  it("includes the published mark", async () => {
    const visible = await publishedAssessmentsForStudent(studentId)
    expect(visible.map((row) => row.id)).toContain(publishedAssessmentId)
  })

  it("excludes the mark the school has not released", async () => {
    const visible = await publishedAssessmentsForStudent(studentId)
    expect(
      visible.map((row) => row.id),
      "an unpublished mark reached the family",
    ).not.toContain(draftAssessmentId)
    expect(visible).toHaveLength(1)
  })

  it("hides the draft subject entirely, not just its score", async () => {
    // The dashboards render a per-subject table. Leaking the row with a blank score still
    // tells the family a subject was marked and withheld.
    const visible = await publishedAssessmentsForStudent(studentId)
    expect(visible.map((row) => row.subjectId)).toEqual([publishedSubjectId])
    expect(visible.map((row) => row.subjectId)).not.toContain(draftSubjectId)
  })

  it("comes back when the school releases it", async () => {
    await prisma.assessment.update({
      where: { id: draftAssessmentId },
      data: { isPublished: true, publishedAt: new Date() },
    })

    const visible = await publishedAssessmentsForStudent(studentId)
    expect(visible, "publishing did not make the mark visible").toHaveLength(2)

    // Put it back, so the assertions above do not depend on execution order.
    await prisma.assessment.update({
      where: { id: draftAssessmentId },
      data: { isPublished: false, publishedAt: null },
    })
  })
})
