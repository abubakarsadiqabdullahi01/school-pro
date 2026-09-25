-- Result notifications by SMS and email.
--
-- An outbox rather than an inline send. cPanel has no persistent worker process, so nothing
-- can sit in memory waiting to go out, and sending from inside a request would mean a
-- bursar's browser hanging through four hundred provider round trips with no record of what
-- happened when it failed halfway.
--
-- Every column added to an existing table is defaulted, so this is safe to apply to a live
-- school database without a backfill.

-- ---------------------------------------------------------------------------
-- 1. Consent
-- ---------------------------------------------------------------------------
-- Both default true. Every existing account was created on the understanding that the
-- school may contact them, and defaulting to false would silently mute a whole school on
-- the day this ships. Turning one off is a deliberate act.
ALTER TABLE `users`
    ADD COLUMN `notifyBySms` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notifyByEmail` BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2. The outbox
-- ---------------------------------------------------------------------------
-- `dedupeKey` with its unique constraint is what makes a retry safe: publishing a class's
-- results twice, or a cron run overlapping itself, must not text every family twice. The
-- second attempt collides at the database rather than relying on the caller to remember.
--
-- NULLs do not collide in a MySQL unique index, which is exactly the behaviour wanted here:
-- a message with no dedupe key is one the caller has said may legitimately repeat.
CREATE TABLE `NotificationOutbox` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `channel` ENUM('SMS', 'EMAIL') NOT NULL,
    `recipient` VARCHAR(191) NOT NULL,
    `recipientUserId` VARCHAR(191) NULL,
    `studentId` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `templateKey` VARCHAR(191) NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `status` ENUM('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 3,
    `provider` VARCHAR(191) NULL,
    `providerMessageId` VARCHAR(191) NULL,
    `lastError` TEXT NULL,
    `units` INTEGER NOT NULL DEFAULT 1,
    `queuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `triggeredBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NotificationOutbox_schoolId_dedupeKey_key`(`schoolId`, `dedupeKey`),
    INDEX `NotificationOutbox_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `NotificationOutbox_schoolId_channel_status_idx`(`schoolId`, `channel`, `status`),
    INDEX `NotificationOutbox_studentId_idx`(`studentId`),
    INDEX `NotificationOutbox_queuedAt_idx`(`queuedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `NotificationOutbox` ADD CONSTRAINT `NotificationOutbox_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Per-school wording
-- ---------------------------------------------------------------------------
-- A school with no row here falls back to the built-in defaults, so notifications work
-- before anybody has configured anything.
CREATE TABLE `NotificationTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `templateKey` VARCHAR(191) NOT NULL,
    `channel` ENUM('SMS', 'EMAIL') NOT NULL,
    `subject` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NotificationTemplate_schoolId_templateKey_channel_key`(`schoolId`, `templateKey`, `channel`),
    INDEX `NotificationTemplate_schoolId_isActive_idx`(`schoolId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `NotificationTemplate` ADD CONSTRAINT `NotificationTemplate_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
