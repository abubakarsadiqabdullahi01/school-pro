-- Closing the Slice 9 gaps:
--  * a Paystack split per DigiSchool-managed school for dedicated accounts, so the school
--    bears Paystack's fee and DigiSchool keeps its platform percentage;
--  * refunds of held (unapplied) dedicated-account money, and more than one refund per
--    transaction (held money, then the applied part);
--  * Paystack customer identification (BVN) where Paystack requires it. No BVN is stored.

-- DropForeignKey
ALTER TABLE `GatewayRefund` DROP FOREIGN KEY `GatewayRefund_gatewayTransactionId_fkey`;

-- DropIndex
DROP INDEX `GatewayRefund_gatewayTransactionId_key` ON `GatewayRefund`;

-- AlterTable
ALTER TABLE `SchoolPaymentConfiguration` ADD COLUMN `dedicatedRequiresIdentification` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `dedicatedSplitCode` VARCHAR(64) NULL,
    ADD COLUMN `dedicatedSplitId` VARCHAR(32) NULL,
    ADD COLUMN `dedicatedSplitShare` INTEGER NULL;

-- AlterTable
ALTER TABLE `GatewayRefund` ADD COLUMN `unappliedPaymentId` VARCHAR(191) NULL,
    MODIFY `paymentId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `DedicatedCustomerIdentification` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `configurationId` VARCHAR(191) NOT NULL,
    `environment` ENUM('TEST', 'LIVE') NOT NULL,
    `customerCode` VARCHAR(64) NOT NULL,
    `customerEmail` VARCHAR(320) NOT NULL,
    `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `failureReason` VARCHAR(500) NULL,
    `requestedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DedicatedCustomerIdentification_environment_customerCode_idx`(`environment`, `customerCode`),
    INDEX `DedicatedCustomerIdentification_schoolId_status_idx`(`schoolId`, `status`),
    UNIQUE INDEX `DedicatedCustomerIdentification_configurationId_studentId_key`(`configurationId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `GatewayRefund_unappliedPaymentId_key` ON `GatewayRefund`(`unappliedPaymentId`);

-- CreateIndex
CREATE INDEX `GatewayRefund_gatewayTransactionId_idx` ON `GatewayRefund`(`gatewayTransactionId`);

-- AddForeignKey
ALTER TABLE `GatewayRefund` ADD CONSTRAINT `GatewayRefund_gatewayTransactionId_fkey` FOREIGN KEY (`gatewayTransactionId`) REFERENCES `GatewayTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GatewayRefund` ADD CONSTRAINT `GatewayRefund_unappliedPaymentId_fkey` FOREIGN KEY (`unappliedPaymentId`) REFERENCES `UnappliedPayment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DedicatedCustomerIdentification` ADD CONSTRAINT `DedicatedCustomerIdentification_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DedicatedCustomerIdentification` ADD CONSTRAINT `DedicatedCustomerIdentification_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DedicatedCustomerIdentification` ADD CONSTRAINT `DedicatedCustomerIdentification_configurationId_fkey` FOREIGN KEY (`configurationId`) REFERENCES `SchoolPaymentConfiguration`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

