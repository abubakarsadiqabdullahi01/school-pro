-- Finance foundation for DigiSchool-Pro.
--
-- This keeps the legacy FeeStructure/Payment records readable, but adds the
-- ledger pieces needed for complete finance: categories, schedules, student
-- charges, payment allocations, discounts, and exemptions.

-- Add the finance-facing role before any user can be assigned to it.
ALTER TABLE `users`
  MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'TEACHER', 'PARENT', 'STUDENT') NOT NULL DEFAULT 'STUDENT';

-- Extend Payment so one receipt can be allocated across multiple student charges.
ALTER TABLE `Payment` DROP FOREIGN KEY `Payment_feeStructureId_fkey`;

ALTER TABLE `Payment`
  ADD COLUMN `sessionId` VARCHAR(191) NULL,
  ADD COLUMN `referenceNo` VARCHAR(191) NULL,
  ADD COLUMN `receivedBy` VARCHAR(191) NULL,
  ADD COLUMN `notes` TEXT NULL,
  MODIFY `feeStructureId` VARCHAR(191) NULL;

UPDATE `Payment` `p`
  JOIN `Term` `t` ON `t`.`id` = `p`.`termId`
SET `p`.`sessionId` = `t`.`sessionId`
WHERE `p`.`sessionId` IS NULL;

CREATE INDEX `Payment_sessionId_status_idx` ON `Payment`(`sessionId`, `status`);
CREATE INDEX `Payment_receivedBy_idx` ON `Payment`(`receivedBy`);

ALTER TABLE `Payment` ADD CONSTRAINT `Payment_feeStructureId_fkey`
  FOREIGN KEY (`feeStructureId`) REFERENCES `FeeStructure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_sessionId_fkey`
  FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_receivedBy_fkey`
  FOREIGN KEY (`receivedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `FeeCategory` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `type` ENUM('MANDATORY', 'OPTIONAL', 'REGISTRATION', 'SERVICE') NOT NULL DEFAULT 'MANDATORY',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FeeCategory_schoolId_name_key`(`schoolId`, `name`),
    INDEX `FeeCategory_schoolId_isActive_idx`(`schoolId`, `isActive`),
    INDEX `FeeCategory_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FeeSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `termId` VARCHAR(191) NULL,
    `classTermId` VARCHAR(191) NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `appliesTo` ENUM('NEW_STUDENTS', 'RETURNING_STUDENTS', 'ALL_STUDENTS') NOT NULL DEFAULT 'ALL_STUDENTS',
    `isMandatory` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `dueDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FeeSchedule_scope_name_key`(`schoolId`(36), `sessionId`(36), `termId`(36), `classTermId`(36), `categoryId`(36), `name`),
    INDEX `FeeSchedule_schoolId_isActive_idx`(`schoolId`, `isActive`),
    INDEX `FeeSchedule_sessionId_idx`(`sessionId`),
    INDEX `FeeSchedule_termId_idx`(`termId`),
    INDEX `FeeSchedule_classTermId_idx`(`classTermId`),
    INDEX `FeeSchedule_categoryId_idx`(`categoryId`),
    INDEX `FeeSchedule_appliesTo_idx`(`appliesTo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StudentCharge` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `termId` VARCHAR(191) NULL,
    `classTermId` VARCHAR(191) NULL,
    `feeScheduleId` VARCHAR(191) NOT NULL,
    `originalAmount` DECIMAL(12, 2) NOT NULL,
    `discountAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `exemptedAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `finalAmountDue` DECIMAL(12, 2) NOT NULL,
    `amountPaid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('UNPAID', 'PARTIAL', 'PAID', 'WAIVED', 'CANCELLED') NOT NULL DEFAULT 'UNPAID',
    `dueDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StudentCharge_studentId_feeScheduleId_key`(`studentId`, `feeScheduleId`),
    INDEX `StudentCharge_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `StudentCharge_studentId_status_idx`(`studentId`, `status`),
    INDEX `StudentCharge_sessionId_status_idx`(`sessionId`, `status`),
    INDEX `StudentCharge_termId_status_idx`(`termId`, `status`),
    INDEX `StudentCharge_classTermId_status_idx`(`classTermId`, `status`),
    INDEX `StudentCharge_feeScheduleId_idx`(`feeScheduleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaymentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `chargeId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PaymentAllocation_paymentId_chargeId_key`(`paymentId`, `chargeId`),
    INDEX `PaymentAllocation_chargeId_idx`(`chargeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Discount` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `termId` VARCHAR(191) NULL,
    `feeScheduleId` VARCHAR(191) NULL,
    `chargeId` VARCHAR(191) NULL,
    `categoryId` VARCHAR(191) NULL,
    `type` ENUM('FIXED', 'PERCENTAGE') NOT NULL,
    `value` DECIMAL(12, 2) NOT NULL,
    `amountApplied` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `reason` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Discount_schoolId_isActive_idx`(`schoolId`, `isActive`),
    INDEX `Discount_studentId_isActive_idx`(`studentId`, `isActive`),
    INDEX `Discount_sessionId_idx`(`sessionId`),
    INDEX `Discount_termId_idx`(`termId`),
    INDEX `Discount_chargeId_idx`(`chargeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FeeExemption` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `termId` VARCHAR(191) NULL,
    `feeScheduleId` VARCHAR(191) NULL,
    `chargeId` VARCHAR(191) NULL,
    `categoryId` VARCHAR(191) NULL,
    `type` ENUM('FULL', 'PARTIAL') NOT NULL,
    `value` DECIMAL(12, 2) NULL,
    `amountApplied` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `reason` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FeeExemption_schoolId_isActive_idx`(`schoolId`, `isActive`),
    INDEX `FeeExemption_studentId_isActive_idx`(`studentId`, `isActive`),
    INDEX `FeeExemption_sessionId_idx`(`sessionId`),
    INDEX `FeeExemption_termId_idx`(`termId`),
    INDEX `FeeExemption_chargeId_idx`(`chargeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FeeCategory` ADD CONSTRAINT `FeeCategory_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `FeeSchedule` ADD CONSTRAINT `FeeSchedule_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FeeSchedule` ADD CONSTRAINT `FeeSchedule_sessionId_fkey`
  FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FeeSchedule` ADD CONSTRAINT `FeeSchedule_termId_fkey`
  FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FeeSchedule` ADD CONSTRAINT `FeeSchedule_classTermId_fkey`
  FOREIGN KEY (`classTermId`) REFERENCES `ClassTerm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FeeSchedule` ADD CONSTRAINT `FeeSchedule_categoryId_fkey`
  FOREIGN KEY (`categoryId`) REFERENCES `FeeCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `StudentCharge` ADD CONSTRAINT `StudentCharge_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StudentCharge` ADD CONSTRAINT `StudentCharge_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StudentCharge` ADD CONSTRAINT `StudentCharge_sessionId_fkey`
  FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StudentCharge` ADD CONSTRAINT `StudentCharge_termId_fkey`
  FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StudentCharge` ADD CONSTRAINT `StudentCharge_classTermId_fkey`
  FOREIGN KEY (`classTermId`) REFERENCES `ClassTerm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `StudentCharge` ADD CONSTRAINT `StudentCharge_feeScheduleId_fkey`
  FOREIGN KEY (`feeScheduleId`) REFERENCES `FeeSchedule`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_paymentId_fkey`
  FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_chargeId_fkey`
  FOREIGN KEY (`chargeId`) REFERENCES `StudentCharge`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Discount` ADD CONSTRAINT `Discount_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Discount` ADD CONSTRAINT `Discount_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Discount` ADD CONSTRAINT `Discount_sessionId_fkey`
  FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Discount` ADD CONSTRAINT `Discount_termId_fkey`
  FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Discount` ADD CONSTRAINT `Discount_feeScheduleId_fkey`
  FOREIGN KEY (`feeScheduleId`) REFERENCES `FeeSchedule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Discount` ADD CONSTRAINT `Discount_chargeId_fkey`
  FOREIGN KEY (`chargeId`) REFERENCES `StudentCharge`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Discount` ADD CONSTRAINT `Discount_categoryId_fkey`
  FOREIGN KEY (`categoryId`) REFERENCES `FeeCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `FeeExemption` ADD CONSTRAINT `FeeExemption_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FeeExemption` ADD CONSTRAINT `FeeExemption_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FeeExemption` ADD CONSTRAINT `FeeExemption_sessionId_fkey`
  FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FeeExemption` ADD CONSTRAINT `FeeExemption_termId_fkey`
  FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FeeExemption` ADD CONSTRAINT `FeeExemption_feeScheduleId_fkey`
  FOREIGN KEY (`feeScheduleId`) REFERENCES `FeeSchedule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `FeeExemption` ADD CONSTRAINT `FeeExemption_chargeId_fkey`
  FOREIGN KEY (`chargeId`) REFERENCES `StudentCharge`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `FeeExemption` ADD CONSTRAINT `FeeExemption_categoryId_fkey`
  FOREIGN KEY (`categoryId`) REFERENCES `FeeCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
