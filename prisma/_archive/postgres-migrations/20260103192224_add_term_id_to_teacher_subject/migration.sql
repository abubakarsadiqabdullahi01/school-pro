/*
  Warnings:

  - A unique constraint covering the columns `[teacherId,subjectId,termId]` on the table `TeacherSubject` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `termId` to the `TeacherSubject` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."TeacherSubject_teacherId_subjectId_key";

-- AlterTable
ALTER TABLE "public"."TeacherSubject" ADD COLUMN     "termId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "TeacherSubject_termId_idx" ON "public"."TeacherSubject"("termId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSubject_teacherId_subjectId_termId_key" ON "public"."TeacherSubject"("teacherId", "subjectId", "termId");

-- CreateIndex
CREATE INDEX "Term_isCurrent_idx" ON "public"."Term"("isCurrent");

-- AddForeignKey
ALTER TABLE "public"."TeacherSubject" ADD CONSTRAINT "TeacherSubject_termId_fkey" FOREIGN KEY ("termId") REFERENCES "public"."Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
