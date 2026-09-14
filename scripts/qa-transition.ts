/**
 * Reproduces what executeStudentTransitions does on a promotion, and measures
 * the state it leaves behind. All writes roll back.
 *
 * Run:  npx tsx scripts/qa-transition.ts
 */
import { Prisma } from "@prisma/client";
import { createPrismaClient } from "../lib/prisma-client";

const prisma = createPrismaClient();
const ROLLBACK = "__INTENTIONAL_ROLLBACK__";

async function inRollback<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let captured!: T;
  try {
    await prisma.$transaction(async (tx) => {
      captured = await fn(tx);
      throw new Error(ROLLBACK);
    });
  } catch (error: any) {
    if (error.message !== ROLLBACK) throw error;
  }
  return captured;
}

async function main() {
  const source = await prisma.studentClassTerm.findFirst({
    where: { status: "ACTIVE" },
    include: {
      classTerm: { include: { class: true, term: true } },
      student: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!source) throw new Error("no ACTIVE enrolment to promote");

  const targetTerm = await prisma.term.findFirst({ where: { id: { not: source.termId } } });
  if (!targetTerm) throw new Error("only one term exists");

  const nextClass = await prisma.class.findFirst({
    where: { schoolId: source.student.schoolId, id: { not: source.classTerm.classId } },
  });
  if (!nextClass) throw new Error("no second class to promote into");

  const who = `${source.student.user.firstName} ${source.student.user.lastName}`;
  console.log(`\nPromoting ${who}`);
  console.log(`  from ${source.classTerm.class.name} / ${source.classTerm.term.name}`);
  console.log(`  into ${nextClass.name} / ${targetTerm.name}\n`);

  const outcome = await inRollback(async (tx) => {
    // Precondition the admin would have satisfied in step 2.6.
    const destination = await tx.classTerm.create({
      data: { classId: nextClass.id, termId: targetTerm.id },
    });

    // ---- exactly what executeStudentTransitions writes ----
    await tx.studentClassTerm.create({
      data: {
        studentId: source.studentId,
        classTermId: destination.id,
        termId: destination.termId,
        // note: no `status`, so it defaults to ACTIVE
      },
    });
    await tx.studentTransition.create({
      data: {
        studentId: source.studentId,
        fromClassTermId: source.classTermId,
        toClassTermId: destination.id,
        transitionType: "PROMOTION",
        createdBy: (await tx.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } })).id,
      },
    });
    // ---- end of what the action writes ----

    const enrolments = await tx.studentClassTerm.findMany({
      where: { studentId: source.studentId },
      include: { classTerm: { include: { class: true, term: true } } },
      orderBy: { createdAt: "asc" },
    });
    const history = await tx.studentEnrollmentHistory.count({
      where: { studentId: source.studentId },
    });
    const sourceStillActive = await tx.studentClassTerm.findUnique({
      where: { id: source.id },
      select: { status: true },
    });

    // Would the old class still list this student on its roster?
    const oldRoster = await tx.studentClassTerm.count({
      where: { classTermId: source.classTermId, status: "ACTIVE" },
    });

    return { enrolments, history, sourceStillActive, oldRoster };
  });

  console.log("Enrolments held by this student after the promotion:");
  for (const e of outcome.enrolments) {
    console.log(`  - ${e.classTerm.class.name} / ${e.classTerm.term.name}  status=${e.status}`);
  }

  const active = outcome.enrolments.filter((e) => e.status === "ACTIVE").length;
  console.log(`\n  ACTIVE enrolments:            ${active}`);
  console.log(`  source row status after:      ${outcome.sourceStillActive?.status}`);
  console.log(`  StudentEnrollmentHistory rows: ${outcome.history}`);
  console.log(`  old class roster headcount:    ${outcome.oldRoster}`);

  console.log("\n---");
  console.log(active > 1
    ? `CONFIRMED: the student is ACTIVE in ${active} classes at once. The source enrolment is never closed, so the old roster still counts them.`
    : "REFUTED: only one active enrolment remains.");
  console.log(outcome.history === 0
    ? "CONFIRMED: no StudentEnrollmentHistory row written, despite EnrollmentAction.PROMOTED existing for exactly this."
    : `REFUTED: ${outcome.history} history row(s) written.`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("FAILED:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});
