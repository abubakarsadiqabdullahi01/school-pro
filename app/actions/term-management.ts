"use server";

import { prisma } from "@/lib/db";
import { assertSchoolAccess, authActive, requirePermission, type Actor } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { getActiveSchool } from "@/lib/school-context.server";
import { revalidatePath } from "next/cache";

async function canManageSession(actor: Actor, sessionId: string) {
  const sessionData = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { schoolId: true, startDate: true, endDate: true },
  });

  if (!sessionData) {
    return null;
  }

  try {
    assertSchoolAccess(actor, sessionData.schoolId);
    return sessionData;
  } catch {
    return null;
  }
}

// Create a new term
export async function createTerm(data: {
  name: string;
  sessionId: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
}) {
  try {
    const actor = await requirePermission("academics.manage");

    // Check if term name already exists for this session
    const existingTerm = await prisma.term.findFirst({
      where: {
        name: data.name,
        sessionId: data.sessionId,
      },
    });

    if (existingTerm) {
      return {
        success: false,
        error: "Term name already exists for this session",
      };
    }

    // Validate that term dates are within session dates
    const sessionData = await canManageSession(actor, data.sessionId);

    if (!sessionData) {
      return { success: false, error: "Session not found for this school" };
    }

    if (
      data.startDate < sessionData.startDate ||
      data.endDate > sessionData.endDate
    ) {
      return {
        success: false,
        error: "Term dates must be within the session date range",
      };
    }

    // If setting as current, deactivate other current terms for this session
    if (data.isCurrent) {
      await prisma.term.updateMany({
        where: {
          sessionId: data.sessionId,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });
    }

    const newTerm = await prisma.term.create({
      data: {
        name: data.name,
        sessionId: data.sessionId,
        startDate: data.startDate,
        endDate: data.endDate,
        isCurrent: data.isCurrent,
      },
    });

    revalidatePath("/dashboard/super-admin/terms");
    revalidatePath("/dashboard/admin/school-terms");
    revalidatePath(`/dashboard/admin/school-sessions/${data.sessionId}`);
    return {
      success: true,
      data: newTerm,
      message: "Term created successfully",
    };
  } catch (error) {
    console.error("Error creating term:", error);
    return { success: false, error: "Failed to create term" };
  }
}

// Update term
export async function updateTerm(data: {
  id: string;
  name: string;
  sessionId: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
}) {
  try {
    const actor = await requirePermission("academics.manage");

    const targetTerm = await prisma.term.findUnique({
      where: { id: data.id },
      select: { sessionId: true },
    });

    if (!targetTerm) {
      return { success: false, error: "Term not found" };
    }

    if (targetTerm.sessionId !== data.sessionId) {
      return { success: false, error: "Term session cannot be changed from this form" };
    }

    // Check if term name already exists for another term in this session
    const existingTerm = await prisma.term.findFirst({
      where: {
        name: data.name,
        sessionId: data.sessionId,
        id: { not: data.id },
      },
    });

    if (existingTerm) {
      return {
        success: false,
        error: "Term name already exists for this session",
      };
    }

    // Validate that term dates are within session dates
    const sessionData = await canManageSession(actor, data.sessionId);

    if (!sessionData) {
      return { success: false, error: "Session not found for this school" };
    }

    if (
      data.startDate < sessionData.startDate ||
      data.endDate > sessionData.endDate
    ) {
      return {
        success: false,
        error: "Term dates must be within the session date range",
      };
    }

    // If setting as current, deactivate other current terms for this session
    if (data.isCurrent) {
      await prisma.term.updateMany({
        where: {
          sessionId: data.sessionId,
          isCurrent: true,
          id: { not: data.id },
        },
        data: { isCurrent: false },
      });
    }

    const updatedTerm = await prisma.term.update({
      where: { id: data.id },
      data: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        isCurrent: data.isCurrent,
      },
    });

    revalidatePath("/dashboard/super-admin/terms");
    revalidatePath("/dashboard/admin/school-terms");
    revalidatePath(`/dashboard/admin/school-terms/${data.id}`);
    revalidatePath(`/dashboard/admin/school-sessions/${data.sessionId}`);
    return {
      success: true,
      data: updatedTerm,
      message: "Term updated successfully",
    };
  } catch (error) {
    console.error("Error updating term:", error);
    return { success: false, error: "Failed to update term" };
  }
}

// Delete term
export async function deleteTerm(id: string) {
  try {
    const actor = await requirePermission("academics.manage");

    // Check if term has assessments or other related data
    const termWithData = await prisma.term.findUnique({
      where: { id },
      include: {
        session: {
          select: { schoolId: true },
        },
        _count: {
          select: {
            assessments: true,
            classTerms: true,
          },
        },
      },
    });

    if (!termWithData) {
      return { success: false, error: "Term not found" };
    }

    // Fees are keyed on ClassTerm now, so they are counted through it rather than
    // directly off the term.
    const feeStructureCount = await prisma.feeStructure.count({
      where: { classTerm: { termId: id } },
    });

    try {
      assertSchoolAccess(actor, termWithData.session.schoolId);
    } catch {
      return { success: false, error: "Unauthorized for this school" };
    }

    if (termWithData.isCurrent) {
      return { success: false, error: "Cannot delete current term" };
    }

    const totalRelatedData =
      termWithData._count.assessments +
      termWithData._count.classTerms +
      feeStructureCount;

    if (totalRelatedData > 0) {
      return {
        success: false,
        error:
          "Cannot delete term with existing data (assessments, classes, or fee structures)",
      };
    }

    await prisma.term.delete({
      where: { id },
    });

    revalidatePath("/dashboard/super-admin/terms");
    revalidatePath("/dashboard/admin/school-terms");
    revalidatePath(`/dashboard/admin/school-sessions/${termWithData.sessionId}`);
    return { success: true, message: "Term deleted successfully" };
  } catch (error) {
    console.error("Error deleting term:", error);
    return { success: false, error: "Failed to delete term" };
  }
}

// Set current term
export async function setCurrentTerm(termId: string, sessionId: string) {
  try {
    const actor = await requirePermission("academics.manage");

    const targetTerm = await prisma.term.findFirst({
      where: {
        id: termId,
        sessionId,
      },
      include: {
        session: {
          select: { schoolId: true },
        },
      },
    });

    if (!targetTerm) {
      return { success: false, error: "Term not found for this session" };
    }

    try {
      assertSchoolAccess(actor, targetTerm.session.schoolId);
    } catch {
      return { success: false, error: "Unauthorized for this school" };
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate all current terms for this session
      await tx.term.updateMany({
        where: {
          sessionId: sessionId,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });

      // Set the selected term as current
      await tx.term.update({
        where: { id: termId },
        data: { isCurrent: true },
      });
    });

    await recordAudit({
      actor,
      action: "term.set_current",
      entityType: "Term",
      entityId: termId,
      schoolId: targetTerm.session.schoolId,
      summary: `Made ${targetTerm.name} the current term`,
      after: { termId, sessionId, isCurrent: true },
    });

    revalidatePath("/dashboard/super-admin/terms");
    revalidatePath("/dashboard/admin/school-terms");
    revalidatePath("/dashboard/admin/school-sessions");
    return { success: true, message: "Current term updated successfully" };
  } catch (error) {
    console.error("Error setting current term:", error);
    return { success: false, error: "Failed to update current term" };
  }
}

// Get term details
export async function getTerm(id: string) {
  try {
    const actor = await requirePermission("academics.manage");

    const termData = await prisma.term.findUnique({
      where: { id },
      include: {
        session: {
          include: {
            school: {
              select: {
                name: true,
                code: true,
              },
            },
          },
        },
        _count: {
          select: {
            assessments: true,
            classTerms: true,
          },
        },
      },
    });

    if (!termData) {
      return { success: false, error: "Term not found" };
    }

    try {
      assertSchoolAccess(actor, termData.session.schoolId);
    } catch {
      return { success: false, error: "Unauthorized for this school" };
    }

    // Counted through ClassTerm — see deleteTerm above.
    const feeStructures = await prisma.feeStructure.count({
      where: { classTerm: { termId: id } },
    });

    return {
      success: true,
      data: { ...termData, _count: { ...termData._count, feeStructures } },
    };
  } catch (error) {
    console.error("Error fetching term:", error);
    return { success: false, error: "Failed to fetch term details" };
  }
}

// Get all terms with formatting
export async function getTerms() {
  try {
    const session = await authActive();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    const activeSchool = await getActiveSchool();

    const terms = await prisma.term.findMany({
      where: activeSchool ? { session: { schoolId: activeSchool.id } } : undefined,
      include: {
        session: {
          include: {
            school: {
              select: {
                name: true,
                code: true,
              },
            },
          },
        },
        _count: {
          select: {
            studentClassTerms: {
              where: {
                status: "ACTIVE", // Only count active enrollments
              },
            },
          },
        },
      },
      orderBy: [
        { isCurrent: "desc" },
        { session: { school: { name: "asc" } } },
        { startDate: "desc" },
      ],
    });

    const formattedTerms = terms.map((term) => ({
      id: term.id,
      name: term.name,
      sessionId: term.sessionId,
      sessionName: term.session.name,
      schoolId: term.session.schoolId,
      schoolName: term.session.school.name,
      schoolCode: term.session.school.code,
      startDate: term.startDate,
      endDate: term.endDate,
      isCurrent: term.isCurrent,
      studentsCount: term._count.studentClassTerms,
      createdAt: term.createdAt,
    }));

    return { success: true, data: formattedTerms };
  } catch (error) {
    console.error("Error fetching terms:", error);
    return { success: false, error: "Failed to fetch terms" };
  }
}
