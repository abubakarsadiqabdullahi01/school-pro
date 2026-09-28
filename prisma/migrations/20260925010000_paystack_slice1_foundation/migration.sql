-- Provider-neutral online-payment foundation. No credentials are stored here.

CREATE TABLE `SchoolPaymentConfiguration` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `provider` ENUM('PAYSTACK') NOT NULL DEFAULT 'PAYSTACK',
  `environment` ENUM('TEST','LIVE') NOT NULL,
  `accountMode` ENUM('PLATFORM_MANAGED','SCHOOL_OWNED') NOT NULL DEFAULT 'PLATFORM_MANAGED',
  `status` ENUM('DRAFT','PENDING_VERIFICATION','READY','SUSPENDED','DISABLED') NOT NULL DEFAULT 'DRAFT',
  `isEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `subaccountCode` VARCHAR(191) NULL,
  `providerAccountId` VARCHAR(191) NULL,
  `credentialKeyRef` VARCHAR(191) NULL,
  `businessName` VARCHAR(191) NULL,
  `settlementBankCode` VARCHAR(191) NULL,
  `settlementAccountLast4` VARCHAR(4) NULL,
  `feePolicy` ENUM('SCHOOL_PAYS','PLATFORM_PAYS','PARENT_PAYS_GROSS_UP') NOT NULL DEFAULT 'SCHOOL_PAYS',
  `platformChargeType` ENUM('NONE','FLAT','PERCENTAGE') NOT NULL DEFAULT 'NONE',
  `platformChargeValue` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `allowedChannels` JSON NULL,
  `allowPartialPayments` BOOLEAN NOT NULL DEFAULT FALSE,
  `allocationPolicy` ENUM('SELECTED_CHARGES','OLDEST_FIRST','MANUAL_REVIEW') NOT NULL DEFAULT 'SELECTED_CHARGES',
  `configVersion` INTEGER NOT NULL DEFAULT 1,
  `verifiedAt` DATETIME(3) NULL,
  `suspendedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SchoolPaymentConfiguration_schoolId_provider_environment_key` (`schoolId`,`provider`,`environment`),
  INDEX `SchoolPaymentConfiguration_provider_environment_status_idx` (`provider`,`environment`,`status`),
  INDEX `SchoolPaymentConfiguration_schoolId_isEnabled_idx` (`schoolId`,`isEnabled`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GatewayTransaction` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `termId` VARCHAR(191) NOT NULL,
  `configurationId` VARCHAR(191) NULL,
  `provider` ENUM('PAYSTACK') NOT NULL DEFAULT 'PAYSTACK',
  `environment` ENUM('TEST','LIVE') NOT NULL,
  `reference` VARCHAR(191) NOT NULL,
  `providerTransactionId` VARCHAR(191) NULL,
  `status` ENUM('CREATED','INITIALIZED','INITIALIZATION_UNKNOWN','PENDING','PROCESSING','SUCCEEDED','FAILED','ABANDONED','REQUIRES_REVIEW','REFUNDED','DISPUTED') NOT NULL DEFAULT 'CREATED',
  `currency` VARCHAR(3) NOT NULL DEFAULT 'NGN',
  `amountExpected` DECIMAL(14,2) NOT NULL,
  `amountRequested` DECIMAL(14,2) NULL,
  `amountCharged` DECIMAL(14,2) NULL,
  `providerFee` DECIMAL(14,2) NULL,
  `channel` VARCHAR(191) NULL,
  `payerEmail` VARCHAR(320) NULL,
  `paymentId` VARCHAR(191) NULL,
  `configurationSnapshot` JSON NULL,
  `providerMetadata` JSON NULL,
  `failureCode` VARCHAR(191) NULL,
  `failureMessage` TEXT NULL,
  `initializedAt` DATETIME(3) NULL,
  `verifiedAt` DATETIME(3) NULL,
  `paidAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GatewayTransaction_paymentId_key` (`paymentId`),
  UNIQUE INDEX `GatewayTransaction_provider_reference_key` (`provider`,`reference`),
  INDEX `GatewayTransaction_schoolId_status_createdAt_idx` (`schoolId`,`status`,`createdAt`),
  INDEX `GatewayTransaction_studentId_createdAt_idx` (`studentId`,`createdAt`),
  INDEX `GatewayTransaction_configurationId_idx` (`configurationId`),
  INDEX `GatewayTransaction_providerTransactionId_idx` (`providerTransactionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GatewayTransactionAllocation` (
  `id` VARCHAR(191) NOT NULL,
  `gatewayTransactionId` VARCHAR(191) NOT NULL,
  `chargeId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GatewayTransactionAllocation_gatewayTransactionId_chargeId_key` (`gatewayTransactionId`,`chargeId`),
  INDEX `GatewayTransactionAllocation_chargeId_idx` (`chargeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GatewayEvent` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NULL,
  `gatewayTransactionId` VARCHAR(191) NULL,
  `provider` ENUM('PAYSTACK') NOT NULL DEFAULT 'PAYSTACK',
  `environment` ENUM('TEST','LIVE') NOT NULL,
  `providerEventId` VARCHAR(191) NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `reference` VARCHAR(191) NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `payload` JSON NULL,
  `status` ENUM('PENDING','PROCESSING','PROCESSED','FAILED','IGNORED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NULL,
  `claimedAt` DATETIME(3) NULL,
  `processedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GatewayEvent_provider_environment_payloadHash_key` (`provider`,`environment`,`payloadHash`),
  UNIQUE INDEX `GatewayEvent_provider_environment_providerEventId_key` (`provider`,`environment`,`providerEventId`),
  INDEX `GatewayEvent_status_nextAttemptAt_receivedAt_idx` (`status`,`nextAttemptAt`,`receivedAt`),
  INDEX `GatewayEvent_reference_idx` (`reference`),
  INDEX `GatewayEvent_schoolId_receivedAt_idx` (`schoolId`,`receivedAt`),
  INDEX `GatewayEvent_gatewayTransactionId_idx` (`gatewayTransactionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SchoolPaymentConfiguration` ADD CONSTRAINT `SchoolPaymentConfiguration_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GatewayTransaction` ADD CONSTRAINT `GatewayTransaction_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `GatewayTransaction` ADD CONSTRAINT `GatewayTransaction_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `GatewayTransaction` ADD CONSTRAINT `GatewayTransaction_termId_fkey`
  FOREIGN KEY (`termId`) REFERENCES `Term`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `GatewayTransaction` ADD CONSTRAINT `GatewayTransaction_configurationId_fkey`
  FOREIGN KEY (`configurationId`) REFERENCES `SchoolPaymentConfiguration`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `GatewayTransaction` ADD CONSTRAINT `GatewayTransaction_paymentId_fkey`
  FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `GatewayTransactionAllocation` ADD CONSTRAINT `GatewayTransactionAllocation_gatewayTransactionId_fkey`
  FOREIGN KEY (`gatewayTransactionId`) REFERENCES `GatewayTransaction`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `GatewayTransactionAllocation` ADD CONSTRAINT `GatewayTransactionAllocation_chargeId_fkey`
  FOREIGN KEY (`chargeId`) REFERENCES `StudentCharge`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `GatewayEvent` ADD CONSTRAINT `GatewayEvent_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `GatewayEvent` ADD CONSTRAINT `GatewayEvent_gatewayTransactionId_fkey`
  FOREIGN KEY (`gatewayTransactionId`) REFERENCES `GatewayTransaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
