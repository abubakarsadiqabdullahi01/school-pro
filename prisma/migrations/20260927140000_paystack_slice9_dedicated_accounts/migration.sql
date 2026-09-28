-- Paystack Slice 9: dedicated virtual accounts.
--
-- Each student can hold a permanent Paystack account number; a transfer into it is recorded
-- as a DEDICATED_ACCOUNT gateway transaction and allocated to that student's oldest charges.
-- Money beyond what the student owed is held in UnappliedPayment for the bursar to decide.
-- Nothing is enabled here: dedicatedAccountsEnabled defaults to false for every school.

-- AlterTable
ALTER TABLE `SchoolPaymentConfiguration` ADD COLUMN `dedicatedAccountBank` VARCHAR(64) NULL,
    ADD COLUMN `dedicatedAccountsEnabled` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `GatewayTransaction` ADD COLUMN `dedicatedAccountId` VARCHAR(191) NULL,
    ADD COLUMN `senderBank` VARCHAR(120) NULL,
    ADD COLUMN `senderName` VARCHAR(191) NULL,
    ADD COLUMN `source` ENUM('CHECKOUT', 'DEDICATED_ACCOUNT') NOT NULL DEFAULT 'CHECKOUT';

-- CreateTable
CREATE TABLE `DedicatedAccount` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `configurationId` VARCHAR(191) NOT NULL,
    `provider` ENUM('PAYSTACK') NOT NULL DEFAULT 'PAYSTACK',
    `environment` ENUM('TEST', 'LIVE') NOT NULL,
    `status` ENUM('ACTIVE', 'DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',
    `providerCustomerCode` VARCHAR(64) NOT NULL,
    `providerAccountId` VARCHAR(64) NOT NULL,
    `customerEmail` VARCHAR(320) NOT NULL,
    `accountNumber` VARCHAR(10) NOT NULL,
    `accountName` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(120) NOT NULL,
    `bankSlug` VARCHAR(64) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `deactivatedAt` DATETIME(3) NULL,
    `deactivatedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DedicatedAccount_provider_environment_providerCustomerCode_idx`(`provider`, `environment`, `providerCustomerCode`),
    INDEX `DedicatedAccount_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `DedicatedAccount_studentId_idx`(`studentId`),
    INDEX `DedicatedAccount_configurationId_idx`(`configurationId`),
    UNIQUE INDEX `DedicatedAccount_provider_environment_accountNumber_key`(`provider`, `environment`, `accountNumber`),
    UNIQUE INDEX `DedicatedAccount_provider_environment_providerAccountId_key`(`provider`, `environment`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UnappliedPayment` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `gatewayTransactionId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `status` ENUM('OPEN', 'APPLIED', 'RETURNED') NOT NULL DEFAULT 'OPEN',
    `appliedPaymentId` VARCHAR(191) NULL,
    `resolvedBy` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolutionNote` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UnappliedPayment_gatewayTransactionId_key`(`gatewayTransactionId`),
    INDEX `UnappliedPayment_schoolId_status_createdAt_idx`(`schoolId`, `status`, `createdAt`),
    INDEX `UnappliedPayment_studentId_idx`(`studentId`),
    INDEX `UnappliedPayment_appliedPaymentId_idx`(`appliedPaymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `GatewayTransaction_dedicatedAccountId_idx` ON `GatewayTransaction`(`dedicatedAccountId`);

-- AddForeignKey
ALTER TABLE `GatewayTransaction` ADD CONSTRAINT `GatewayTransaction_dedicatedAccountId_fkey` FOREIGN KEY (`dedicatedAccountId`) REFERENCES `DedicatedAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DedicatedAccount` ADD CONSTRAINT `DedicatedAccount_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DedicatedAccount` ADD CONSTRAINT `DedicatedAccount_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DedicatedAccount` ADD CONSTRAINT `DedicatedAccount_configurationId_fkey` FOREIGN KEY (`configurationId`) REFERENCES `SchoolPaymentConfiguration`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnappliedPayment` ADD CONSTRAINT `UnappliedPayment_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnappliedPayment` ADD CONSTRAINT `UnappliedPayment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnappliedPayment` ADD CONSTRAINT `UnappliedPayment_gatewayTransactionId_fkey` FOREIGN KEY (`gatewayTransactionId`) REFERENCES `GatewayTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnappliedPayment` ADD CONSTRAINT `UnappliedPayment_appliedPaymentId_fkey` FOREIGN KEY (`appliedPaymentId`) REFERENCES `Payment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

