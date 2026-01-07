/*
  Warnings:

  - A unique constraint covering the columns `[studentId,subjectId,termId,teacherId]` on the table `assessments` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."assessments_studentId_subjectId_termId_key";

-- CreateIndex
CREATE UNIQUE INDEX "assessments_studentId_subjectId_termId_teacherId_key" ON "public"."assessments"("studentId", "subjectId", "termId", "teacherId");
