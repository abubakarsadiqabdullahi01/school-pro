// Read-only inventory of the target database.
// Run:  npx tsx scripts/qa-probe.ts
import { createPrismaClient } from "../lib/prisma-client";

const prisma = createPrismaClient();

(async () => {
  const [target] = await prisma.$queryRawUnsafe<any[]>(
    "SELECT @@hostname AS host, DATABASE() AS db, @@port AS port",
  );
  console.log("TARGET:", String(target.host), String(target.db), "port", String(target.port));

  console.log({
    schools: await prisma.school.count(),
    sessions: await prisma.session.count(),
    terms: await prisma.term.count(),
    classes: await prisma.class.count(),
    subjects: await prisma.subject.count(),
    classTerms: await prisma.classTerm.count(),
    classSubjects: await prisma.classSubject.count(),
    teachers: await prisma.teacher.count(),
    students: await prisma.student.count(),
    parents: await prisma.parent.count(),
    studentClassTerms: await prisma.studentClassTerm.count(),
    assessments: await prisma.assessment.count(),
    transitions: await prisma.studentTransition.count(),
    enrollmentHistory: await prisma.studentEnrollmentHistory.count(),
    attendance: await prisma.attendance.count(),
    gradingSystems: await prisma.gradingSystem.count(),
    users: await prisma.user.count(),
    credentials: await prisma.credential.count(),
  });

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error("FAILED:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});
