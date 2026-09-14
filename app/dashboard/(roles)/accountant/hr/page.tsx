import { HrDashboardView } from "@/components/hr/views/hr-dashboard-view"

export default function AccountantHrPage() {
  return <HrDashboardView basePath="/dashboard/accountant/hr" canManage={false} />
}
