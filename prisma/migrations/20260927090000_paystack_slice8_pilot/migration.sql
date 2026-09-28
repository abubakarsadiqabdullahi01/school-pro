-- Paystack Slice 8: the live pilot gate and the two-person refund rule.
--
-- A school can switch LIVE payments on only after the platform owner approves it, and may
-- be held to a per-checkout ceiling while it pilots. No existing LIVE configuration is
-- approved here: live money stays off until a super admin approves each school.
-- AlterTable
ALTER TABLE `SchoolPaymentConfiguration` ADD COLUMN `liveApprovedAt` DATETIME(3) NULL,
    ADD COLUMN `liveApprovedBy` VARCHAR(191) NULL,
    ADD COLUMN `pilotMaxAmount` DECIMAL(14, 2) NULL;

-- AlterTable
ALTER TABLE `GatewayRefund` ADD COLUMN `approvedAt` DATETIME(3) NULL,
    ADD COLUMN `approvedBy` VARCHAR(191) NULL,
    ADD COLUMN `rejectedAt` DATETIME(3) NULL,
    ADD COLUMN `rejectedBy` VARCHAR(191) NULL,
    ADD COLUMN `rejectionReason` VARCHAR(500) NULL,
    MODIFY `status` ENUM('REQUESTED', 'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'NEEDS_ATTENTION', 'REJECTED') NOT NULL DEFAULT 'REQUESTED';


-- Refunds already submitted to Paystack went out under the old one-person flow. Record the
-- requester as the approver so every submitted refund reads as approved; only a refund
-- still sitting in REQUESTED now waits for a second person.
UPDATE `GatewayRefund`
  SET `approvedBy` = `requestedBy`, `approvedAt` = `createdAt`
  WHERE `status` <> 'REQUESTED';
