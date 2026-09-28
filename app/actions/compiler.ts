"use server"
import { prisma } from "@/lib/db"
import { assertSchoolAccess, requirePermission } from "@/lib/authz"
import { recordAudit } from "@/lib/audit"
import { revalidatePath } from "next/cache"
// import { z } from "zod"
import type { ClassLevel, ResultWorkflowStatus } from "@prisma/client"
import { buildClassTermResults } from "@/lib/results/class-term-results"
import { assertWorkflowTransition } from "@/lib/compiler-v2"
import { gradingSystemFromSnapshot } from "@/lib/result-snapshot"


// Authorize and get school ID
// Delegates to the shared boundary in lib/authz.ts. `undefined` still means "super
// admin, no school filter", which is what every caller in this file expects.
async function authorizeAndGetSchoolId(): Promise<string | undefined> {
  const actor = await requirePermission("compiler.review_results")
  return actor.schoolId ?? undefined
}

// Get grading system for a school
export async function getGradingSystem(schoolId: string) {
  try {
    const actor = await requirePermission("compiler.review_results")
    assertSchoolAccess(actor, schoolId)
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    })
    if (!school) {
      throw new Error("School not found")
    }

    const gradingSystem = await prisma.gradingSystem.findFirst({
      where: {
        schoolId,
        isDefault: true,
      },
      include: {
        levels: {
          orderBy: { minScore: "desc" },
        },
      },
    })

    if (!gradingSystem) {
      throw new Error("No default grading system found for this school")
    }


    return {
      success: true,
      data: {
        id: gradingSystem.id,
        name: gradingSystem.name,
        passMark: gradingSystem.passMark,
        levels: gradingSystem.levels.map((level) => ({
          id: level.id,
          minScore: level.minScore,
          maxScore: level.maxScore,
          grade: level.grade,
          remark: level.remark,
        })),
      },
    }
  } catch (error) {
    console.error("Failed to get grading system:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get classes for a term and level
export async function getClassesForTerm(termId: string, level: ClassLevel) {
  try {
    
    const schoolId = await authorizeAndGetSchoolId();

    const term = await prisma.term.findUnique({
      where: { id: termId },
      include: { 
        session: { 
          select: { 
            id: true,
            name: true,
            schoolId: true 
          } 
        } 
      },
    });

    if (!term) {
      console.log('❌ [getClassesForTerm] Term not found');
      throw new Error("Term not found");
    }
  

    if (schoolId && term.session.schoolId !== schoolId) {
      console.log('❌ [getClassesForTerm] School mismatch:', { adminSchoolId: schoolId, termSchoolId: term.session.schoolId });
      throw new Error("Term does not belong to admin's school");
    }

    const classTerms = await prisma.classTerm.findMany({
      where: {
        termId,
        class: { 
          level, 
          schoolId: schoolId || term.session.schoolId 
        },
      },
      include: {
        class: { select: { id: true, name: true, level: true } },
        term: {
          include: {
            session: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        teachers: {
          take: 1,
          include: {
            teacher: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        _count: {
          select: {
            students: {
              where: { status: { in: ["ACTIVE", "COMPLETED"] } },
            }
          }
        }
      },
    });
    const formattedClasses = classTerms.map((classTerm) => {
      const teacher = classTerm.teachers[0]?.teacher;
      return {
        id: classTerm.class.id,
        name: classTerm.class.name,
        level: classTerm.class.level,
        classTermId: classTerm.id,
        sessionName: classTerm.term.session.name,
        studentCount: classTerm._count.students,
        teacherId: teacher?.id || null,
        teacherName: teacher ? `${teacher.user.firstName} ${teacher.user.lastName}` : null,
      }
    });

    return { success: true, data: formattedClasses }
  } catch (error) {
    console.error("❌ [getClassesForTerm] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get students for a class term
export async function getStudentsForClassTerm(classTermId: string) {
  try {    
    const schoolId = await authorizeAndGetSchoolId();

    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: { 
        class: { select: { schoolId: true, name: true } },
        term: { select: { name: true } }
      },
    });

    if (!classTerm) {
      throw new Error("Class term not found");
    }
    

    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school");
    }


    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: {
        classTermId,
        status: { in: ["ACTIVE", "COMPLETED"] },
        student: {
          user: {
            isActive: true, 
          },
        },
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                gender: true,
              },
            },
          },
        },
      },
    })


    const formattedStudents = studentClassTerms.map((studentClassTerm) => ({
      id: studentClassTerm.student.id,
      studentClassTermId: studentClassTerm.id,
      admissionNo: studentClassTerm.student.admissionNo,
      fullName: `${studentClassTerm.student.user.firstName} ${studentClassTerm.student.user.lastName}`,
      gender: studentClassTerm.student.user.gender,
    }));

    return { success: true, data: formattedStudents }
  } catch (error) {
    console.error("❌ [getStudentsForClassTerm] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get subjects for a class term
export async function getClassTermSubjects(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: { class: { select: { schoolId: true } } },
    })

    if (!classTerm) throw new Error("Class term not found")
    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school")
    }

    const classSubjects = await prisma.classSubject.findMany({
      where: { classTermId },
      include: { subject: { select: { id: true, name: true, code: true } } },
    })

    const formattedSubjects = classSubjects.map((classSubject) => ({
      id: classSubject.subject.id,
      name: classSubject.subject.name,
      code: classSubject.subject.code,
      classSubjectId: classSubject.id,
    }))

    return { success: true, data: formattedSubjects }
  } catch (error) {
    console.error("Failed to get subjects for class term:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get subjects for a specific class term
export async function getSubjectsForClassTerm(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()

    // Get the class term to verify it belongs to the admin's school
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: {
          select: {
            schoolId: true,
          },
        },
      },
    })

    if (!classTerm) {
      throw new Error("Class term not found")
    }

    // If admin, verify the class belongs to their school
    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school")
    }

    // Get all class subjects for the class term
    const classSubjects = await prisma.classSubject.findMany({
      where: {
        classTermId,
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        subject: {
          name: "asc",
        },
      },
    })

    // Format the response
    const formattedSubjects = classSubjects.map((classSubject) => {
      return {
        id: classSubject.subject.id,
        name: classSubject.subject.name,
        code: classSubject.subject.code,
        classSubjectId: classSubject.id,
      }
    })

    return { success: true, data: formattedSubjects }
  } catch (error) {
    console.error("Failed to get subjects for class term:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get assessments for all subjects in a class term
export async function getAssessmentsForClassTerm(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: { class: { select: { schoolId: true } } },
    })

    if (!classTerm) throw new Error("Class term not found")
    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school")
    }

    const classSubjects = await prisma.classSubject.findMany({
      where: { classTermId },
      include: { subject: { select: { id: true, name: true, code: true } } },
    })

    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: { classTermId, status: { in: ["ACTIVE", "COMPLETED"] } },
      include: {
        student: { select: { id: true } },
      },
    })

    const assessments = await prisma.assessment.findMany({
      where: {
        studentClassTermId: {
          in: studentClassTerms.map((sct) => sct.id),
        },
        termId: classTerm.termId,
      },
      include: {
        student: { select: { id: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
    })

    const formattedAssessments = studentClassTerms.map((sct) => {
      const studentAssessments = assessments.filter((a) => a.student.id === sct.student.id)
      const subjects = classSubjects.map((cs) => {
        const assessment = studentAssessments.find((a) => a.subject.id === cs.subject.id)
        return {
          subjectId: cs.subject.id,
          subjectName: cs.subject.name,
          subjectCode: cs.subject.code,
          ca1: assessment?.ca1 ?? null,
          ca2: assessment?.ca2 ?? null,
          ca3: assessment?.ca3 ?? null,
          exam: assessment?.exam ?? null,
          isExempt: assessment?.isExempt ?? false,
          isAbsent: assessment?.isAbsent ?? false,
          isPublished: assessment?.isPublished ?? false,
          total: assessment && !assessment.isExempt && !assessment.isAbsent
            ? ((assessment.ca1 ?? 0) + (assessment.ca2 ?? 0) + (assessment.ca3 ?? 0) + (assessment.exam ?? 0))
            : null,
        }
      })
      return {
        studentId: sct.student.id,
        studentClassTermId: sct.id,
        subjects,
      }
    })

    return {
      success: true,
      data: {
        assessments: formattedAssessments,
        subjects: classSubjects.map((cs) => ({
          id: cs.subject.id,
          name: cs.subject.name,
          code: cs.subject.code,
        })),
      },
    }
  } catch (error) {
    console.error("Failed to get assessments for class term:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get class term results with grades and positions
export async function getClassTermResults(classTermId: string) {
  try {
    const schoolId = await authorizeAndGetSchoolId()
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: { select: { schoolId: true } },
        term: { include: { session: { select: { schoolId: true } } } },
        resultWorkflow: { select: { gradingSnapshot: true } },
      },
    })

    if (!classTerm) throw new Error("Class term not found")
    if (schoolId && classTerm.class.schoolId !== schoolId) {
      throw new Error("Class does not belong to admin's school")
    }

    const gradingSystem = await prisma.gradingSystem.findFirst({
      where: { schoolId: classTerm.class.schoolId, isDefault: true },
      include: { levels: { orderBy: { minScore: "desc" } } },
    })

    const frozenGradingSystem = gradingSystemFromSnapshot(classTerm.resultWorkflow?.gradingSnapshot)
    if (!gradingSystem && !frozenGradingSystem) throw new Error("No default grading system found")

    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: { classTermId, status: { in: ["ACTIVE", "COMPLETED"] } },
      include: {
        student: {
          include: {
            user: { select: { firstName: true, lastName: true, gender: true } },
          },
        },
      },
    })

    const classSubjects = await prisma.classSubject.findMany({
      where: { classTermId },
      include: { subject: { select: { id: true, name: true, code: true } } },
    })

    const assessments = await prisma.assessment.findMany({
      where: {
        studentClassTermId: { in: studentClassTerms.map((sct) => sct.id) },
        termId: classTerm.termId,
      },
      include: {
        student: { select: { id: true } },
        subject: { select: { id: true } },
      },
    })

    // The arithmetic lives in lib/results/class-term-results.ts so it can be tested
    // without a database. This action's job is to load the rows and hand them over.
    const finalResults = buildClassTermResults({
      students: studentClassTerms.map((sct) => ({
        studentId: sct.student.id,
        studentName: `${sct.student.user.firstName} ${sct.student.user.lastName}`,
        admissionNo: sct.student.admissionNo,
        gender: sct.student.user.gender,
      })),
      subjectIds: classSubjects.map((cs) => cs.subject.id),
      assessments: assessments.map((a) => ({
        studentId: a.student.id,
        subjectId: a.subject.id,
        ca1: a.ca1,
        ca2: a.ca2,
        ca3: a.ca3,
        exam: a.exam,
        isAbsent: a.isAbsent,
        isExempt: a.isExempt,
      })),
      gradeBands: frozenGradingSystem?.levels ?? gradingSystem!.levels,
    })

    return { success: true, data: finalResults }
  } catch (error) {
    console.error("Failed to get class term results:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}


// Auto-publish results if complete
/**
 * Checks whether every enrolled student has a usable entry for every subject the class term
 * offers. Absent and exempt count as entered — they are decisions, not gaps.
 */
async function classTermIsComplete(classTermId: string, termId: string) {
  const [classSubjects, studentClassTerms] = await Promise.all([
    prisma.classSubject.findMany({ where: { classTermId }, select: { subjectId: true } }),
    prisma.studentClassTerm.findMany({
      where: { classTermId, status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { id: true, studentId: true },
    }),
  ])

  const assessments = await prisma.assessment.findMany({
    where: {
      studentClassTermId: { in: studentClassTerms.map((sct) => sct.id) },
      subjectId: { in: classSubjects.map((cs) => cs.subjectId) },
      termId,
    },
  })

  const missing: string[] = []

  for (const sct of studentClassTerms) {
    for (const cs of classSubjects) {
      const entered = assessments.some(
        (a) =>
          a.studentId === sct.studentId &&
          a.subjectId === cs.subjectId &&
          (a.isExempt ||
            a.isAbsent ||
            (a.ca1 !== null && a.ca2 !== null && a.ca3 !== null && a.exam !== null)),
      )
      if (!entered) missing.push(`${sct.studentId}:${cs.subjectId}`)
    }
  }

  return {
    complete: missing.length === 0,
    missingCount: missing.length,
    studentCount: studentClassTerms.length,
    subjectCount: classSubjects.length,
    studentClassTermIds: studentClassTerms.map((sct) => sct.id),
  }
}

async function loadClassTermForWorkflow(classTermId: string) {
  const actor = await requirePermission("compiler.review_results")
  const classTerm = await prisma.classTerm.findUnique({
    where: { id: classTermId },
    include: {
      class: { select: { schoolId: true, name: true } },
      term: { select: { name: true } },
    },
  })

  if (!classTerm) throw new Error("Class term not found")
  assertSchoolAccess(actor, classTerm.class.schoolId)

  return { actor, classTerm }
}

async function ensureResultWorkflow(classTermId: string) {
  return prisma.classTermResultWorkflow.upsert({
    where: { classTermId },
    create: { classTermId },
    update: {},
  })
}

async function writeWorkflowEvent(input: {
  workflowId: string
  action: string
  fromStatus: ResultWorkflowStatus | null
  toStatus: ResultWorkflowStatus
  actor: Awaited<ReturnType<typeof requirePermission>>
  note?: string | null
}) {
  await prisma.resultWorkflowEvent.create({
    data: {
      workflowId: input.workflowId,
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorId: input.actor.userId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      note: input.note?.trim() || null,
    },
  })
}

export async function getClassTermResultWorkflow(classTermId: string) {
  try {
    const { classTerm } = await loadClassTermForWorkflow(classTermId)
    const workflow = await ensureResultWorkflow(classTermId)

    return {
      success: true,
      data: {
        id: workflow.id,
        classTermId,
        className: classTerm.class.name,
        termName: classTerm.term.name,
        status: workflow.status,
        reviewedAt: workflow.reviewedAt,
        publishedAt: workflow.publishedAt,
        lockedAt: workflow.lockedAt,
        withdrawnAt: workflow.withdrawnAt,
        notes: workflow.notes,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load result workflow",
    }
  }
}

export async function reviewClassTermResults(classTermId: string, note?: string) {
  try {
    const { actor, classTerm } = await loadClassTermForWorkflow(classTermId)
    const workflow = await ensureResultWorkflow(classTermId)

    assertWorkflowTransition(
      workflow.status,
      "REVIEWED",
      new Set(["compiler.review_results"]),
      note,
    )

    const reviewedAt = new Date()
    const updated = await prisma.classTermResultWorkflow.update({
      where: { id: workflow.id },
      data: {
        status: "REVIEWED",
        reviewedBy: actor.userId,
        reviewedAt,
        notes: note?.trim() || workflow.notes,
      },
    })

    await writeWorkflowEvent({
      workflowId: workflow.id,
      action: "results.review",
      fromStatus: workflow.status,
      toStatus: updated.status,
      actor,
      note,
    })

    await recordAudit({
      actor,
      action: "results.review",
      entityType: "ClassTerm",
      entityId: classTermId,
      schoolId: classTerm.class.schoolId,
      summary: `Reviewed results for ${classTerm.class.name}, ${classTerm.term.name}`,
      after: { classTermId, status: updated.status, reviewedAt: reviewedAt.toISOString() },
    })

    revalidatePath("/dashboard/admin/compiler/class-results")
    return { success: true, message: "Results marked as reviewed." }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to review results",
    }
  }
}

export async function lockClassTermResults(classTermId: string, note?: string) {
  try {
    const actor = await requirePermission("compiler.lock_results")
    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: { select: { schoolId: true, name: true } },
        term: { select: { name: true } },
      },
    })
    if (!classTerm) throw new Error("Class term not found")
    assertSchoolAccess(actor, classTerm.class.schoolId)

    const workflow = await ensureResultWorkflow(classTermId)
    assertWorkflowTransition(workflow.status, "LOCKED", new Set(["compiler.lock_results"]), note)

    const lockedAt = new Date()
    const updated = await prisma.classTermResultWorkflow.update({
      where: { id: workflow.id },
      data: {
        status: "LOCKED",
        lockedBy: actor.userId,
        lockedAt,
        notes: note?.trim() || workflow.notes,
      },
    })

    await writeWorkflowEvent({
      workflowId: workflow.id,
      action: "results.lock",
      fromStatus: workflow.status,
      toStatus: updated.status,
      actor,
      note,
    })

    await recordAudit({
      actor,
      action: "results.lock",
      entityType: "ClassTerm",
      entityId: classTermId,
      schoolId: classTerm.class.schoolId,
      summary: `Locked results for ${classTerm.class.name}, ${classTerm.term.name}`,
      after: { classTermId, status: updated.status, lockedAt: lockedAt.toISOString() },
    })

    revalidatePath("/dashboard/admin/compiler/class-results")
    return { success: true, message: "Results locked." }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to lock results",
    }
  }
}

/**
 * Releases a class term's results to students and parents.
 *
 * Replaces `autoPublishClassTermResults`, which flipped `isPublished` with no record of who
 * released it, no timestamp, and no way back. Schools work in three stages — compiled,
 * checked by the head, released — and a mistaken release previously could not be undone.
 */
export async function publishClassTermResults(classTermId: string) {
  try {
    const actor = await requirePermission("compiler.publish_results")

    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: { select: { schoolId: true, name: true } },
        term: { select: { name: true } },
      },
    })

    if (!classTerm) throw new Error("Class term not found")
    assertSchoolAccess(actor, classTerm.class.schoolId)
    const workflow = await ensureResultWorkflow(classTermId)
    if (workflow.status === "LOCKED") {
      return { success: false, message: "Locked results cannot be published again." }
    }

    const completeness = await classTermIsComplete(classTermId, classTerm.termId)

    if (!completeness.complete) {
      return {
        success: false,
        message:
          `Not ready to release. ${completeness.missingCount} of ` +
          `${completeness.studentCount * completeness.subjectCount} subject entries are ` +
          `still missing across ${completeness.studentCount} students. Mark a student ` +
          `absent or exempt if they have no score.`,
      }
    }

    const [gradingSystem, assessmentScheme] = await Promise.all([
      prisma.gradingSystem.findFirst({
        where: { schoolId: classTerm.class.schoolId, isDefault: true },
        include: { levels: { orderBy: { minScore: "desc" } } },
      }),
      prisma.assessmentScheme.findUnique({ where: { schoolId: classTerm.class.schoolId } }),
    ])
    if (!gradingSystem) throw new Error("No default grading system is configured")
    if (!assessmentScheme) throw new Error("No assessment scheme is configured")

    const gradingSnapshot = {
      id: gradingSystem.id,
      name: gradingSystem.name,
      passMark: gradingSystem.passMark,
      levels: gradingSystem.levels.map((level) => ({
        minScore: level.minScore,
        maxScore: level.maxScore,
        grade: level.grade,
        remark: level.remark,
      })),
    }
    const assessmentSchemeSnapshot = {
      id: assessmentScheme.id,
      name: assessmentScheme.name,
      ca1Max: assessmentScheme.ca1Max,
      ca2Max: assessmentScheme.ca2Max,
      ca3Max: assessmentScheme.ca3Max,
      examMax: assessmentScheme.examMax,
    }

    const publishedAt = new Date()
    const { result, updatedWorkflow } = await prisma.$transaction(async (tx) => {
      const result = await tx.assessment.updateMany({
        where: {
          studentClassTermId: { in: completeness.studentClassTermIds },
          termId: classTerm.termId,
          isPublished: false,
        },
        data: { isPublished: true, publishedAt, publishedBy: actor.userId },
      })

      const updatedWorkflow = await tx.classTermResultWorkflow.update({
        where: { id: workflow.id },
        data: {
          status: "PUBLISHED",
          publishedBy: actor.userId,
          publishedAt,
          withdrawnBy: null,
          withdrawnAt: null,
          gradingSnapshot,
          assessmentSchemeSnapshot,
          snapshotCapturedAt: publishedAt,
        },
      })
      return { result, updatedWorkflow }
    })

    await writeWorkflowEvent({
      workflowId: workflow.id,
      action: "results.publish",
      fromStatus: workflow.status,
      toStatus: updatedWorkflow.status,
      actor,
    })

    await recordAudit({
      actor,
      action: "results.publish",
      entityType: "ClassTerm",
      entityId: classTermId,
      schoolId: classTerm.class.schoolId,
      summary: `Released results for ${classTerm.class.name}, ${classTerm.term.name} to parents`,
      after: { classTermId, released: result.count, publishedAt: publishedAt.toISOString() },
    })

    revalidatePath("/dashboard/admin/compiler/class-results")
    revalidatePath("/dashboard/admin/compiler/class-results/termly")

    return {
      success: true,
      message:
        result.count > 0
          ? `Released ${result.count} result${result.count === 1 ? "" : "s"} for ${classTerm.class.name}, ${classTerm.term.name}.`
          : "These results were already released.",
    }
  } catch (error) {
    console.error("Failed to publish results:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

/**
 * Withdraws a class term's results from students and parents.
 *
 * The half that did not exist. A reason is required, because an unexplained withdrawal is
 * the kind of thing a parent will ask about and nobody will be able to answer.
 */
export async function unpublishClassTermResults(classTermId: string, reason: string) {
  try {
    const actor = await requirePermission("compiler.publish_results")

    if (!reason?.trim()) {
      return { success: false, message: "Give a reason for withdrawing these results." }
    }

    const classTerm = await prisma.classTerm.findUnique({
      where: { id: classTermId },
      include: {
        class: { select: { schoolId: true, name: true } },
        term: { select: { name: true } },
      },
    })

    if (!classTerm) throw new Error("Class term not found")
    assertSchoolAccess(actor, classTerm.class.schoolId)
    const workflow = await ensureResultWorkflow(classTermId)
    if (workflow.status === "LOCKED") {
      return { success: false, message: "Locked results cannot be withdrawn." }
    }

    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: { classTermId, status: { in: ["ACTIVE", "COMPLETED"] } },
      select: { id: true },
    })

    const result = await prisma.assessment.updateMany({
      where: {
        studentClassTermId: { in: studentClassTerms.map((sct) => sct.id) },
        termId: classTerm.termId,
        isPublished: true,
      },
      // publishedAt and publishedBy are left in place on purpose: they record that a
      // release happened, which withdrawing it does not undo.
      data: { isPublished: false },
    })

    const updatedWorkflow = await prisma.classTermResultWorkflow.update({
      where: { id: workflow.id },
      data: {
        status: "WITHDRAWN",
        withdrawnBy: actor.userId,
        withdrawnAt: new Date(),
        notes: reason.trim(),
      },
    })

    await writeWorkflowEvent({
      workflowId: workflow.id,
      action: "results.withdraw",
      fromStatus: workflow.status,
      toStatus: updatedWorkflow.status,
      actor,
      note: reason,
    })

    await recordAudit({
      actor,
      action: "results.unpublish",
      entityType: "ClassTerm",
      entityId: classTermId,
      schoolId: classTerm.class.schoolId,
      summary:
        `Withdrew results for ${classTerm.class.name}, ${classTerm.term.name} — ${reason.trim()}`,
      after: { classTermId, withdrawn: result.count, reason: reason.trim() },
    })

    revalidatePath("/dashboard/admin/compiler/class-results")
    revalidatePath("/dashboard/admin/compiler/class-results/termly")

    return {
      success: true,
      message: `Withdrew ${result.count} result${result.count === 1 ? "" : "s"} from parents.`,
    }
  } catch (error) {
    console.error("Failed to unpublish results:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}
