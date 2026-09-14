-- Per-school promotion policy.
--
-- Two independent switches deciding whether students may be promoted at the end of a term:
-- whether results must be published first, and whether an academic bar applies. Both
-- default to false so enabling either is a deliberate act and an existing school's
-- behaviour does not change when this ships.

-- CreateTable
CREATE TABLE `TransitionPolicy` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `requireResultsPublished` BOOLEAN NOT NULL DEFAULT false,
    `usePromotionCriteria` BOOLEAN NOT NULL DEFAULT false,
    `promotionMinAverage` DECIMAL(5, 2) NULL,
    `minSubjectsPassed` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TransitionPolicy_schoolId_key`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TransitionPolicy` ADD CONSTRAINT `TransitionPolicy_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

