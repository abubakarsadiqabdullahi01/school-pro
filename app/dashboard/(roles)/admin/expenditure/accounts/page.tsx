import { PaymentAccountsView } from "@/components/expenditure/views/payment-accounts-view"

// Admin tree only, for the same reason as categories: configuring where money leaves from is
// the admin's authority, and the write actions refuse an accountant regardless of the URL.
export default async function PaymentAccountsPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the screen's filters are checked in one
  // place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <PaymentAccountsView basePath="/dashboard/admin/expenditure" searchParams={await searchParams} />
}
