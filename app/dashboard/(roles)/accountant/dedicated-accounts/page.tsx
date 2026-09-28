import { DedicatedAccountsView } from "@/components/payments/dedicated-accounts-view"

export const metadata = { title: "Dedicated accounts" }

export default async function AccountantDedicatedAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DedicatedAccountsView basePath="/dashboard/accountant" searchParams={await searchParams} />
}
