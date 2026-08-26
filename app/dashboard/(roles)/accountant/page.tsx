import { FinanceDashboardView } from "@/components/finance/views/finance-dashboard-view"

// canManageFees is false: configuring fee schedules is the admin's job, and
// createFeeSchedule rejects an accountant even if they reach the URL directly.
export default function AccountantFinancePage() {
  return <FinanceDashboardView basePath="/dashboard/accountant" canManageFees={false} />
}
