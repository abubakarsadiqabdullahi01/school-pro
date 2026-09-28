-- Preserve the class, academic term and staff member responsible for every new mark.
-- Nullable columns keep historical rows valid; the action always fills them going forward.
ALTER TABLE `Attendance`
  ADD COLUMN `classTermId` VARCHAR(191) NULL,
  ADD COLUMN `termId` VARCHAR(191) NULL,
  ADD COLUMN `markedBy` VARCHAR(191) NULL;

CREATE INDEX `Attendance_classTermId_date_idx` ON `Attendance`(`classTermId`, `date`);
CREATE INDEX `Attendance_termId_date_idx` ON `Attendance`(`termId`, `date`);
CREATE INDEX `Attendance_markedBy_idx` ON `Attendance`(`markedBy`);

ALTER TABLE `Attendance`
  ADD CONSTRAINT `Attendance_classTermId_fkey` FOREIGN KEY (`classTermId`) REFERENCES `ClassTerm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Attendance_termId_fkey` FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Attendance_markedBy_fkey` FOREIGN KEY (`markedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
