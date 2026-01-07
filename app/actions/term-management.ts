"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

// Create a new term
export async function createTerm(data: {
  name: string;
  sessionId: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
}) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

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
    const sessionData = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: { startDate: true, endDate: true },
    });

    if (!sessionData) {
      return { success: false, error: "Session not found" };
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
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" };
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
    const sessionData = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: { startDate: true, endDate: true },
    });

    if (!sessionData) {
      return { success: false, error: "Session not found" };
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
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    // Check if term has assessments or other related data
    const termWithData = await prisma.term.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assessments: true,
            classTerms: true,
            feeStructures: true,
          },
        },
      },
    });

    if (!termWithData) {
      return { success: false, error: "Term not found" };
    }

    if (termWithData.isCurrent) {
      return { success: false, error: "Cannot delete current term" };
    }

    const totalRelatedData =
      termWithData._count.assessments +
      termWithData._count.classTerms +
      termWithData._count.feeStructures;

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
    return { success: true, message: "Term deleted successfully" };
  } catch (error) {
    console.error("Error deleting term:", error);
    return { success: false, error: "Failed to delete term" };
  }
}

// Set current term
export async function setCurrentTerm(termId: string, sessionId: string) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" };
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

    revalidatePath("/dashboard/super-admin/terms");
    return { success: true, message: "Current term updated successfully" };
  } catch (error) {
    console.error("Error setting current term:", error);
    return { success: false, error: "Failed to update current term" };
  }
}

// Get term details
export async function getTerm(id: string) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

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
            feeStructures: true,
          },
        },
      },
    });

    if (!termData) {
      return { success: false, error: "Term not found" };
    }

    return { success: true, data: termData };
  } catch (error) {
    console.error("Error fetching term:", error);
    return { success: false, error: "Failed to fetch term details" };
  }
}

// Get all terms with formatting
export async function getTerms() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    const terms = await prisma.term.findMany({
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
