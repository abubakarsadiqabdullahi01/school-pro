import { UnappliedPaymentsView } from "@/components/payments/dedicated-accounts-view"

export const metadata = { title: "Unapplied money" }

export default async function AdminUnappliedPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <UnappliedPaymentsView basePath="/dashboard/admin/finance" searchParams={await searchParams} />
}
