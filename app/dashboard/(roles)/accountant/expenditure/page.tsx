import { ExpenditureDashboardView } from "@/components/expenditure/views/expenditure-dashboard-view"

export default function AccountantExpenditurePage() {
  return <ExpenditureDashboardView basePath="/dashboard/accountant/expenditure" canManage={false} />
}
