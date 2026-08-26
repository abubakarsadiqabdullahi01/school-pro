-- Gate 5 / item 1.4 — release provenance for results
--
-- Removes four columns that promised a revision history nobody built, and adds the two
-- that a publish workflow actually needs.
--
-- `version`, `previousVersionId`, `isDraft` and `submittedAt` sat on `assessments` under a
-- "Version control" comment and were never read or written anywhere in app/, lib/ or
-- components/ — confirmed by search, and by the T11 probe in scripts/qa-critical.ts which
-- existed to report exactly that. Every row therefore holds nothing but its default, so
-- dropping them loses no data.
--
-- The need they described — being able to answer "who changed this grade, and what was it
-- before" — is now met properly by the AuditLog table, which records each score save with
-- its actor and before/after state. Carrying dead columns that imply an audit trail is
-- worse than not having one, because someone will eventually trust them.
--
-- In their place: who released a set of results, and when. `isPublished` alone could not
-- answer either, and there was no way to walk a mistaken release back.

-- AlterTable
ALTER TABLE `assessments` DROP COLUMN `isDraft`,
    DROP COLUMN `previousVersionId`,
    DROP COLUMN `submittedAt`,
    DROP COLUMN `version`,
    ADD COLUMN `publishedAt` DATETIME(3) NULL,
    ADD COLUMN `publishedBy` VARCHAR(191) NULL;

-- Backfill: rows already marked published have no release date on record. Left NULL
-- deliberately rather than invented — "published, date unknown" is the truth, and stamping
-- today's date would be a fabricated audit record.

-- CreateIndex
CREATE INDEX `assessments_publishedAt_idx` ON `assessments`(`publishedAt`);
