# Integrity reconciliation

Administrators can run a full check from **School Management → System Integrity**. Each run
is stored in `DataIntegrityCheck`, including the exact affected record IDs.

For unattended checks, schedule this command once per night from the deployment scheduler:

```text
npm run check:integrity
```

The command checks every active school and exits non-zero if the check itself cannot run.
Detected business-data issues are persisted and displayed in the dashboard; they do not
cause an automatic data rewrite.

The reconciliation covers:

- the database current-session/current-term pointer and compatibility flags;
- completed and refunded receipt allocation totals;
- student-charge paid and outstanding balances;
- expense and payroll reversal evidence;
- payroll totals and linked expenditure status;
- published-result grading and assessment-policy snapshots;
- immutable enrollment-history coverage.

Refunds and reversals are performed only through their module actions. Do not edit statuses
directly in the database: the action updates balances, linked records, reversal evidence and
the audit log in one transaction.
