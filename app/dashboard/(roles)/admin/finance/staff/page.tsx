import { FinanceStaffView } from "@/components/finance/views/finance-staff-view"

// Admin tree only. Assigning finance staff is the admin's call, so this page has no
// counterpart under /dashboard/accountant.
export default async function FinanceStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <FinanceStaffView basePath="/dashboard/admin/finance" searchParams={await searchParams} />
}
