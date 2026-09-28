import { GatewayTransactionsView } from "@/components/payments/gateway-transactions-view"

export default async function AdminOnlinePaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <GatewayTransactionsView basePath="/dashboard/admin/finance" searchParams={await searchParams} />
}
