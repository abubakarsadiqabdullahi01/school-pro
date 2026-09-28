"use server";

import { prisma } from "@/lib/db";
import { assertSchoolAccess, authActive, requirePermission, type Actor } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { getActiveSchool } from "@/lib/school-context.server";
import { revalidatePath } from "next/cache";
import {
  canAddTermToSession,
  canEditTerm,
  canSetTermCurrent,
  canUseTermName,
} from "@/lib/term-rules";

async function canManageSession(actor: Actor, sessionId: string) {
  const sessionData = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { schoolId: true, startDate: true, endDate: true, isCurrent: true },
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
    if (!(data.startDate instanceof Date) || !(data.endDate instanceof Date) || data.startDate > data.endDate) {
      return { success: false, error: "Term start date must be on or before its end date" };
    }

    // A session holds one First, one Second and one Third Term. The form greys out the
    // names already taken; this is the same rule at the boundary.
    const siblingTerms = await prisma.term.findMany({
      where: { sessionId: data.sessionId },
      select: { name: true },
    });

    const nameVerdict = canUseTermName(
      data.name,
      siblingTerms.map((term) => term.name),
    );
    if (!nameVerdict.allowed) {
      return { success: false, error: `${data.name}: ${nameVerdict.reason}` };
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
    const overlapping = await prisma.term.findFirst({
      where: {
        sessionId: data.sessionId,
        startDate: { lte: data.endDate },
        endDate: { gte: data.startDate },
      },
      select: { name: true },
    });
    if (overlapping) {
      return { success: false, error: `Term dates overlap ${overlapping.name}` };
    }

    // A finished session is a closed year — adding a term to it rewrites a calendar that
    // results, fee charges and promotion trails are already filed against.
    const sessionVerdict = canAddTermToSession(sessionData, actor.role);
    if (!sessionVerdict.allowed) {
      return { success: false, error: sessionVerdict.reason };
    }

    // Marking a term current from this form is the same decision as Set as Current on the
    // list, and answers to the same rule — otherwise the form is a way around it.
    if (data.isCurrent) {
      const currentVerdict = canSetTermCurrent(
        { endDate: data.endDate, isCurrent: false },
        actor.role,
      );
      if (!currentVerdict.allowed) {
        return { success: false, error: currentVerdict.reason };
      }
    }

    const newTerm = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.session.updateMany({
          where: { schoolId: sessionData.schoolId, isCurrent: true },
          data: { isCurrent: false },
        });
        await tx.session.update({ where: { id: data.sessionId }, data: { isCurrent: true } });
        await tx.term.updateMany({
          where: { session: { schoolId: sessionData.schoolId }, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      const term = await tx.term.create({
        data: {
          name: data.name,
          sessionId: data.sessionId,
          startDate: data.startDate,
          endDate: data.endDate,
          isCurrent: data.isCurrent,
        },
      });
      if (data.isCurrent) {
        await tx.schoolAcademicPeriod.upsert({
          where: { schoolId: sessionData.schoolId },
          create: {
            schoolId: sessionData.schoolId,
            sessionId: data.sessionId,
            termId: term.id,
            updatedBy: actor.userId,
          },
          update: { sessionId: data.sessionId, termId: term.id, updatedBy: actor.userId },
        });
      }
      return term;
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
    if (!(data.startDate instanceof Date) || !(data.endDate instanceof Date) || data.startDate > data.endDate) {
      return { success: false, error: "Term start date must be on or before its end date" };
    }

    const targetTerm = await prisma.term.findUnique({
      where: { id: data.id },
      select: { sessionId: true, endDate: true, isCurrent: true },
    });

    if (!targetTerm) {
      return { success: false, error: "Term not found" };
    }
    if (targetTerm.isCurrent && !data.isCurrent) {
      return { success: false, error: "Select another current term instead of clearing the current term" };
    }

    if (targetTerm.sessionId !== data.sessionId) {
      return { success: false, error: "Term session cannot be changed from this form" };
    }

    // Judged on the stored dates, not the submitted ones: the question is whether the term
    // being edited is already history, which is not something the form gets to restate.
    const editVerdict = canEditTerm(targetTerm, actor.role);
    if (!editVerdict.allowed) {
      return { success: false, error: editVerdict.reason };
    }

    // Same rule as creation. The term's own name is not a clash with itself, which the
    // `id: { not: ... }` filter takes care of here.
    const siblingTerms = await prisma.term.findMany({
      where: { sessionId: data.sessionId, id: { not: data.id } },
      select: { name: true },
    });

    const nameVerdict = canUseTermName(
      data.name,
      siblingTerms.map((term) => term.name),
    );
    if (!nameVerdict.allowed) {
      return { success: false, error: `${data.name}: ${nameVerdict.reason}` };
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
    const overlapping = await prisma.term.findFirst({
      where: {
        sessionId: data.sessionId,
        id: { not: data.id },
        startDate: { lte: data.endDate },
        endDate: { gte: data.startDate },
      },
      select: { name: true },
    });
    if (overlapping) {
      return { success: false, error: `Term dates overlap ${overlapping.name}` };
    }

    // Marking a term current from this form is the same decision as Set as Current on the
    // list, and answers to the same rule — otherwise the form is a way around it.
    if (data.isCurrent) {
      const currentVerdict = canSetTermCurrent(
        { endDate: data.endDate, isCurrent: false },
        actor.role,
      );
      if (!currentVerdict.allowed) {
        return { success: false, error: currentVerdict.reason };
      }
    }

    const updatedTerm = await prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.session.updateMany({
          where: { schoolId: sessionData.schoolId, isCurrent: true },
          data: { isCurrent: false },
        });
        await tx.session.update({ where: { id: data.sessionId }, data: { isCurrent: true } });
        await tx.term.updateMany({
          where: { session: { schoolId: sessionData.schoolId }, isCurrent: true, id: { not: data.id } },
          data: { isCurrent: false },
        });
      }
      const term = await tx.term.update({
        where: { id: data.id },
        data: {
          name: data.name,
          startDate: data.startDate,
          endDate: data.endDate,
          isCurrent: data.isCurrent,
        },
      });
      if (data.isCurrent) {
        await tx.schoolAcademicPeriod.upsert({
          where: { schoolId: sessionData.schoolId },
          create: {
            schoolId: sessionData.schoolId,
            sessionId: data.sessionId,
            termId: data.id,
            updatedBy: actor.userId,
          },
          update: { sessionId: data.sessionId, termId: data.id, updatedBy: actor.userId },
        });
      }
      return term;
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
            // Term cascades to every one of these. Counting them is the only thing
            // standing between a mis-click and the money records for that term.
            payments: true,
            studentCharges: true,
            feeSchedules: true,
            expenses: true,
          },
        },
      },
    });

    if (!termWithData) {
      return { success: false, error: "Term not found" };
    }

    // FeeStructure is a dead table: no application code writes one, so this count was
    // always zero and the "fee structures" half of the refusal below never fired. The live
    // fee model is FeeSchedule, counted above, off the term directly.
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

    // A term that has already ended is history. Even one that happens to carry no
    // assessments or classes yet is part of the school's calendar, and deleting it
    // silently rewrites which terms a session ever had — which is how a promotion trail
    // ends up pointing at a term that no longer exists.
    if (termWithData.endDate < new Date()) {
      return {
        success: false,
        error: "Cannot delete a term that has already ended — it is part of the school's record.",
      };
    }

    // Money first, and named individually, because "cannot delete term with existing data"
    // tells whoever hit it nothing about what they nearly destroyed.
    const financial = {
      payments: termWithData._count.payments,
      "fee charges": termWithData._count.studentCharges,
      "fee schedules": termWithData._count.feeSchedules,
      expenses: termWithData._count.expenses,
    };
    const held = Object.entries(financial).filter(([, count]) => count > 0);
    if (held.length > 0) {
      return {
        success: false,
        error:
          `Cannot delete this term: it holds ${held.map(([name, count]) => `${count} ${name}`).join(", ")}. `
          + "Deleting it would remove them from the school's financial records.",
      };
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

    // Reopening a term that has already ended is a real operation — a school that closed a
    // term early, or needs to correct released results, has to be able to do it. But it
    // rewrites which term every score entry, fee charge and promotion is filed against, so
    // it is a platform-level decision rather than one a school admin makes on their own.
    //
    // The rule itself lives in lib/term-rules.ts, which is also what the term tables and the
    // term form read, so there is one definition rather than four that drift. The term name
    // is added here because only this side knows it.
    const currentVerdict = canSetTermCurrent(targetTerm, actor.role);
    if (!currentVerdict.allowed) {
      return { success: false, error: `${targetTerm.name}: ${currentVerdict.reason}` };
    }

    await prisma.$transaction(async (tx) => {
      // A school has one current session and one current term inside it.
      await tx.session.updateMany({
        where: { schoolId: targetTerm.session.schoolId, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.session.update({ where: { id: sessionId }, data: { isCurrent: true } });
      await tx.term.updateMany({
        where: {
          session: { schoolId: targetTerm.session.schoolId },
          isCurrent: true,
        },
        data: { isCurrent: false },
      });

      // Set the selected term as current
      await tx.term.update({
        where: { id: termId },
        data: { isCurrent: true },
      });
      await tx.schoolAcademicPeriod.upsert({
        where: { schoolId: targetTerm.session.schoolId },
        create: {
          schoolId: targetTerm.session.schoolId,
          sessionId,
          termId,
          updatedBy: actor.userId,
        },
        update: { sessionId, termId, updatedBy: actor.userId },
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
