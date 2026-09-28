-- Historical result policies, append-only accounting reversals, a single current-period
-- pointer, and persisted integrity reports.

ALTER TABLE `DataIntegrityCheck` DROP FOREIGN KEY `DataIntegrityCheck_runBy_fkey`;
ALTER TABLE `StudentEnrollmentHistory` DROP FOREIGN KEY `StudentEnrollmentHistory_studentId_fkey`;
ALTER TABLE `StudentEnrollmentHistory` DROP FOREIGN KEY `StudentEnrollmentHistory_classTermId_fkey`;
ALTER TABLE `StudentEnrollmentHistory` DROP FOREIGN KEY `StudentEnrollmentHistory_termId_fkey`;
DROP INDEX `DataIntegrityCheck_checkType_status_idx` ON `DataIntegrityCheck`;
DROP INDEX `DataIntegrityCheck_runBy_fkey` ON `DataIntegrityCheck`;

ALTER TABLE `ClassTermResultWorkflow`
  ADD COLUMN `assessmentSchemeSnapshot` JSON NULL,
  ADD COLUMN `gradingSnapshot` JSON NULL,
  ADD COLUMN `snapshotCapturedAt` DATETIME(3) NULL;

ALTER TABLE `DataIntegrityCheck`
  ADD COLUMN `completedAt` DATETIME(3) NULL,
  ADD COLUMN `results` JSON NULL,
  ADD COLUMN `schoolId` VARCHAR(191) NULL;

ALTER TABLE `Expense`
  MODIFY `status` ENUM('DRAFT','PENDING_APPROVAL','APPROVED','PAID','REJECTED','CANCELLED','REVERSED') NOT NULL DEFAULT 'PENDING_APPROVAL';
ALTER TABLE `PayrollItem`
  MODIFY `status` ENUM('PENDING','PAID','EXCLUDED','REVERSED') NOT NULL DEFAULT 'PENDING';
ALTER TABLE `PayrollRun`
  MODIFY `status` ENUM('DRAFT','PENDING_APPROVAL','APPROVED','PAID','CANCELLED','REVERSED') NOT NULL DEFAULT 'DRAFT';

CREATE TABLE `SchoolAcademicPeriod` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `termId` VARCHAR(191) NOT NULL,
  `updatedBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SchoolAcademicPeriod_schoolId_key`(`schoolId`),
  INDEX `SchoolAcademicPeriod_sessionId_idx`(`sessionId`),
  INDEX `SchoolAcademicPeriod_termId_idx`(`termId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AccountingReversal` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `targetType` ENUM('PAYMENT','EXPENSE','PAYROLL') NOT NULL,
  `paymentId` VARCHAR(191) NULL,
  `expenseId` VARCHAR(191) NULL,
  `payrollRunId` VARCHAR(191) NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `referenceNo` VARCHAR(191) NULL,
  `reversedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AccountingReversal_paymentId_key`(`paymentId`),
  UNIQUE INDEX `AccountingReversal_expenseId_key`(`expenseId`),
  UNIQUE INDEX `AccountingReversal_payrollRunId_key`(`payrollRunId`),
  INDEX `AccountingReversal_schoolId_reversedAt_idx`(`schoolId`,`reversedAt`),
  INDEX `AccountingReversal_targetType_reversedAt_idx`(`targetType`,`reversedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `DataIntegrityCheck_schoolId_checkType_status_idx`
  ON `DataIntegrityCheck`(`schoolId`,`checkType`,`status`);

ALTER TABLE `SchoolAcademicPeriod` ADD CONSTRAINT `SchoolAcademicPeriod_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SchoolAcademicPeriod` ADD CONSTRAINT `SchoolAcademicPeriod_sessionId_fkey`
  FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SchoolAcademicPeriod` ADD CONSTRAINT `SchoolAcademicPeriod_termId_fkey`
  FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DataIntegrityCheck` ADD CONSTRAINT `DataIntegrityCheck_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DataIntegrityCheck` ADD CONSTRAINT `DataIntegrityCheck_runBy_fkey`
  FOREIGN KEY (`runBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentEnrollmentHistory` ADD CONSTRAINT `StudentEnrollmentHistory_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentEnrollmentHistory` ADD CONSTRAINT `StudentEnrollmentHistory_classTermId_fkey`
  FOREIGN KEY (`classTermId`) REFERENCES `ClassTerm`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentEnrollmentHistory` ADD CONSTRAINT `StudentEnrollmentHistory_termId_fkey`
  FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AccountingReversal` ADD CONSTRAINT `AccountingReversal_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AccountingReversal` ADD CONSTRAINT `AccountingReversal_paymentId_fkey`
  FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AccountingReversal` ADD CONSTRAINT `AccountingReversal_expenseId_fkey`
  FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AccountingReversal` ADD CONSTRAINT `AccountingReversal_payrollRunId_fkey`
  FOREIGN KEY (`payrollRunId`) REFERENCES `PayrollRun`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AccountingReversal` ADD CONSTRAINT `AccountingReversal_createdBy_fkey`
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill the singleton pointer for schools whose legacy flags are already consistent.
INSERT INTO `SchoolAcademicPeriod`
  (`id`,`schoolId`,`sessionId`,`termId`,`updatedBy`,`createdAt`,`updatedAt`)
SELECT UUID(), s.`schoolId`, s.`id`, t.`id`, 'migration', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `Session` s
JOIN `Term` t ON t.`sessionId` = s.`id` AND t.`isCurrent` = TRUE
WHERE s.`isCurrent` = TRUE
ON DUPLICATE KEY UPDATE
  `sessionId` = VALUES(`sessionId`),
  `termId` = VALUES(`termId`),
  `updatedAt` = CURRENT_TIMESTAMP(3);
