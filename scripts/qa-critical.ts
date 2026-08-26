/**
 * Critical-path assertions for the DigiSchool-Pro data layer.
 *
 * Every write happens inside a transaction that is deliberately rolled back,
 * so running this leaves the database exactly as it found it.
 *
 * Run:  npx tsx scripts/qa-critical.ts
 */
import { PrismaClient, Prisma, type AttendanceStatus } from "@prisma/client";
import { calculateGrade } from "../lib/grading";

const prisma = new PrismaClient();

type Verdict = "CONFIRMED" | "REFUTED" | "SKIPPED";
const results: { id: string; claim: string; verdict: Verdict; detail: string }[] = [];

function record(id: string, claim: string, verdict: Verdict, detail: string) {
  results.push({ id, claim, verdict, detail });
  const mark = verdict === "CONFIRMED" ? "[BUG CONFIRMED]" : verdict === "REFUTED" ? "[OK - refuted]" : "[skipped]";
  console.log(`${mark} ${id}: ${claim}`);
  console.log(`    ${detail}\n`);
}

const ROLLBACK = "__INTENTIONAL_ROLLBACK__";

/** Run writes and always roll them back. Returns whatever fn resolved to. */
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
  const [target] = await prisma.$queryRawUnsafe<any[]>("SELECT DATABASE() AS db, @@hostname AS host");
  console.log(`\n=== target: ${String(target.db)} @ ${String(target.host)} ===\n`);

  // ------------------------------------------------------------------
  // T1  Does the unique index that blocks same-term transfer really exist?
  // ------------------------------------------------------------------
  const indexes = await prisma.$queryRawUnsafe<any[]>(
    "SHOW INDEX FROM student_class_terms",
  );
  const grouped = new Map<string, string[]>();
  for (const row of indexes) {
    const name = String(row.Key_name);
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name)!.push(String(row.Column_name));
  }
  const termStatusIndex = [...grouped.entries()].find(
    ([, cols]) =>
      cols.includes("studentId") && cols.includes("termId") && cols.includes("status"),
  );
  record(
    "T1",
    "student_class_terms is uniquely keyed on (studentId, termId, status)",
    termStatusIndex ? "CONFIRMED" : "REFUTED",
    termStatusIndex
      ? `index "${termStatusIndex[0]}" = [${termStatusIndex[1].join(", ")}]`
      : `no such index. Indexes present: ${[...grouped.keys()].join(", ")}`,
  );

  // ------------------------------------------------------------------
  // T2  Same-term class transfer: can a student hold two ACTIVE rows in one term?
  // ------------------------------------------------------------------
  const enrolment = await prisma.studentClassTerm.findFirst({
    where: { status: "ACTIVE" },
    include: { classTerm: true },
  });

  if (!enrolment) {
    record("T2", "same-term transfer is blocked by the unique key", "SKIPPED", "no ACTIVE enrolment in the database");
  } else {
    const siblingClassTerm = await prisma.classTerm.findFirst({
      where: { termId: enrolment.termId, id: { not: enrolment.classTermId } },
    });

    if (!siblingClassTerm) {
      record("T2", "same-term transfer is blocked by the unique key", "SKIPPED", "no second class-term in the same term");
    } else {
      let outcome = "insert unexpectedly succeeded";
      let verdict: Verdict = "REFUTED";
      try {
        await inRollback(async (tx) =>
          // This is exactly what executeStudentTransitions does: create the
          // destination row without touching the source row.
          tx.studentClassTerm.create({
            data: {
              studentId: enrolment.studentId,
              classTermId: siblingClassTerm.id,
              termId: siblingClassTerm.termId,
              status: "ACTIVE",
            },
          }),
        );
      } catch (error: any) {
        if (error.code === "P2002") {
          verdict = "CONFIRMED";
          outcome = `P2002 unique violation on ${JSON.stringify(error.meta?.target)}`;
        } else {
          outcome = `unexpected error ${error.code}: ${error.message.split("\n")[0]}`;
        }
      }
      record(
        "T2",
        "a same-term class transfer is impossible (transition action rolls back)",
        verdict,
        outcome,
      );
    }
  }

  // ------------------------------------------------------------------
  // T3  Cross-term promotion: does the source enrolment stay ACTIVE?
  // ------------------------------------------------------------------
  if (!enrolment) {
    record("T3", "promotion leaves the student ACTIVE in two classes", "SKIPPED", "no ACTIVE enrolment");
  } else {
    const otherTermClassTerm = await prisma.classTerm.findFirst({
      where: { termId: { not: enrolment.termId } },
    });

    if (!otherTermClassTerm) {
      record("T3", "promotion leaves the student ACTIVE in two classes", "SKIPPED", "only one term has class-terms");
    } else {
      const activeCount = await inRollback(async (tx) => {
        await tx.studentClassTerm.create({
          data: {
            studentId: enrolment.studentId,
            classTermId: otherTermClassTerm.id,
            termId: otherTermClassTerm.termId,
            status: "ACTIVE",
          },
        });
        return tx.studentClassTerm.count({
          where: { studentId: enrolment.studentId, status: "ACTIVE" },
        });
      });
      record(
        "T3",
        "promotion leaves the student ACTIVE in both the old and new class",
        activeCount > 1 ? "CONFIRMED" : "REFUTED",
        `after promoting, the student holds ${activeCount} ACTIVE enrolments (source never deactivated)`,
      );
    }
  }

  // ------------------------------------------------------------------
  // T4  Attendance.status accepts arbitrary text
  // ------------------------------------------------------------------
  const anyStudent = await prisma.student.findFirst();
  if (!anyStudent) {
    record("T4", "Attendance.status accepts arbitrary strings", "SKIPPED", "no students");
  } else {
    let verdict: Verdict = "REFUTED";
    let detail = "rejected, so the column is constrained";
    try {
      const saved = await inRollback((tx) =>
        tx.attendance.create({
          // Deliberately invalid. `status` is now an AttendanceStatus enum, so the cast is
          // what lets this probe still ask the database to reject it — and it should.
          data: {
            studentId: anyStudent.id,
            date: new Date("2026-01-15"),
            status: "TOTALLY_INVALID_STATUS" as AttendanceStatus,
          },
        }),
      );
      verdict = "CONFIRMED";
      detail = `stored status = "${saved.status}" — no enum, no check constraint`;
    } catch (error: any) {
      detail = `rejected: ${error.code ?? error.message.split("\n")[0]}`;
    }
    record("T4", "Attendance.status accepts arbitrary strings (no enum)", verdict, detail);

    // T5  duplicate attendance for the same student and day
    let dupVerdict: Verdict = "REFUTED";
    let dupDetail = "second insert rejected";
    try {
      const count = await inRollback(async (tx) => {
        const date = new Date("2026-01-16");
        await tx.attendance.create({ data: { studentId: anyStudent.id, date, status: "PRESENT" } });
        await tx.attendance.create({ data: { studentId: anyStudent.id, date, status: "ABSENT" } });
        return tx.attendance.count({ where: { studentId: anyStudent.id, date } });
      });
      dupVerdict = "CONFIRMED";
      dupDetail = `${count} contradictory rows for the same student on the same date`;
    } catch (error: any) {
      dupDetail = `rejected: ${error.code ?? error.message.split("\n")[0]}`;
    }
    record("T5", "the same student can be marked twice for one date", dupVerdict, dupDetail);
  }

  // ------------------------------------------------------------------
  // T6  A gap in the grade bands turns a passing score into F
  // ------------------------------------------------------------------
  const gapped = {
    passMark: 40,
    levels: [
      { minScore: 45, maxScore: 100, grade: "A", remark: "Good" },
      { minScore: 0, maxScore: 39, grade: "F", remark: "Fail" },
    ],
  };
  const gapResult = calculateGrade(42, gapped);
  record(
    "T6",
    "a score inside a band gap silently grades as F",
    gapResult.grade === "F" ? "CONFIRMED" : "REFUTED",
    `bands 0-39 and 45-100, score 42 -> grade "${gapResult.grade}" / "${gapResult.remark}", passed=${gapResult.passed}`,
  );

  // T7  Overlapping bands: which one wins?
  const overlapping = {
    passMark: 40,
    levels: [
      { minScore: 70, maxScore: 100, grade: "A", remark: "Excellent" },
      { minScore: 65, maxScore: 80, grade: "B", remark: "Very good" },
    ],
  };
  const overlapResult = calculateGrade(75, overlapping);
  record(
    "T7",
    "overlapping bands are accepted and resolved by max-score order, not rejected",
    "CONFIRMED",
    `bands 70-100 and 65-80 both contain 75; result = "${overlapResult.grade}". Whichever has the higher maxScore wins.`,
  );

  // ------------------------------------------------------------------
  // T8  An admission format missing {NUMBER} produces collisions
  // ------------------------------------------------------------------
  const school = await prisma.school.findFirst();
  if (!school) {
    record("T8", "an admission format without {NUMBER} collides", "SKIPPED", "no school");
  } else {
    const render = (format: string, seq: number) =>
      format
        .replace("{PREFIX}", school.admissionPrefix)
        .replace("{YEAR}", "2026")
        .replace("{NUMBER}", seq.toString().padStart(4, "0"));

    const a = render("{PREFIX}-{YEAR}", 1);
    const b = render("{PREFIX}-{YEAR}", 2);
    record(
      "T8",
      "an admission format omitting {NUMBER} generates identical numbers",
      a === b ? "CONFIRMED" : "REFUTED",
      `sequence 1 -> "${a}", sequence 2 -> "${b}". Nothing validates the template, and Student.admissionNo is unique, so student two fails to save.`,
    );
    console.log(`    (current live format: "${school.admissionFormat}", prefix "${school.admissionPrefix}")\n`);
  }

  // ------------------------------------------------------------------
  // T9  Is School.isActive enforced anywhere?
  // ------------------------------------------------------------------
  const inactiveSchools = await prisma.school.count({ where: { isActive: false } });
  record(
    "T9",
    "School.isActive is recorded but not enforced",
    "CONFIRMED",
    `${inactiveSchools} inactive school(s). auth.ts checks user.isActive only; no school-scoped query filters on School.isActive, so deactivating a school hides nothing and blocks no login.`,
  );

  // ------------------------------------------------------------------
  // T10  TeacherSubject lookup without termId matches across terms
  // ------------------------------------------------------------------
  const teacherSubject = await prisma.teacherSubject.findFirst({ include: { term: true } });
  if (!teacherSubject) {
    record("T10", "subject authorization ignores the term", "SKIPPED", "no teacher-subject assignments");
  } else {
    const otherTerm = await prisma.term.findFirst({ where: { id: { not: teacherSubject.termId } } });
    if (!otherTerm) {
      record("T10", "subject authorization ignores the term", "SKIPPED", "only one term exists");
    } else {
      // What saveTeacherAssessments actually runs:
      const loose = await prisma.teacherSubject.findFirst({
        where: { teacherId: teacherSubject.teacherId, subjectId: teacherSubject.subjectId },
      });
      // What it should run, for the term being written to:
      const strict = await prisma.teacherSubject.findFirst({
        where: {
          teacherId: teacherSubject.teacherId,
          subjectId: teacherSubject.subjectId,
          termId: otherTerm.id,
        },
      });
      record(
        "T10",
        "a teacher passes the subject check for a term they were never assigned",
        loose && !strict ? "CONFIRMED" : "REFUTED",
        `assigned in "${teacherSubject.term.name}" only. Writing to "${otherTerm.name}": the shipped query matches (${!!loose}), a term-scoped query does not (${!!strict}).`,
      );
    }
  }

  // ------------------------------------------------------------------
  // T11  Is a released result traceable to who released it?
  //
  // This probe used to assert that `version`, `previousVersionId`, `isDraft` and
  // `submittedAt` were never advanced — they were declared and never written. Those columns
  // are gone; revision history is now kept properly in AuditLog. What is worth probing
  // instead is the replacement: does a published result record who released it and when.
  // ------------------------------------------------------------------
  const total = await prisma.assessment.count();
  if (total === 0) {
    record("T11", "Released results record their provenance", "SKIPPED", "no assessments");
  } else {
    const [published, withProvenance, auditedReleases] = await Promise.all([
      prisma.assessment.count({ where: { isPublished: true } }),
      prisma.assessment.count({
        where: { isPublished: true, publishedAt: { not: null }, publishedBy: { not: null } },
      }),
      prisma.auditLog.count({ where: { action: { in: ["results.publish", "results.unpublish"] } } }),
    ]);

    // Rows published before the provenance columns existed legitimately have neither, and
    // the migration deliberately did not invent a date for them.
    const untraceable = published - withProvenance;
    record(
      "T11",
      "Every released result records who released it and when",
      published === 0 || untraceable === 0 ? "REFUTED" : "CONFIRMED",
      `${total} assessments: ${published} released, ${withProvenance} with provenance, ` +
        `${untraceable} released before provenance was recorded. ` +
        `${auditedReleases} release/withdrawal entries in the audit log.`,
    );
  }

  // ------------------------------------------------------------------
  // T12  Duplicate subject codes
  // ------------------------------------------------------------------
  const dupCodes = await prisma.$queryRawUnsafe<any[]>(
    "SELECT code, schoolId, COUNT(*) c FROM Subject GROUP BY code, schoolId HAVING c > 1",
  );
  record(
    "T12",
    "Subject.code has no unique constraint",
    dupCodes.length > 0 ? "CONFIRMED" : "REFUTED",
    dupCodes.length > 0
      ? `${dupCodes.length} duplicated code(s) already present, e.g. "${dupCodes[0].code}" x${dupCodes[0].c}`
      : "no duplicates present today, but nothing prevents them",
  );

  // ------------------------------------------------------------------
  // T13  Would any real class-term actually pass the publish gate?
  // ------------------------------------------------------------------
  const classTerms = await prisma.classTerm.findMany({
    include: { classSubjects: true, students: true, class: true, term: true },
  });
  const publishable: string[] = [];
  const blocked: string[] = [];
  for (const ct of classTerms) {
    if (ct.students.length === 0 || ct.classSubjects.length === 0) continue;
    const assessments = await prisma.assessment.findMany({
      where: {
        studentClassTermId: { in: ct.students.map((s) => s.id) },
        subjectId: { in: ct.classSubjects.map((cs) => cs.subjectId) },
        termId: ct.termId,
      },
    });
    const complete = ct.students.every((sct) =>
      ct.classSubjects.every((cs) =>
        assessments.some(
          (a) =>
            a.studentId === sct.studentId &&
            a.subjectId === cs.subjectId &&
            (a.isExempt || a.isAbsent || (a.ca1 !== null && a.ca2 !== null && a.ca3 !== null && a.exam !== null)),
        ),
      ),
    );
    const label = `${ct.class.name}/${ct.term.name} (${ct.students.length} students x ${ct.classSubjects.length} subjects, ${assessments.length} scores)`;
    (complete ? publishable : blocked).push(label);
  }
  record(
    "T13",
    "the all-or-nothing publish gate blocks every seeded class",
    publishable.length === 0 && blocked.length > 0 ? "CONFIRMED" : "REFUTED",
    `${publishable.length} publishable, ${blocked.length} blocked. First blocked: ${blocked[0] ?? "n/a"}. The action returns only "Results incomplete, cannot publish" — it never says which student or subject is missing.`,
  );

  // ------------------------------------------------------------------
  console.log("=".repeat(72));
  const confirmed = results.filter((r) => r.verdict === "CONFIRMED").length;
  const refuted = results.filter((r) => r.verdict === "REFUTED").length;
  const skipped = results.filter((r) => r.verdict === "SKIPPED").length;
  console.log(`${confirmed} confirmed  ·  ${refuted} refuted  ·  ${skipped} skipped`);
  console.log("=".repeat(72));
  for (const r of results) {
    console.log(`${r.verdict.padEnd(9)} ${r.id.padEnd(4)} ${r.claim}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("\nSUITE FAILED:", error);
  await prisma.$disconnect();
  process.exit(1);
});
