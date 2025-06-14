"use server"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
// import { z } from "zod"
import type { ClassLevel } from "@prisma/client"




// Authorize and get school ID
async function authorizeAndGetSchoolId(): Promise<string | undefined> {
  const session = await auth()
  if (!session?.user || (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorized")
  }
  if (session.user.role === "ADMIN") {
    const admin = await prisma.admin.findUnique({
      where: { userId: session.user.id },
      select: { schoolId: true },
    })
    if (!admin?.schoolId) {
      throw new Error("Admin not assigned to a school")
    }
    return admin.schoolId
  }
  return undefined
}

// Get grading system for a school
export async function getGradingSystem(schoolId: string) {
  try {
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
    const schoolId = await authorizeAndGetSchoolId()
    const term = await prisma.term.findUnique({
      where: { id: termId },
      include: { session: { select: { schoolId: true } } },
    })

    if (!term) throw new Error("Term not found")
    if (schoolId && term.session.schoolId !== schoolId) {
      throw new Error("Term does not belong to admin's school")
    }

    const classTerms = await prisma.classTerm.findMany({
      where: {
        termId,
        class: { level, schoolId },
      },
      include: {
        class: { select: { id: true, name: true, level: true } },
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
      },
    })

    const formattedClasses = classTerms.map((classTerm) => {
      const teacher = classTerm.teachers[0]?.teacher
      return {
        id: classTerm.class.id,
        name: classTerm.class.name,
        level: classTerm.class.level,
        classTermId: classTerm.id,
        teacherId: teacher?.id || null,
        teacherName: teacher ? `${teacher.user.firstName} ${teacher.user.lastName}` : null,
      }
    })

    return { success: true, data: formattedClasses }
  } catch (error) {
    console.error("Failed to get classes for term:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// Get students for a class term
export async function getStudentsForClassTerm(classTermId: string) {
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

    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: { classTermId },
      include: {
        student: {
          include: {
            user: { select: { firstName: true, lastName: true, gender: true } },
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
    }))

    return { success: true, data: formattedStudents }
  } catch (error) {
    console.error("Failed to get students for class term:", error)
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
      where: { classTermId },
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

    if (!gradingSystem) throw new Error("No default grading system found")

    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: { classTermId },
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

    const results = studentClassTerms.map((sct) => {
      const studentAssessments = assessments.filter((a) => a.student.id === sct.student.id)
      let totalScore: number | null = 0
      let subjectCount = 0
      const subjects: Record<string, { score: number | null; grade: string | null }> = {}

      classSubjects.forEach((cs) => {
        const assessment = studentAssessments.find((a) => a.subject.id === cs.subject.id)
        const total = assessment && !assessment.isExempt && !assessment.isAbsent
          ? ((assessment.ca1 ?? 0) + (assessment.ca2 ?? 0) + (assessment.ca3 ?? 0) + (assessment.exam ?? 0))
          : null
        if (total !== null) {
          totalScore = (totalScore ?? 0) + total
          subjectCount++
        }
        const grade = total !== null
          ? gradingSystem.levels.find((level) => total >= level.minScore && total <= level.maxScore)?.grade ?? null
          : null
        subjects[cs.subject.id] = { score: total, grade }
      })

      const averageScore = subjectCount > 0 ? totalScore! / subjectCount : null
      const grade = averageScore !== null
        ? gradingSystem.levels.find((level) => averageScore >= level.minScore && averageScore <= level.maxScore)?.grade ?? null
        : null

      return {
        studentId: sct.student.id,
        studentName: `${sct.student.user.firstName} ${sct.student.user.lastName}`,
        admissionNo: sct.student.admissionNo,
        gender: sct.student.user.gender,
        subjects,
        totalScore: totalScore === 0 && subjectCount === 0 ? null : totalScore,
        averageScore: averageScore ?? 0,
        grade: grade ?? "",
        position: 0, // Placeholder, calculated below
      }
    })

    // Calculate positions
    const sortedResults = [...results].sort((a, b) => {
      const aScore = a.totalScore ?? -Infinity
      const bScore = b.totalScore ?? -Infinity
      return bScore - aScore
    })

    let currentPosition = 1
    let previousScore: number | null = null
    let tieCount = 0

    const finalResults = sortedResults.map((result, index) => {
      const currentScore = result.totalScore ?? null
      if (currentScore === null) {
        return { ...result, position: 0 }
      }
      if (previousScore !== null && currentScore < previousScore) {
        currentPosition += tieCount
        tieCount = 1
      } else if (currentScore === previousScore) {
        tieCount++
      } else {
        tieCount = 1
      }
      previousScore = currentScore
      return { ...result, position: currentPosition }
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
export async function autoPublishClassTermResults(classTermId: string) {
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
      select: { subjectId: true },
    })

    const studentClassTerms = await prisma.studentClassTerm.findMany({
      where: { classTermId },
      select: { id: true, studentId: true },
    })

    const assessments = await prisma.assessment.findMany({
      where: {
        studentClassTermId: { in: studentClassTerms.map((sct) => sct.id) },
        subjectId: { in: classSubjects.map((cs) => cs.subjectId) },
        termId: classTerm.termId,
      },
    })

    const isComplete = studentClassTerms.every((sct) =>
      classSubjects.every((cs) =>
        assessments.some(
          (a) =>
            a.studentId === sct.studentId &&
            a.subjectId === cs.subjectId &&
            (a.isExempt || a.isAbsent || (a.ca1 !== null && a.ca2 !== null && a.ca3 !== null && a.exam !== null))
        )
      )
    )

    if (isComplete) {
      await prisma.assessment.updateMany({
        where: {
          studentClassTermId: { in: studentClassTerms.map((sct) => sct.id) },
          termId: classTerm.termId,
        },
        data: { isPublished: true },
      })
      return { success: true, message: "Results published successfully" }
    } else {
      return { success: false, message: "Results incomplete, cannot publish" }
    }
  } catch (error) {
    console.error("Failed to auto-publish results:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}
