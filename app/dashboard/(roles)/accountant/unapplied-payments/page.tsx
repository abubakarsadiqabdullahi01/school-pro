import { UnappliedPaymentsView } from "@/components/payments/dedicated-accounts-view"

export const metadata = { title: "Unapplied money" }

export default async function AccountantUnappliedPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <UnappliedPaymentsView basePath="/dashboard/accountant" searchParams={await searchParams} />
}
