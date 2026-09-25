-- Three features that each needed somewhere to put their answer.
--
--  1. Promotion rules per class, and a frozen end-of-session decision the annual report
--     card can print. `ClassPromotionPolicy` overrides the school-wide `TransitionPolicy`;
--     `AnnualResultDecision` is the snapshot, deliberately separate from the policy so that
--     editing a rule next year cannot rewrite what was decided this year.
--  2. A teacher added on the academic side becoming visible to HR, with the paperwork
--     tracked rather than assumed.
--  3. (No schema change - the idle-session work writes `LoginSession.lastActivity`, which
--     already exists.)
--
-- Every column added to an existing table is nullable or defaulted, so this migration is
-- safe to apply to a live school database without a backfill step.

-- ---------------------------------------------------------------------------
-- 1. Credit-based promotion on the school-wide policy
-- ---------------------------------------------------------------------------
-- `minSubjectsPassed` counts against the grading system's pass mark (40 by default).
-- A credit is the higher bar schools actually promote on, so it needs its own count and
-- its own threshold. NULL means credits are not counted, which is how every existing row
-- behaves - no change for a school that has already configured a policy.
ALTER TABLE `TransitionPolicy`
    ADD COLUMN `minCreditsRequired` INTEGER NULL,
    ADD COLUMN `creditMark` DECIMAL(5, 2) NOT NULL DEFAULT 50.00;

-- ---------------------------------------------------------------------------
-- 2. Per-class promotion policy
-- ---------------------------------------------------------------------------
CREATE TABLE `ClassPromotionPolicy` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `requireResultsPublished` BOOLEAN NOT NULL DEFAULT false,
    `usePromotionCriteria` BOOLEAN NOT NULL DEFAULT true,
    `promotionMinAverage` DECIMAL(5, 2) NULL,
    `minSubjectsPassed` INTEGER NULL,
    `minCreditsRequired` INTEGER NULL,
    `creditMark` DECIMAL(5, 2) NOT NULL DEFAULT 50.00,
    `evaluationScope` ENUM('TERM', 'SESSION_AVERAGE') NOT NULL DEFAULT 'SESSION_AVERAGE',
    `requiredSubjectIds` JSON NULL,
    `minCoreSubjectsPassed` INTEGER NULL,
    `requireAllSubjectsEntered` BOOLEAN NOT NULL DEFAULT false,
    `allowManualOverride` BOOLEAN NOT NULL DEFAULT true,
    `isGraduatingClass` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ClassPromotionPolicy_classId_key`(`classId`),
    INDEX `ClassPromotionPolicy_schoolId_idx`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ClassPromotionPolicy` ADD CONSTRAINT `ClassPromotionPolicy_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ClassPromotionPolicy` ADD CONSTRAINT `ClassPromotionPolicy_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. The frozen end-of-session decision
-- ---------------------------------------------------------------------------
-- One row per learner per session. `decidedBy` and `approvedBy` are user ids without
-- foreign keys on purpose: who decided a child repeats a year must survive that member of
-- staff being deleted, the same reasoning as `Assessment.publishedBy`.
CREATE TABLE `AnnualResultDecision` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `decision` ENUM('PENDING', 'PROMOTED', 'REPEATED', 'GRADUATED') NOT NULL DEFAULT 'PENDING',
    `principalComment` TEXT NULL,
    `sessionAverage` DECIMAL(5, 2) NULL,
    `subjectsOffered` INTEGER NOT NULL DEFAULT 0,
    `subjectsPassed` INTEGER NOT NULL DEFAULT 0,
    `creditsEarned` INTEGER NOT NULL DEFAULT 0,
    `termsCounted` INTEGER NOT NULL DEFAULT 0,
    `policyBasis` JSON NULL,
    `reasons` JSON NULL,
    `isOverride` BOOLEAN NOT NULL DEFAULT false,
    `overrideReason` TEXT NULL,
    `decidedBy` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AnnualResultDecision_studentId_sessionId_key`(`studentId`, `sessionId`),
    INDEX `AnnualResultDecision_schoolId_sessionId_idx`(`schoolId`, `sessionId`),
    INDEX `AnnualResultDecision_classId_sessionId_idx`(`classId`, `sessionId`),
    INDEX `AnnualResultDecision_sessionId_decision_idx`(`sessionId`, `decision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AnnualResultDecision` ADD CONSTRAINT `AnnualResultDecision_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AnnualResultDecision` ADD CONSTRAINT `AnnualResultDecision_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AnnualResultDecision` ADD CONSTRAINT `AnnualResultDecision_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AnnualResultDecision` ADD CONSTRAINT `AnnualResultDecision_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. HR onboarding
-- ---------------------------------------------------------------------------
-- `onboardingStatus` defaults to COMPLETE so that every row already in this table stays
-- exactly as it is. That default is not a shortcut: a staff record only reaches this table
-- today by an HR officer filling in the staff form with the person in front of them. The
-- records that genuinely are incomplete are the ones the new teacher-provisioning path
-- creates, and that path writes NOT_STARTED explicitly.
ALTER TABLE `Staff`
    ADD COLUMN `onboardingStatus` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE') NOT NULL DEFAULT 'COMPLETE',
    ADD COLUMN `autoProvisioned` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `Staff_schoolId_onboardingStatus_idx` ON `Staff`(`schoolId`, `onboardingStatus`);

CREATE TABLE `StaffDocument` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `type` ENUM('APPOINTMENT_LETTER', 'IDENTIFICATION', 'QUALIFICATION_CERTIFICATE', 'BIRTH_CERTIFICATE', 'MEDICAL_REPORT', 'REFERENCE_LETTER', 'GUARANTOR_FORM', 'CONTRACT', 'OTHER') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NULL,
    `fileSize` INTEGER NULL,
    `mimeType` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NULL,
    `uploadedBy` VARCHAR(191) NULL,
    `verifiedBy` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffDocument_staffId_type_idx`(`staffId`, `type`),
    INDEX `StaffDocument_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StaffDocument` ADD CONSTRAINT `StaffDocument_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
