-- AlterTable
ALTER TABLE `GatewayRefund` ADD COLUMN `payoutAccountName` VARCHAR(191) NULL,
    ADD COLUMN `payoutAccountNumber` VARCHAR(10) NULL,
    ADD COLUMN `payoutBankId` VARCHAR(20) NULL,
    ADD COLUMN `payoutBankName` VARCHAR(120) NULL,
    ADD COLUMN `payoutConfirmedBy` VARCHAR(191) NULL,
    ADD COLUMN `payoutEnteredAt` DATETIME(3) NULL,
    ADD COLUMN `payoutEnteredBy` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `CounterRefundRequest` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `referenceNo` VARCHAR(120) NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'REQUESTED',
    `requestedBy` VARCHAR(191) NOT NULL,
    `decidedBy` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CounterRefundRequest_schoolId_status_createdAt_idx`(`schoolId`, `status`, `createdAt`),
    INDEX `CounterRefundRequest_paymentId_idx`(`paymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CounterRefundRequest` ADD CONSTRAINT `CounterRefundRequest_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CounterRefundRequest` ADD CONSTRAINT `CounterRefundRequest_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

