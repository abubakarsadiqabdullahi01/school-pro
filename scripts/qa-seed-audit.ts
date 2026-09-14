/**
 * Audits the consequences of prisma/seed-demo-data.ts against the seeded data.
 * Read-only.
 *
 * Run:  npx tsx scripts/qa-seed-audit.ts
 */
import { ClassLevel } from "@prisma/client";
import { createPrismaClient } from "../lib/prisma-client";

const prisma = createPrismaClient();

const SUBJECTS_BY_LEVEL: Record<string, string[]> = {
  PRIMARY: [
    "English Studies", "Mathematics", "Basic Science", "Basic Technology",
    "Social Studies", "Cultural & Creative Arts", "Christian Religious Studies",
    "Islamic Religious Studies", "Hausa Language", "Yoruba Language", "Igbo Language",
    "French Language", "Physical & Health Education", "Computer Studies",
  ],
  JSS: [
    "English Language", "Mathematics", "Basic Science", "Basic Technology",
    "Social Studies", "Business Studies", "French Language", "Nigerian Languages",
    "Christian Religious Studies", "Islamic Religious Studies", "Cultural & Creative Arts",
    "Physical & Health Education", "Computer Studies", "Agricultural Science", "Home Economics",
  ],
  SSS: [
    "English Language", "Mathematics", "Biology", "Chemistry", "Physics",
    "Further Mathematics", "Agricultural Science", "Economics", "Commerce",
    "Accounting", "Government", "Geography", "Literature in English",
    "Christian Religious Studies", "Islamic Religious Studies", "Hausa Language",
    "Yoruba Language", "Igbo Language", "French Language", "Technical Drawing",
    "Food and Nutrition", "Computer Studies", "Physical Education",
  ],
};

function line(label: string, value: string) {
  console.log(`  ${label.padEnd(38)} ${value}`);
}

async function main() {
  console.log("\n=== 1. Subject duplication ===\n");
  const names = Object.values(SUBJECTS_BY_LEVEL).flat();
  const nameCounts = new Map<string, number>();
  for (const n of names) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  const repeated = [...nameCounts.entries()].filter(([, c]) => c > 1);
  line("subject names declared", String(names.length));
  line("distinct names", String(nameCounts.size));
  line("names appearing at >1 level", String(repeated.length));

  const rows = await prisma.subject.groupBy({
    by: ["name"],
    _count: { _all: true },
    orderBy: { _count: { name: "desc" } },
  });
  const dupRows = rows.filter((r) => r._count._all > 1);
  line("Subject rows in database", String(await prisma.subject.count()));
  line("names duplicated in database", String(dupRows.length));
  console.log(`\n  worst offenders: ${dupRows.slice(0, 5).map((r) => `${r.name} x${r._count._all}`).join(", ")}`);

  const codeRows = await prisma.$queryRawUnsafe<any[]>(
    "SELECT code, COUNT(*) c, GROUP_CONCAT(DISTINCT name ORDER BY name SEPARATOR ' | ') names FROM Subject GROUP BY code HAVING c > 1 ORDER BY c DESC",
  );
  console.log(`\n  duplicated CODES: ${codeRows.length}`);
  for (const r of codeRows.slice(0, 6)) {
    console.log(`    ${String(r.code).padEnd(6)} x${r.c}  ->  ${r.names}`);
  }

  console.log("\n=== 2. getSubjectLevel(): first-match-wins misassignment ===\n");
  // The seed resolves a subject's level by testing PRIMARY, then JSS, else SSS.
  // Any name that appears at more than one level collapses to the earliest.
  const misassigned = repeated.map((r) => r[0]);
  line("names that collapse to one level", String(misassigned.length));
  console.log(`    e.g. ${misassigned.slice(0, 8).join(", ")}`);

  for (const level of ["PRIMARY", "JSS", "SSS"] as ClassLevel[]) {
    const classesAtLevel = await prisma.class.findMany({
      where: { level },
      include: { classTerms: { include: { classSubjects: { include: { subject: true } } } } },
    });
    const subjectNames = new Set<string>();
    for (const c of classesAtLevel) {
      for (const ct of c.classTerms) {
        for (const cs of ct.classSubjects) subjectNames.add(cs.subject.name);
      }
    }
    const hasMaths = subjectNames.has("Mathematics");
    const hasEnglish = [...subjectNames].some((n) => n.startsWith("English"));
    console.log(`  ${String(level).padEnd(8)} ${classesAtLevel.length} classes | ${subjectNames.size} distinct subjects | Mathematics: ${hasMaths ? "YES" : "NO"} | English: ${hasEnglish ? "YES" : "NO"}`);
    console.log(`           ${[...subjectNames].join(", ") || "(none)"}`);
  }

  console.log("\n=== 3. Term coverage ===\n");
  const terms = await prisma.term.findMany({ include: { classTerms: true } });
  for (const t of terms) {
    line(`${t.name}${t.isCurrent ? " (current)" : ""}`, `${t.classTerms.length} class-terms`);
  }

  console.log("\n=== 4. Teacher assignments vs what they can actually mark ===\n");
  const teachers = await prisma.teacher.findMany({
    include: {
      teacherSubjects: { include: { subject: true } },
      teacherClassTerms: {
        include: { classTerm: { include: { class: true, classSubjects: { include: { subject: true } } } } },
      },
      user: { select: { firstName: true, lastName: true } },
    },
  });
  for (const t of teachers) {
    const assignedSubjectIds = new Set(t.teacherSubjects.map((ts) => ts.subjectId));
    const teachableSubjectIds = new Set(
      t.teacherClassTerms.flatMap((tct) => tct.classTerm.classSubjects.map((cs) => cs.subjectId)),
    );
    const overlap = [...assignedSubjectIds].filter((id) => teachableSubjectIds.has(id));
    console.log(
      `  ${(t.user.firstName + " " + t.user.lastName).padEnd(26)} ` +
        `${t.teacherClassTerms.length} class(es), ${assignedSubjectIds.size} subject(s), ` +
        `usable overlap: ${overlap.length}`,
    );
  }
  const deadTeachers = [];
  for (const t of teachers) {
    const a = new Set(t.teacherSubjects.map((ts) => ts.subjectId));
    const b = new Set(t.teacherClassTerms.flatMap((tct) => tct.classTerm.classSubjects.map((cs) => cs.subjectId)));
    if ([...a].filter((id) => b.has(id)).length === 0) deadTeachers.push(t);
  }
  console.log(`\n  teachers with NOTHING to mark: ${deadTeachers.length} of ${teachers.length}`);

  console.log("\n=== 5. Derived fields left empty ===\n");
  const total = await prisma.assessment.count();
  line("assessments", String(total));
  line("with grade computed", String(await prisma.assessment.count({ where: { grade: { not: null } } })));
  line("with remark computed", String(await prisma.assessment.count({ where: { remark: { not: null } } })));
  line("with a null score component", String(
    await prisma.assessment.count({
      where: { OR: [{ ca1: null }, { ca2: null }, { ca3: null }, { exam: null }] },
    }),
  ));
  line("flagged absent or exempt", String(
    await prisma.assessment.count({ where: { OR: [{ isAbsent: true }, { isExempt: true }] } }),
  ));
  line("published", String(await prisma.assessment.count({ where: { isPublished: true } })));

  console.log("\n=== 6. Credential types by role ===\n");
  const creds = await prisma.credential.groupBy({ by: ["type"], _count: { _all: true } });
  for (const c of creds) line(String(c.type), String(c._count._all));
  const studentCreds = await prisma.credential.findMany({
    where: { user: { role: "STUDENT" } },
    select: { type: true, value: true },
    take: 3,
  });
  console.log(`\n  sample student credentials: ${studentCreds.map((c) => `${c.type}=${c.value}`).join(", ")}`);
  console.log("  (the app's createStudent issues REGISTRATION_NUMBER credentials instead)");

  console.log("\n=== 7. Admission numbers ===\n");
  const school = await prisma.school.findFirst();
  const sample = await prisma.student.findMany({ select: { admissionNo: true }, take: 4, orderBy: { admissionNo: "asc" } });
  line("school.admissionFormat", String(school?.admissionFormat));
  line("school.admissionPrefix", String(school?.admissionPrefix));
  line("seeded numbers", sample.map((s) => s.admissionNo).join(", "));
  console.log("  (the seed hardcodes `EXC-${year}-${seq}` and skips the format template + padStart(4))");

  console.log("\n=== 8. Admin permissions shape ===\n");
  const admins = await prisma.admin.findMany({ select: { permissions: true } });
  for (const a of admins) {
    let parsed = "throws";
    try {
      parsed = JSON.stringify(JSON.parse(a.permissions));
    } catch {
      /* keep "throws" */
    }
    line(`stored: ${JSON.stringify(a.permissions)}`, `JSON.parse -> ${parsed}`);
  }
  console.log("  (createAdminUser stores JSON.stringify(array); the seed stores the bare string \"ALL\")");

  console.log("\n=== 9. School logo ===\n");
  line("school.logoUrl", JSON.stringify(school?.logoUrl));
  console.log("  (empty string, not null — <Image src=\"\"> throws, unlike a null guard)");

  console.log("\n=== 10. Modules with zero test data ===\n");
  line("attendance", String(await prisma.attendance.count()));
  line("studentTransition", String(await prisma.studentTransition.count()));
  line("studentEnrollmentHistory", String(await prisma.studentEnrollmentHistory.count()));
  line("payment", String(await prisma.payment.count()));
  line("feeStructure", String(await prisma.feeStructure.count()));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await prisma.$disconnect();
  process.exit(1);
});
