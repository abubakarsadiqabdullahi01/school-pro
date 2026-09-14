-- Flexible school role profiles and Compiler V2 workflow/promotion foundation.

CREATE TABLE `PermissionProfile` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` VARCHAR(500) NULL,
  `permissions` JSON NOT NULL,
  `isSystem` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PermissionProfile_schoolId_code_key`(`schoolId`, `code`),
  INDEX `PermissionProfile_schoolId_isActive_idx`(`schoolId`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserPermissionProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `profileId` VARCHAR(191) NOT NULL,
  `assignedBy` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `revokedAt` DATETIME(3) NULL,

  UNIQUE INDEX `UserPermissionProfile_userId_schoolId_profileId_key`(`userId`, `schoolId`, `profileId`),
  INDEX `UserPermissionProfile_schoolId_isActive_idx`(`schoolId`, `isActive`),
  INDEX `UserPermissionProfile_profileId_isActive_idx`(`profileId`, `isActive`),
  INDEX `UserPermissionProfile_assignedBy_idx`(`assignedBy`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ClassTermResultWorkflow` (
  `id` VARCHAR(191) NOT NULL,
  `classTermId` VARCHAR(191) NOT NULL,
  `status` ENUM('DRAFT', 'REVIEWED', 'PUBLISHED', 'LOCKED', 'WITHDRAWN') NOT NULL DEFAULT 'DRAFT',
  `reviewedBy` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `publishedBy` VARCHAR(191) NULL,
  `publishedAt` DATETIME(3) NULL,
  `lockedBy` VARCHAR(191) NULL,
  `lockedAt` DATETIME(3) NULL,
  `withdrawnBy` VARCHAR(191) NULL,
  `withdrawnAt` DATETIME(3) NULL,
  `notes` VARCHAR(1000) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ClassTermResultWorkflow_classTermId_key`(`classTermId`),
  INDEX `ClassTermResultWorkflow_status_updatedAt_idx`(`status`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ResultWorkflowEvent` (
  `id` VARCHAR(191) NOT NULL,
  `workflowId` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `fromStatus` ENUM('DRAFT', 'REVIEWED', 'PUBLISHED', 'LOCKED', 'WITHDRAWN') NULL,
  `toStatus` ENUM('DRAFT', 'REVIEWED', 'PUBLISHED', 'LOCKED', 'WITHDRAWN') NOT NULL,
  `actorId` VARCHAR(191) NOT NULL,
  `actorName` VARCHAR(191) NOT NULL,
  `actorRole` ENUM('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'TEACHER', 'PARENT', 'STUDENT') NOT NULL,
  `note` VARCHAR(1000) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ResultWorkflowEvent_workflowId_createdAt_idx`(`workflowId`, `createdAt`),
  INDEX `ResultWorkflowEvent_actorId_createdAt_idx`(`actorId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TransitionPolicy`
  ADD COLUMN `evaluationScope` ENUM('TERM', 'SESSION_AVERAGE') NOT NULL DEFAULT 'TERM',
  ADD COLUMN `requiredSubjectIds` JSON NULL,
  ADD COLUMN `minCoreSubjectsPassed` INTEGER NULL,
  ADD COLUMN `requireAllSubjectsEntered` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `allowManualOverride` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `PermissionProfile`
  ADD CONSTRAINT `PermissionProfile_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserPermissionProfile`
  ADD CONSTRAINT `UserPermissionProfile_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserPermissionProfile`
  ADD CONSTRAINT `UserPermissionProfile_profileId_fkey`
  FOREIGN KEY (`profileId`) REFERENCES `PermissionProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserPermissionProfile`
  ADD CONSTRAINT `UserPermissionProfile_assignedBy_fkey`
  FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ClassTermResultWorkflow`
  ADD CONSTRAINT `ClassTermResultWorkflow_classTermId_fkey`
  FOREIGN KEY (`classTermId`) REFERENCES `ClassTerm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ResultWorkflowEvent`
  ADD CONSTRAINT `ResultWorkflowEvent_workflowId_fkey`
  FOREIGN KEY (`workflowId`) REFERENCES `ClassTermResultWorkflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ResultWorkflowEvent`
  ADD CONSTRAINT `ResultWorkflowEvent_actorId_fkey`
  FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
