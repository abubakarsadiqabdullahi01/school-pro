-- Returning held dedicated-account money outside DigiSchool is a refund, and refunds take
-- two people. One person records the return (returnRequestedBy/At); a different person
-- confirms it before the row closes as RETURNED. Additive only: existing rows have no
-- pending return.

ALTER TABLE `UnappliedPayment` ADD COLUMN `returnRequestedAt` DATETIME(3) NULL,
    ADD COLUMN `returnRequestedBy` VARCHAR(191) NULL;
