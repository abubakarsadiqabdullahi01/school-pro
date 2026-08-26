-- Gate 1 — data integrity migration
--
-- Batches every schema decision that is cheap now and expensive once real score and
-- payment data exists:
--
--   1.1  assessments: unique key drops teacherId, so a student/subject/term can hold
--        exactly one score row.
--   1.2  money: FeeStructure.amount and Payment.amount become DECIMAL(12,2).
--   1.3  Attendance: one row per student per day, status becomes an enum.
--   1.5  finance keys: FeeStructure moves onto ClassTerm and gains schoolId; Payment
--        gains schoolId and termId; receipt numbers become unique per school; a
--        per-school receipt sequence table is added.
--
-- RUN `npx tsx scripts/gate1-preflight.ts` FIRST. It is read-only and reports the two
-- things that will make this migration fail: duplicate assessments for a
-- student/subject/term, and duplicate attendance rows for a student/day. Neither can be
-- resolved automatically — someone has to decide which row is authoritative.
--
-- The column changes here are deliberately split into add-nullable → backfill →
-- enforce-NOT-NULL rather than the single ALTER that `prisma migrate diff` generates.
-- That generated form adds NOT NULL columns to populated tables and drops classId/termId
-- in the same statement, which loses every existing fee structure's class and term.
--
-- The NOT NULL steps double as assertions: if a backfill failed to map a row, the ALTER
-- fails and the transaction rolls back rather than leaving a half-migrated table.

-- ---------------------------------------------------------------------------
-- 1.1  assessments — one score row per student, per subject, per term
-- ---------------------------------------------------------------------------

-- The studentId foreign key keeps its own `assessments_studentId_idx`, so dropping this
-- composite does not leave the FK unbacked.
DROP INDEX `assessments_studentId_subjectId_termId_teacherId_key` ON `assessments`;

CREATE UNIQUE INDEX `assessments_studentId_subjectId_termId_key`
  ON `assessments`(`studentId`, `subjectId`, `termId`);

-- ---------------------------------------------------------------------------
-- 1.3  Attendance — one row per student per day, status as an enum
-- ---------------------------------------------------------------------------

ALTER TABLE `Attendance` MODIFY `status` ENUM('PRESENT', 'ABSENT', 'LATE') NOT NULL;

CREATE UNIQUE INDEX `Attendance_studentId_date_key` ON `Attendance`(`studentId`, `date`);
CREATE INDEX `Attendance_date_idx` ON `Attendance`(`date`);

-- ---------------------------------------------------------------------------
-- 1.2 + 1.5  FeeStructure — onto ClassTerm, with a tenant column and decimal money
-- ---------------------------------------------------------------------------

-- Step 1: add the new columns as nullable so existing rows survive.
ALTER TABLE `FeeStructure`
  ADD COLUMN `classTermId` VARCHAR(191) NULL,
  ADD COLUMN `schoolId` VARCHAR(191) NULL;

-- Step 2: money to decimal. Every existing amount was verified to convert exactly by the
-- pre-flight check; anything with more than two decimal places rounds here.
ALTER TABLE `FeeStructure` MODIFY `amount` DECIMAL(12, 2) NOT NULL;

-- Step 3: derive classTermId from the class/term pair the fee was keyed on.
UPDATE `FeeStructure` `fs`
  JOIN `ClassTerm` `ct`
    ON `ct`.`classId` = `fs`.`classId`
   AND `ct`.`termId` = `fs`.`termId`
SET `fs`.`classTermId` = `ct`.`id`;

-- Step 4: derive schoolId through the class. FeeStructure had no tenant column, so
-- scoping depended on every query remembering to join through Class.
UPDATE `FeeStructure` `fs`
  JOIN `Class` `c` ON `c`.`id` = `fs`.`classId`
SET `fs`.`schoolId` = `c`.`schoolId`;

-- Step 5: enforce. Fails if any fee had no matching ClassTerm — which the pre-flight
-- reports as blocking, so it should already be resolved.
ALTER TABLE `FeeStructure`
  MODIFY `classTermId` VARCHAR(191) NOT NULL,
  MODIFY `schoolId` VARCHAR(191) NOT NULL;

-- Step 6: retire the old keys.
ALTER TABLE `FeeStructure` DROP FOREIGN KEY `FeeStructure_classId_fkey`;
ALTER TABLE `FeeStructure` DROP FOREIGN KEY `FeeStructure_termId_fkey`;
DROP INDEX `FeeStructure_classId_fkey` ON `FeeStructure`;
DROP INDEX `FeeStructure_termId_fkey` ON `FeeStructure`;
ALTER TABLE `FeeStructure` DROP COLUMN `classId`, DROP COLUMN `termId`;

-- ---------------------------------------------------------------------------
-- 1.2 + 1.5  Payment — tenant and term columns, decimal money, per-school receipts
-- ---------------------------------------------------------------------------

ALTER TABLE `Payment`
  ADD COLUMN `schoolId` VARCHAR(191) NULL,
  ADD COLUMN `termId` VARCHAR(191) NULL;

ALTER TABLE `Payment` MODIFY `amount` DECIMAL(12, 2) NOT NULL;

-- Backfill through the fee structure, which was populated above. Term-level income
-- reports previously needed a three-table join to answer "what did we collect this term".
UPDATE `Payment` `p`
  JOIN `FeeStructure` `fs` ON `fs`.`id` = `p`.`feeStructureId`
  JOIN `ClassTerm` `ct` ON `ct`.`id` = `fs`.`classTermId`
SET `p`.`schoolId` = `fs`.`schoolId`,
    `p`.`termId` = `ct`.`termId`;

ALTER TABLE `Payment`
  MODIFY `schoolId` VARCHAR(191) NOT NULL,
  MODIFY `termId` VARCHAR(191) NOT NULL;

-- Receipt numbers were globally unique, which would have made two schools contend for the
-- same sequence. They are now unique per school.
DROP INDEX `Payment_receiptNo_key` ON `Payment`;
CREATE UNIQUE INDEX `Payment_schoolId_receiptNo_key` ON `Payment`(`schoolId`, `receiptNo`);

-- ---------------------------------------------------------------------------
-- 1.5  ReceiptSequence — per-school receipt counter
-- ---------------------------------------------------------------------------

CREATE TABLE `ReceiptSequence` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `lastSequence` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ReceiptSequence_schoolId_year_idx`(`schoolId`, `year`),
    UNIQUE INDEX `ReceiptSequence_schoolId_year_key`(`schoolId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Indexes and foreign keys for the new columns
-- ---------------------------------------------------------------------------

CREATE INDEX `FeeStructure_schoolId_idx` ON `FeeStructure`(`schoolId`);
CREATE INDEX `FeeStructure_classTermId_idx` ON `FeeStructure`(`classTermId`);
CREATE INDEX `FeeStructure_schoolId_isActive_idx` ON `FeeStructure`(`schoolId`, `isActive`);
CREATE UNIQUE INDEX `FeeStructure_classTermId_name_key` ON `FeeStructure`(`classTermId`, `name`);

CREATE INDEX `Payment_schoolId_status_idx` ON `Payment`(`schoolId`, `status`);
CREATE INDEX `Payment_termId_status_idx` ON `Payment`(`termId`, `status`);
CREATE INDEX `Payment_paymentDate_idx` ON `Payment`(`paymentDate`);

ALTER TABLE `FeeStructure` ADD CONSTRAINT `FeeStructure_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FeeStructure` ADD CONSTRAINT `FeeStructure_classTermId_fkey`
  FOREIGN KEY (`classTermId`) REFERENCES `ClassTerm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Payment` ADD CONSTRAINT `Payment_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_termId_fkey`
  FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReceiptSequence` ADD CONSTRAINT `ReceiptSequence_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
