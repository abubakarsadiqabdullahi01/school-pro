-- Widen SystemConfiguration.configValue from VARCHAR(191) to TEXT.
--
-- Found by actually running the backup script: recording its status payload — a JSON blob
-- with two ISO timestamps, a file path and a size — overflowed 191 characters and failed
-- with P2000. A settings value that cannot hold a file path is too small to be useful.
--
-- Widening a column is safe on a populated table and loses nothing.
ALTER TABLE `SystemConfiguration` MODIFY `configValue` TEXT NOT NULL;
