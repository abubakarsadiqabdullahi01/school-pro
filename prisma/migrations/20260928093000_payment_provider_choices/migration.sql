-- A school keeps one configuration per gateway, so these columns have to know the gateways
-- before a school can be moved onto one. Only Paystack is implemented today; adding the
-- values now means switching a school later is a settings change rather than a schema
-- migration run by hand through phpMyAdmin against a live database.
--
-- Every table carrying the provider is altered together. Leaving any one behind would let
-- a transaction exist that its own refund, dispute or settlement row could not name.
ALTER TABLE `SchoolPaymentConfiguration`
  MODIFY `provider` ENUM('PAYSTACK', 'MONNIFY', 'FLUTTERWAVE') NOT NULL DEFAULT 'PAYSTACK';

ALTER TABLE `GatewayTransaction`
  MODIFY `provider` ENUM('PAYSTACK', 'MONNIFY', 'FLUTTERWAVE') NOT NULL DEFAULT 'PAYSTACK';

ALTER TABLE `GatewayEvent`
  MODIFY `provider` ENUM('PAYSTACK', 'MONNIFY', 'FLUTTERWAVE') NOT NULL DEFAULT 'PAYSTACK';

ALTER TABLE `GatewayRefund`
  MODIFY `provider` ENUM('PAYSTACK', 'MONNIFY', 'FLUTTERWAVE') NOT NULL DEFAULT 'PAYSTACK';

ALTER TABLE `GatewayDispute`
  MODIFY `provider` ENUM('PAYSTACK', 'MONNIFY', 'FLUTTERWAVE') NOT NULL DEFAULT 'PAYSTACK';

ALTER TABLE `GatewaySettlement`
  MODIFY `provider` ENUM('PAYSTACK', 'MONNIFY', 'FLUTTERWAVE') NOT NULL DEFAULT 'PAYSTACK';

ALTER TABLE `DedicatedAccount`
  MODIFY `provider` ENUM('PAYSTACK', 'MONNIFY', 'FLUTTERWAVE') NOT NULL DEFAULT 'PAYSTACK';
