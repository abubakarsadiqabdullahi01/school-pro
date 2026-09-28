CREATE TABLE `GatewayRefund` (
  `id` VARCHAR(191) NOT NULL, `schoolId` VARCHAR(191) NOT NULL,
  `gatewayTransactionId` VARCHAR(191) NOT NULL, `paymentId` VARCHAR(191) NOT NULL,
  `provider` ENUM('PAYSTACK') NOT NULL DEFAULT 'PAYSTACK',
  `environment` ENUM('TEST','LIVE') NOT NULL, `providerRefundId` VARCHAR(191) NULL,
  `status` ENUM('REQUESTED','PENDING','PROCESSING','PROCESSED','FAILED','NEEDS_ATTENTION') NOT NULL DEFAULT 'REQUESTED',
  `amount` DECIMAL(14,2) NOT NULL, `currency` VARCHAR(3) NOT NULL DEFAULT 'NGN',
  `reason` VARCHAR(500) NOT NULL, `requestedBy` VARCHAR(191) NOT NULL,
  `providerMessage` TEXT NULL, `expectedAt` DATETIME(3) NULL, `processedAt` DATETIME(3) NULL,
  `failedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GatewayRefund_gatewayTransactionId_key` (`gatewayTransactionId`),
  UNIQUE INDEX `GatewayRefund_provider_environment_providerRefundId_key` (`provider`,`environment`,`providerRefundId`),
  INDEX `GatewayRefund_schoolId_status_createdAt_idx` (`schoolId`,`status`,`createdAt`),
  INDEX `GatewayRefund_paymentId_idx` (`paymentId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GatewayDispute` (
  `id` VARCHAR(191) NOT NULL, `schoolId` VARCHAR(191) NOT NULL, `gatewayTransactionId` VARCHAR(191) NULL,
  `provider` ENUM('PAYSTACK') NOT NULL DEFAULT 'PAYSTACK', `environment` ENUM('TEST','LIVE') NOT NULL,
  `providerDisputeId` VARCHAR(191) NOT NULL, `status` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(14,2) NULL, `currency` VARCHAR(3) NULL, `reason` VARCHAR(500) NULL,
  `category` VARCHAR(120) NULL, `dueAt` DATETIME(3) NULL, `resolution` VARCHAR(64) NULL,
  `evidenceNote` TEXT NULL, `lastEventType` VARCHAR(100) NOT NULL,
  `lastEventAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `resolvedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GatewayDispute_provider_environment_providerDisputeId_key` (`provider`,`environment`,`providerDisputeId`),
  INDEX `GatewayDispute_schoolId_status_dueAt_idx` (`schoolId`,`status`,`dueAt`),
  INDEX `GatewayDispute_gatewayTransactionId_idx` (`gatewayTransactionId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GatewaySettlement` (
  `id` VARCHAR(191) NOT NULL, `schoolId` VARCHAR(191) NOT NULL, `configurationId` VARCHAR(191) NULL,
  `provider` ENUM('PAYSTACK') NOT NULL DEFAULT 'PAYSTACK', `environment` ENUM('TEST','LIVE') NOT NULL,
  `providerSettlementId` VARCHAR(191) NOT NULL, `status` VARCHAR(64) NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'NGN', `totalAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `totalFees` DECIMAL(14,2) NOT NULL DEFAULT 0, `totalProcessed` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `settlementDate` DATETIME(3) NULL, `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GatewaySettlement_provider_environment_providerSettlementId_key` (`provider`,`environment`,`providerSettlementId`),
  INDEX `GatewaySettlement_schoolId_settlementDate_idx` (`schoolId`,`settlementDate`),
  INDEX `GatewaySettlement_configurationId_idx` (`configurationId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GatewayReconciliationIssue` (
  `id` VARCHAR(191) NOT NULL, `schoolId` VARCHAR(191) NOT NULL, `settlementId` VARCHAR(191) NULL,
  `gatewayTransactionId` VARCHAR(191) NULL, `dedupeKey` VARCHAR(191) NOT NULL, `kind` VARCHAR(64) NOT NULL,
  `status` ENUM('OPEN','ACKNOWLEDGED','RESOLVED') NOT NULL DEFAULT 'OPEN',
  `severity` VARCHAR(32) NOT NULL DEFAULT 'WARNING', `message` TEXT NOT NULL, `detail` JSON NULL,
  `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GatewayReconciliationIssue_dedupeKey_key` (`dedupeKey`),
  INDEX `GatewayReconciliationIssue_schoolId_status_lastSeenAt_idx` (`schoolId`,`status`,`lastSeenAt`),
  INDEX `GatewayReconciliationIssue_gatewayTransactionId_idx` (`gatewayTransactionId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GatewayRefund` ADD CONSTRAINT `GatewayRefund_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `GatewayRefund` ADD CONSTRAINT `GatewayRefund_gatewayTransactionId_fkey` FOREIGN KEY (`gatewayTransactionId`) REFERENCES `GatewayTransaction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `GatewayRefund` ADD CONSTRAINT `GatewayRefund_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `GatewayDispute` ADD CONSTRAINT `GatewayDispute_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `GatewayDispute` ADD CONSTRAINT `GatewayDispute_gatewayTransactionId_fkey` FOREIGN KEY (`gatewayTransactionId`) REFERENCES `GatewayTransaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `GatewaySettlement` ADD CONSTRAINT `GatewaySettlement_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `GatewayReconciliationIssue` ADD CONSTRAINT `GatewayReconciliationIssue_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `GatewayReconciliationIssue` ADD CONSTRAINT `GatewayReconciliationIssue_settlementId_fkey` FOREIGN KEY (`settlementId`) REFERENCES `GatewaySettlement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
