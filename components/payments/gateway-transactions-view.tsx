import Link from "next/link"
import { AlertTriangle, CheckCircle2, Clock3, CreditCard, Landmark, Search } from "lucide-react"

import { getGatewayTransactionRegister } from "@/app/actions/gateway-operations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InfoGuide } from "@/components/ui/info-guide"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatNaira } from "@/lib/money"
import { GATEWAY_STATUS_LABELS, gatewayStatusTone } from "@/lib/payments/gateway-display"

export async function GatewayTransactionsView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const query = typeof searchParams.q === "string" ? searchParams.q : ""
  const status = typeof searchParams.status === "string" && searchParams.status in GATEWAY_STATUS_LABELS
    ? searchParams.status as keyof typeof GATEWAY_STATUS_LABELS
    : undefined
  const environment = searchParams.environment === "TEST" || searchParams.environment === "LIVE"
    ? searchParams.environment
    : undefined
  const result = await getGatewayTransactionRegister({ query, status, environment })

  if (!result.success) return <p className="text-destructive" role="alert">{result.error}</p>
  const { rows, total, capped, attention, pending } = result.data

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <CreditCard className="h-7 w-7 text-primary" aria-hidden />
          <h1 className="text-3xl font-bold tracking-tight">Online Payments</h1>
          <InfoGuide guideKey="finance.onlinePayments" />
        </div>
        <p className="text-muted-foreground">
          Track every Paystack attempt from checkout through webhook confirmation and the finance ledger.
        </p>
      </div>
      <div className="flex justify-end"><Button asChild variant="outline"><Link href={`${basePath}/online-payments/reconciliation`}><Landmark className="mr-2 h-4 w-4" />Refunds & reconciliation</Link></Button></div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric title="Matching transactions" value={total} icon={<CreditCard className="h-4 w-4" />} />
        <Metric title="Pending confirmation" value={pending} icon={<Clock3 className="h-4 w-4 text-amber-600" />} />
        <Metric title="Needs attention" value={attention} icon={<AlertTriangle className="h-4 w-4 text-red-600" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find a gateway transaction</CardTitle>
          <CardDescription>Search by reference, provider ID, payer email, student or admission number.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_10rem_auto]" method="get">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input name="q" defaultValue={query} className="pl-9" aria-label="Search online payments" placeholder="Reference, student or email" />
            </div>
            <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Payment status">
              <option value="">All statuses</option>
              {Object.entries(GATEWAY_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select name="environment" defaultValue={environment ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Paystack environment">
              <option value="">Test and live</option>
              <option value="TEST">Test</option>
              <option value="LIVE">Live</option>
            </select>
            <div className="flex gap-2">
              <Button type="submit">Apply</Button>
              {(query || status || environment) && <Button asChild variant="outline"><Link href={`${basePath}/online-payments`}>Clear</Link></Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction register</CardTitle>
          <CardDescription>{total} matching attempt{total === 1 ? "" : "s"}{capped ? " · showing the newest 250" : ""}</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">No online payment matches these filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead><TableHead>Channel</TableHead><TableHead className="text-right">School fees</TableHead>
                  <TableHead>Receipt</TableHead><TableHead><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell><span className="font-medium">{row.studentName}</span><br /><span className="text-xs text-muted-foreground">{row.student.admissionNo}</span></TableCell>
                    <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                    <TableCell><Badge variant="outline" className={gatewayStatusTone(row.status)}>{GATEWAY_STATUS_LABELS[row.status]}</Badge></TableCell>
                    <TableCell>{row.channel?.replaceAll("_", " ") ?? "—"}<br /><span className="text-xs text-muted-foreground">{row.environment.toLowerCase()}</span></TableCell>
                    <TableCell className="text-right font-medium">{formatNaira(row.amountExpected)}</TableCell>
                    <TableCell>{row.payment ? <Link className="text-primary underline-offset-4 hover:underline" href={`${basePath}/receipts/${row.payment.id}`}>{row.payment.receiptNo}</Link> : "—"}</TableCell>
                    <TableCell><Button asChild size="sm" variant="outline"><Link href={`${basePath}/online-payments/${row.id}`}>Details</Link></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{title}</p><p className="text-2xl font-bold">{value}</p></div>{icon}</CardContent></Card>
}
