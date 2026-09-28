import { DedicatedAccountsView } from "@/components/payments/dedicated-accounts-view"

export const metadata = { title: "Dedicated accounts" }

export default async function AdminDedicatedAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DedicatedAccountsView basePath="/dashboard/admin/finance" searchParams={await searchParams} />
}
