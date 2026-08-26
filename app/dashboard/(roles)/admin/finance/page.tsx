import { FinanceDashboardView } from "@/components/finance/views/finance-dashboard-view"

// Only ADMIN and SUPER_ADMIN reach this tree (see ../layout.tsx), so fee configuration
// is always offered here. The accountant tree renders the same view with it hidden.
export default function FinanceDashboardPage() {
  return <FinanceDashboardView basePath="/dashboard/admin/finance" canManageFees />
}
