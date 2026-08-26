-- CreateIndex
CREATE INDEX "TeacherClassTerm_teacherId_idx" ON "public"."TeacherClassTerm"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherClassTerm_classTermId_idx" ON "public"."TeacherClassTerm"("classTermId");

-- CreateIndex
CREATE INDEX "TeacherSubject_teacherId_termId_idx" ON "public"."TeacherSubject"("teacherId", "termId");
