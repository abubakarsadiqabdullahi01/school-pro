import { GatewayTransactionsView } from "@/components/payments/gateway-transactions-view"

export default async function AccountantOnlinePaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <GatewayTransactionsView basePath="/dashboard/accountant" searchParams={await searchParams} />
}
