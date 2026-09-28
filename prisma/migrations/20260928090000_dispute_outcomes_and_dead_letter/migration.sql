-- A chargeback upheld against the school reverses a payment with no person behind it, so
-- the reversal's author becomes optional. Every reversal a member of staff makes still
-- records who made it; a null now means the provider did this, which is the truth.
ALTER TABLE `AccountingReversal`
  MODIFY `createdBy` VARCHAR(191) NULL;

-- An event that can never succeed used to keep its place in the retry queue for ever,
-- backing off to six hours and then trying again until someone noticed. A parked event is
-- a different thing from one still being retried, and finance needs to be able to see it.
ALTER TABLE `GatewayEvent`
  MODIFY `status` ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED', 'DEAD') NOT NULL DEFAULT 'PENDING';
