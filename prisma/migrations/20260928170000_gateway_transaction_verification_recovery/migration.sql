-- Durable recovery for online checkouts whose provider webhook never arrives.
--
-- lib/payments/transaction-verification.server.ts verifies a checkout with its provider on
-- behalf of the parent's callback, signed-webhook processing and the process-events cron.
-- The cron claims each row before verifying it (verificationClaimedAt), counts attempts,
-- backs off between them (nextVerificationAt) and parks a checkout for review after
-- repeated provider errors, keeping the last one (lastVerificationError). Overlapping cron
-- runs therefore cannot verify or post the same checkout twice.
--
-- Additive only: existing rows start with no claim, no scheduled retry and zero attempts,
-- which makes every open checkout immediately eligible for recovery.

ALTER TABLE `GatewayTransaction` ADD COLUMN `lastVerificationError` TEXT NULL,
    ADD COLUMN `nextVerificationAt` DATETIME(3) NULL,
    ADD COLUMN `verificationAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `verificationClaimedAt` DATETIME(3) NULL;

CREATE INDEX `GatewayTransaction_status_nextVerificationAt_idx` ON `GatewayTransaction`(`status`, `nextVerificationAt`);
