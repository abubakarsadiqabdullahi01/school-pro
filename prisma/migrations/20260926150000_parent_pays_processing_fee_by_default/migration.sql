-- A school adopting online payment is not volunteering to lose 1.5% of its fees, so a new
-- configuration now puts Paystack's processing fee on the payer. This changes the default
-- only: every existing row keeps the policy its school already chose.
ALTER TABLE `SchoolPaymentConfiguration`
  ALTER COLUMN `feePolicy` SET DEFAULT 'PARENT_PAYS_GROSS_UP';
