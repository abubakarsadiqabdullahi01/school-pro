-- Affective and psychomotor trait ratings for the report sheet.
--
-- Both domains were already printed on the report card with hardcoded traits and
-- a dash where every rating belongs. This is where the real ratings live: one row
-- per student, per term, per trait, rated 1 to 5 by the class teacher.

CREATE TABLE `StudentTraitRating` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `termId` VARCHAR(191) NOT NULL,
  `classTermId` VARCHAR(191) NOT NULL,
  `domain` ENUM('AFFECTIVE', 'PSYCHOMOTOR') NOT NULL,
  `trait` VARCHAR(191) NOT NULL,
  `rating` INTEGER NOT NULL,
  `recordedBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  -- One rating per trait per term. Without this, re-entering a trait adds a
  -- second row and the report sheet has two values for one trait.
  UNIQUE INDEX `StudentTraitRating_studentId_termId_trait_key`(`studentId`, `termId`, `trait`),
  INDEX `StudentTraitRating_classTermId_termId_idx`(`classTermId`, `termId`),
  INDEX `StudentTraitRating_schoolId_termId_idx`(`schoolId`, `termId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StudentTraitRating`
  ADD CONSTRAINT `StudentTraitRating_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `StudentTraitRating`
  ADD CONSTRAINT `StudentTraitRating_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `StudentTraitRating`
  ADD CONSTRAINT `StudentTraitRating_termId_fkey`
  FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `StudentTraitRating`
  ADD CONSTRAINT `StudentTraitRating_classTermId_fkey`
  FOREIGN KEY (`classTermId`) REFERENCES `ClassTerm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- No cascade on the recorder: deleting a staff account must not delete the
-- ratings they entered, and a report sheet that silently loses its psychomotor
-- column because somebody left the school is worse than a dangling reference.
ALTER TABLE `StudentTraitRating`
  ADD CONSTRAINT `StudentTraitRating_recordedBy_fkey`
  FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
