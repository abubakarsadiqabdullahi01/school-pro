-- HR and payroll foundation for DigiSchool-Pro.
--
-- Staff records, salary scales and history, allowance and deduction configuration with
-- their per-staff assignments, monthly payroll runs with per-staff items, the frozen
-- payslip breakdown, salary payments linked to expenditure, payslip numbering, and
-- disciplinary/exit records.
--
-- Two things worth knowing about the shape:
--
--   * `PayrollItemLine` holds the computed figures behind a payslip rather than deriving
--     them from AllowanceType/DeductionType on demand. Without it, editing a transport
--     allowance today would silently rewrite every payslip ever issued.
--   * `PayrollRun` is unique on (schoolId, year, month) and `PayrollItem` on (runId,
--     staffId), so the duplicate-payroll and double-pay guards hold at the database level
--     and not only in application code.
--
-- `Expense` gains `payeeStaffId`, so a staff reimbursement points at the person rather than
-- at a typed name. Money is DECIMAL throughout; run totals are (14,2) since a whole school's
-- payroll is an order of magnitude above a single fee.
--
-- Index note: every unique index stays well inside InnoDB's 3072-byte key limit. The widest
-- is two VARCHAR(191) utf8mb4 columns at 1528 bytes.

-- AlterTable
ALTER TABLE `Expense` ADD COLUMN `payeeStaffId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Staff` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `staffNo` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `department` VARCHAR(191) NULL,
    `jobTitle` VARCHAR(191) NULL,
    `staffType` ENUM('TEACHER', 'ADMIN_STAFF', 'ACCOUNTANT', 'CLEANER', 'DRIVER', 'SECURITY', 'LIBRARIAN', 'NURSE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `employmentType` ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'CASUAL') NOT NULL DEFAULT 'FULL_TIME',
    `employmentStatus` ENUM('ACTIVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    `dateEmployed` DATETIME(3) NOT NULL,
    `dateExited` DATETIME(3) NULL,
    `qualification` VARCHAR(191) NULL,
    `emergencyContactName` VARCHAR(191) NULL,
    `emergencyContactPhone` VARCHAR(191) NULL,
    `bankName` VARCHAR(191) NULL,
    `accountNumber` VARCHAR(191) NULL,
    `accountName` VARCHAR(191) NULL,
    `pensionPfa` VARCHAR(191) NULL,
    `pensionPin` VARCHAR(191) NULL,
    `taxId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Staff_userId_key`(`userId`),
    INDEX `Staff_schoolId_employmentStatus_idx`(`schoolId`, `employmentStatus`),
    INDEX `Staff_schoolId_staffType_idx`(`schoolId`, `staffType`),
    INDEX `Staff_department_idx`(`department`),
    INDEX `Staff_lastName_firstName_idx`(`lastName`, `firstName`),
    UNIQUE INDEX `Staff_schoolId_staffNo_key`(`schoolId`, `staffNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffConfig` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `staffNoPrefix` VARCHAR(191) NOT NULL DEFAULT 'STF',
    `payrollClosingDay` INTEGER NOT NULL DEFAULT 25,
    `defaultAccountId` VARCHAR(191) NULL,
    `defaultPaymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'POS', 'CHEQUE', 'ONLINE') NOT NULL DEFAULT 'BANK_TRANSFER',
    `requirePayrollApproval` BOOLEAN NOT NULL DEFAULT true,
    `allowNegativeNet` BOOLEAN NOT NULL DEFAULT false,
    `prorateFirstMonth` BOOLEAN NOT NULL DEFAULT true,
    `payslipNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffConfig_schoolId_key`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalaryScale` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `gradeLevel` VARCHAR(191) NULL,
    `step` VARCHAR(191) NULL,
    `baseSalary` DECIMAL(12, 2) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SalaryScale_schoolId_isActive_idx`(`schoolId`, `isActive`),
    UNIQUE INDEX `SalaryScale_schoolId_name_key`(`schoolId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffSalary` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `scaleId` VARCHAR(191) NULL,
    `baseSalary` DECIMAL(12, 2) NOT NULL,
    `effectiveFrom` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffSalary_staffId_isActive_idx`(`staffId`, `isActive`),
    INDEX `StaffSalary_staffId_effectiveFrom_idx`(`staffId`, `effectiveFrom`),
    INDEX `StaffSalary_scaleId_idx`(`scaleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AllowanceType` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` ENUM('FIXED', 'PERCENTAGE') NOT NULL DEFAULT 'FIXED',
    `value` DECIMAL(12, 2) NOT NULL,
    `isTaxable` BOOLEAN NOT NULL DEFAULT true,
    `isRecurring` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AllowanceType_schoolId_isActive_idx`(`schoolId`, `isActive`),
    UNIQUE INDEX `AllowanceType_schoolId_name_key`(`schoolId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeductionType` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` ENUM('FIXED', 'PERCENTAGE') NOT NULL DEFAULT 'FIXED',
    `value` DECIMAL(12, 2) NOT NULL,
    `timing` ENUM('PRE_TAX', 'POST_TAX') NOT NULL DEFAULT 'POST_TAX',
    `isRecurring` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeductionType_schoolId_isActive_idx`(`schoolId`, `isActive`),
    UNIQUE INDEX `DeductionType_schoolId_name_key`(`schoolId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffAllowance` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `allowanceTypeId` VARCHAR(191) NOT NULL,
    `valueOverride` DECIMAL(12, 2) NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT true,
    `periodYear` INTEGER NULL,
    `periodMonth` INTEGER NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffAllowance_staffId_isActive_idx`(`staffId`, `isActive`),
    INDEX `StaffAllowance_allowanceTypeId_idx`(`allowanceTypeId`),
    INDEX `StaffAllowance_periodYear_periodMonth_idx`(`periodYear`, `periodMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffDeduction` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `deductionTypeId` VARCHAR(191) NOT NULL,
    `valueOverride` DECIMAL(12, 2) NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT true,
    `periodYear` INTEGER NULL,
    `periodMonth` INTEGER NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffDeduction_staffId_isActive_idx`(`staffId`, `isActive`),
    INDEX `StaffDeduction_deductionTypeId_idx`(`deductionTypeId`),
    INDEX `StaffDeduction_periodYear_periodMonth_idx`(`periodYear`, `periodMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollRun` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `totalBase` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalAllowances` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalDeductions` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalGross` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalNet` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `generatedBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidBy` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `decisionReason` VARCHAR(500) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PayrollRun_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `PayrollRun_sessionId_idx`(`sessionId`),
    INDEX `PayrollRun_year_month_idx`(`year`, `month`),
    UNIQUE INDEX `PayrollRun_schoolId_year_month_key`(`schoolId`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollItem` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `payslipNo` VARCHAR(191) NOT NULL,
    `baseSalary` DECIMAL(12, 2) NOT NULL,
    `totalAllowances` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `totalDeductions` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `grossPay` DECIMAL(12, 2) NOT NULL,
    `netPay` DECIMAL(12, 2) NOT NULL,
    `proratedDays` INTEGER NULL,
    `daysInMonth` INTEGER NULL,
    `status` ENUM('PENDING', 'PAID', 'EXCLUDED') NOT NULL DEFAULT 'PENDING',
    `paidAt` DATETIME(3) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PayrollItem_staffId_status_idx`(`staffId`, `status`),
    INDEX `PayrollItem_runId_status_idx`(`runId`, `status`),
    UNIQUE INDEX `PayrollItem_runId_staffId_key`(`runId`, `staffId`),
    UNIQUE INDEX `PayrollItem_schoolId_payslipNo_key`(`schoolId`, `payslipNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollItemLine` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `kind` ENUM('ALLOWANCE', 'DEDUCTION') NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `sourceType` VARCHAR(191) NULL,
    `sourceId` VARCHAR(191) NULL,
    `isTaxable` BOOLEAN NULL,
    `timing` ENUM('PRE_TAX', 'POST_TAX') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PayrollItemLine_itemId_kind_idx`(`itemId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalaryPayment` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'POS', 'CHEQUE', 'ONLINE') NOT NULL DEFAULT 'BANK_TRANSFER',
    `accountId` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NOT NULL,
    `paidBy` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalaryPayment_schoolId_paidAt_idx`(`schoolId`, `paidAt`),
    INDEX `SalaryPayment_runId_idx`(`runId`),
    INDEX `SalaryPayment_itemId_idx`(`itemId`),
    INDEX `SalaryPayment_expenseId_idx`(`expenseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayslipSequence` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `lastSequence` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PayslipSequence_schoolId_year_key`(`schoolId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffDisciplinaryRecord` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `type` ENUM('QUERY', 'WARNING', 'SUSPENSION', 'TERMINATION', 'RESIGNATION') NOT NULL,
    `reason` TEXT NOT NULL,
    `occurredOn` DATETIME(3) NOT NULL,
    `actionTaken` TEXT NULL,
    `attachmentUrl` VARCHAR(1000) NULL,
    `recordedBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffDisciplinaryRecord_staffId_occurredOn_idx`(`staffId`, `occurredOn`),
    INDEX `StaffDisciplinaryRecord_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Expense_payeeStaffId_idx` ON `Expense`(`payeeStaffId`);

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_payeeStaffId_fkey` FOREIGN KEY (`payeeStaffId`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Staff` ADD CONSTRAINT `Staff_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Staff` ADD CONSTRAINT `Staff_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffConfig` ADD CONSTRAINT `StaffConfig_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffConfig` ADD CONSTRAINT `StaffConfig_defaultAccountId_fkey` FOREIGN KEY (`defaultAccountId`) REFERENCES `PaymentAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalaryScale` ADD CONSTRAINT `SalaryScale_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffSalary` ADD CONSTRAINT `StaffSalary_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffSalary` ADD CONSTRAINT `StaffSalary_scaleId_fkey` FOREIGN KEY (`scaleId`) REFERENCES `SalaryScale`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffSalary` ADD CONSTRAINT `StaffSalary_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffSalary` ADD CONSTRAINT `StaffSalary_approvedBy_fkey` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AllowanceType` ADD CONSTRAINT `AllowanceType_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeductionType` ADD CONSTRAINT `DeductionType_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffAllowance` ADD CONSTRAINT `StaffAllowance_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffAllowance` ADD CONSTRAINT `StaffAllowance_allowanceTypeId_fkey` FOREIGN KEY (`allowanceTypeId`) REFERENCES `AllowanceType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffDeduction` ADD CONSTRAINT `StaffDeduction_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffDeduction` ADD CONSTRAINT `StaffDeduction_deductionTypeId_fkey` FOREIGN KEY (`deductionTypeId`) REFERENCES `DeductionType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollRun` ADD CONSTRAINT `PayrollRun_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollRun` ADD CONSTRAINT `PayrollRun_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollRun` ADD CONSTRAINT `PayrollRun_generatedBy_fkey` FOREIGN KEY (`generatedBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollRun` ADD CONSTRAINT `PayrollRun_approvedBy_fkey` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollRun` ADD CONSTRAINT `PayrollRun_paidBy_fkey` FOREIGN KEY (`paidBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollItem` ADD CONSTRAINT `PayrollItem_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollItem` ADD CONSTRAINT `PayrollItem_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `PayrollRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollItem` ADD CONSTRAINT `PayrollItem_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollItemLine` ADD CONSTRAINT `PayrollItemLine_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `PayrollItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalaryPayment` ADD CONSTRAINT `SalaryPayment_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalaryPayment` ADD CONSTRAINT `SalaryPayment_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `PayrollRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalaryPayment` ADD CONSTRAINT `SalaryPayment_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `PayrollItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalaryPayment` ADD CONSTRAINT `SalaryPayment_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `PaymentAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalaryPayment` ADD CONSTRAINT `SalaryPayment_paidBy_fkey` FOREIGN KEY (`paidBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalaryPayment` ADD CONSTRAINT `SalaryPayment_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayslipSequence` ADD CONSTRAINT `PayslipSequence_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffDisciplinaryRecord` ADD CONSTRAINT `StaffDisciplinaryRecord_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffDisciplinaryRecord` ADD CONSTRAINT `StaffDisciplinaryRecord_recordedBy_fkey` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffDisciplinaryRecord` ADD CONSTRAINT `StaffDisciplinaryRecord_approvedBy_fkey` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

