-- Data only: brings the stored built-in permission profiles in line with
-- SYSTEM_PERMISSION_PROFILES in lib/permissions.ts.
--
-- HR ("HR and Payroll Officer") gains teachers.manage: employment runs through HR, and
-- hiring a teacher creates their login and their HR staff record in one step.
--
-- FINANCE ("Finance Officer") loses finance.setup: that key carries fee schedules,
-- discounts, exemptions and finance logins, and a bursar who collects cash must not also be
-- able to waive the charge it paid.
--
-- Only rows flagged isSystem are touched. A school's own custom profiles are its decision.
-- ensureSystemPermissionProfiles() writes the same values whenever the permissions screen
-- is opened; this makes the change take effect without waiting for that.

UPDATE `PermissionProfile`
SET `permissions` = JSON_ARRAY('teachers.manage', 'payroll.manage', 'payroll.pay', 'reports.export'),
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `isSystem` = true AND `code` = 'HR';

UPDATE `PermissionProfile`
SET `permissions` = JSON_ARRAY('finance.collect_payments', 'finance.view_reports', 'expenditure.manage', 'payroll.pay', 'reports.export'),
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `isSystem` = true AND `code` = 'FINANCE';
