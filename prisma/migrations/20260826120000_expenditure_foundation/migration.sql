-- Expenditure foundation for DigiSchool-Pro.
--
-- The spending side of the ledger: categories, the payment chart, expenses with their
-- approval trail, receipt attachments, and voucher numbering. Money is DECIMAL(12,2)
-- throughout, as on the income side.
--
-- The AuditLog change is drift left by the finance migration: that one widened
-- `users`.`role` to include ACCOUNTANT but not `AuditLog`.`actorRole`, so an accountant's
-- actions could not be logged. Fixed here.
--
-- Index note: every unique index stays well inside InnoDB's 3072-byte key limit. The
-- widest is two VARCHAR(191) utf8mb4 columns at 1528 bytes.

-- AlterTable
ALTER TABLE `AuditLog` MODIFY `actorRole` ENUM('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'TEACHER', 'PARENT', 'STUDENT') NOT NULL;

-- CreateTable
CREATE TABLE `ExpenseCategory` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `budgetLimit` DECIMAL(12, 2) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExpenseCategory_schoolId_isActive_idx`(`schoolId`, `isActive`),
    UNIQUE INDEX `ExpenseCategory_schoolId_name_key`(`schoolId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAccount` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('CASH', 'BANK', 'POS', 'WALLET', 'OTHER') NOT NULL DEFAULT 'CASH',
    `bankName` VARCHAR(191) NULL,
    `accountNumber` VARCHAR(191) NULL,
    `openingBalance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentAccount_schoolId_isActive_idx`(`schoolId`, `isActive`),
    INDEX `PaymentAccount_type_idx`(`type`),
    UNIQUE INDEX `PaymentAccount_schoolId_name_key`(`schoolId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `termId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `voucherNo` VARCHAR(191) NOT NULL,
    `payeeName` VARCHAR(191) NOT NULL,
    `payeeType` ENUM('STAFF', 'VENDOR', 'PARENT', 'STUDENT', 'OTHER') NOT NULL DEFAULT 'VENDOR',
    `payeeUserId` VARCHAR(191) NULL,
    `payeeStudentId` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paymentMethod` ENUM('CASH', 'BANK_TRANSFER', 'POS', 'CHEQUE', 'ONLINE') NOT NULL DEFAULT 'CASH',
    `referenceNo` VARCHAR(191) NULL,
    `expenseDate` DATETIME(3) NOT NULL,
    `notes` TEXT NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_APPROVAL',
    `recordedBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `paidBy` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `decisionReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Expense_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `Expense_sessionId_status_idx`(`sessionId`, `status`),
    INDEX `Expense_termId_status_idx`(`termId`, `status`),
    INDEX `Expense_categoryId_status_idx`(`categoryId`, `status`),
    INDEX `Expense_accountId_status_idx`(`accountId`, `status`),
    INDEX `Expense_expenseDate_idx`(`expenseDate`),
    INDEX `Expense_recordedBy_idx`(`recordedBy`),
    INDEX `Expense_approvedBy_idx`(`approvedBy`),
    INDEX `Expense_paidBy_idx`(`paidBy`),
    INDEX `Expense_payeeUserId_idx`(`payeeUserId`),
    INDEX `Expense_payeeStudentId_idx`(`payeeStudentId`),
    UNIQUE INDEX `Expense_schoolId_voucherNo_key`(`schoolId`, `voucherNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(1000) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `uploadedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExpenseAttachment_expenseId_idx`(`expenseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseVoucherSequence` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `lastSequence` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExpenseVoucherSequence_schoolId_year_idx`(`schoolId`, `year`),
    UNIQUE INDEX `ExpenseVoucherSequence_schoolId_year_key`(`schoolId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ExpenseCategory` ADD CONSTRAINT `ExpenseCategory_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAccount` ADD CONSTRAINT `PaymentAccount_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_termId_fkey` FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ExpenseCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `PaymentAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_recordedBy_fkey` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_approvedBy_fkey` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_paidBy_fkey` FOREIGN KEY (`paidBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_payeeUserId_fkey` FOREIGN KEY (`payeeUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_payeeStudentId_fkey` FOREIGN KEY (`payeeStudentId`) REFERENCES `students`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseAttachment` ADD CONSTRAINT `ExpenseAttachment_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseAttachment` ADD CONSTRAINT `ExpenseAttachment_uploadedBy_fkey` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseVoucherSequence` ADD CONSTRAINT `ExpenseVoucherSequence_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

