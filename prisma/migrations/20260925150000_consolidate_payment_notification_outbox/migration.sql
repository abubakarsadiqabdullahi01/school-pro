-- Payment receipts use the application's shared NotificationOutbox, which already owns
-- consent, channel delivery, retries, reporting, and deduplication.
DROP TABLE `GatewayNotificationOutbox`;
