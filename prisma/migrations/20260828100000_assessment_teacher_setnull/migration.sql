-- `assessments.teacherId` records who entered a score. It is an attribute of the score, not
-- its owner: the mark belongs to the student, and the column is already nullable to say so.
--
-- The constraint was ON DELETE CASCADE, which made the database treat the teacher as the
-- parent. Deleting one teacher deleted every score they had ever entered, for every student,
-- subject and term. It also silently unblocked the delete: `createdBy` and `editedBy` are
-- RESTRICT, so the cascade removed the very rows that should have refused the deletion.
ALTER TABLE `assessments` DROP FOREIGN KEY `assessments_teacherId_fkey`;

ALTER TABLE `assessments` ADD CONSTRAINT `assessments_teacherId_fkey`
  FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
