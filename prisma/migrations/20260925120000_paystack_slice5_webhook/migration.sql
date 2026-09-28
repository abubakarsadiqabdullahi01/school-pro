-- One durable notification request per successful gateway transaction and notification kind.

CREATE TABLE `GatewayNotificationOutbox` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `gatewayTransactionId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_RECEIPT',
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `payload` JSON NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NULL,
  `sentAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GatewayNotificationOutbox_gatewayTransactionId_kind_key` (`gatewayTransactionId`, `kind`),
  INDEX `GatewayNotificationOutbox_status_nextAttemptAt_createdAt_idx` (`status`, `nextAttemptAt`, `createdAt`),
  INDEX `GatewayNotificationOutbox_schoolId_createdAt_idx` (`schoolId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GatewayNotificationOutbox` ADD CONSTRAINT `GatewayNotificationOutbox_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GatewayNotificationOutbox` ADD CONSTRAINT `GatewayNotificationOutbox_gatewayTransactionId_fkey`
  FOREIGN KEY (`gatewayTransactionId`) REFERENCES `GatewayTransaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
