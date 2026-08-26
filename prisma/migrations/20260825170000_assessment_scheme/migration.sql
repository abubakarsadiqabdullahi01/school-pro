-- Gate 2 — per-school assessment scheme
--
-- Replaces literals that were compiled into three action files:
-- `validateScore(assessment.ca1, "CA1", 10)` and `validateScore(assessment.exam, "Exam", 70)`.
-- Bounds were enforced server-side, but only ever for that one scheme, so a school on
-- 40/60 or with two CAs could not be onboarded without editing the source.
--
-- Additive and safe to run on a populated database. The backfill at the end gives every
-- existing school a row holding exactly the 10/10/10/70 split their scores were already
-- validated against, so no school's behaviour changes on the day this lands.

-- CreateTable
CREATE TABLE `AssessmentScheme` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT 'Three CAs and an exam',
    `ca1Max` INTEGER NOT NULL DEFAULT 10,
    `ca2Max` INTEGER NOT NULL DEFAULT 10,
    `ca3Max` INTEGER NOT NULL DEFAULT 10,
    `examMax` INTEGER NOT NULL DEFAULT 70,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AssessmentScheme_schoolId_key`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AssessmentScheme` ADD CONSTRAINT `AssessmentScheme_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one scheme per existing school, holding the split that was previously
-- hardcoded. UUID() gives each row its own id; the loader falls back to the same defaults
-- anyway, so a school missed here still behaves identically.
INSERT INTO `AssessmentScheme` (`id`, `schoolId`, `name`, `ca1Max`, `ca2Max`, `ca3Max`, `examMax`, `createdAt`, `updatedAt`)
SELECT UUID(), `s`.`id`, 'Three CAs and an exam', 10, 10, 10, 70, NOW(3), NOW(3)
FROM `School` `s`
WHERE NOT EXISTS (
  SELECT 1 FROM `AssessmentScheme` `a` WHERE `a`.`schoolId` = `s`.`id`
);
