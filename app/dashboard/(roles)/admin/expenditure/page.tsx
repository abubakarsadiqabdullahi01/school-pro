import { ExpenditureDashboardView } from "@/components/expenditure/views/expenditure-dashboard-view"

export default function AdminExpenditurePage() {
  return <ExpenditureDashboardView basePath="/dashboard/admin/expenditure" canManage />
}
