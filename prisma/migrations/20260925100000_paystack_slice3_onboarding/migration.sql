-- Secure school-owned Paystack connections. The master encryption key is environment-only.

CREATE TABLE `PaymentGatewayCredential` (
  `id` VARCHAR(191) NOT NULL,
  `configurationId` VARCHAR(191) NOT NULL,
  `encryptedSecret` TEXT NOT NULL,
  `initializationVector` VARCHAR(24) NOT NULL,
  `authenticationTag` VARCHAR(32) NOT NULL,
  `secretLast4` VARCHAR(4) NOT NULL,
  `publicKey` VARCHAR(191) NULL,
  `webhookToken` CHAR(64) NOT NULL,
  `keyVersion` INTEGER NOT NULL DEFAULT 1,
  `rotatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PaymentGatewayCredential_configurationId_key` (`configurationId`),
  UNIQUE INDEX `PaymentGatewayCredential_webhookToken_key` (`webhookToken`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PaymentGatewayCredential` ADD CONSTRAINT `PaymentGatewayCredential_configurationId_fkey`
  FOREIGN KEY (`configurationId`) REFERENCES `SchoolPaymentConfiguration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
