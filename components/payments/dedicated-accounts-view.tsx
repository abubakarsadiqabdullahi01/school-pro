import Link from "next/link"
import { AlertTriangle, Landmark, Search, Wallet } from "lucide-react"

import { getDedicatedAccountOverview, getUnappliedPayments } from "@/app/actions/dedicated-accounts"
import {
  AssignMissingButton,
  AssignOneButton,
  DeactivateAccountButton,
  DedicatedAccountSettings,
  IdentifyPayerButton,
  MoveBackToHeldButton,
  RefundHeldMoneyButton,
  RequiresIdentificationSwitch,
  UnappliedActions,
} from "@/components/payments/dedicated-account-controls"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InfoGuide } from "@/components/ui/info-guide"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getEffectivePermissionsForCurrentUser } from "@/lib/authz"
import { formatNaira } from "@/lib/money"

export async function DedicatedAccountsView({ basePath, searchParams }: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const query = typeof searchParams.q === "string" ? searchParams.q : ""
  const missingOnly = searchParams.missing === "1"
  const [result, permissions] = await Promise.all([
    getDedicatedAccountOverview({ query: query || undefined, missingOnly }),
    getEffectivePermissionsForCurrentUser(),
  ])
  if (!result.success) return <p className="text-destructive" role="alert">{result.error}</p>
  const data = result.data
  const canManage = permissions.includes("finance.manage_gateway")
  const remaining = data.totals.students - data.totals.withAccount
  const ready = data.problems.length === 0

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Landmark className="h-7 w-7 text-primary" aria-hidden />
          <h1 className="text-3xl font-bold tracking-tight">Dedicated Accounts</h1>
          <InfoGuide guideKey="finance.dedicatedAccounts" />
        </div>
        <p className="text-muted-foreground">
          Each student gets a permanent account number. A parent can transfer any amount, any time, from any bank; it is
          credited to that student&apos;s oldest unpaid fees automatically.
        </p>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Settings <Badge variant="outline" className="ml-2">{data.environment}</Badge></CardTitle>
            <CardDescription>Paystack&apos;s transfer fee on these payments is deducted from the school&apos;s settlement; parents pay exactly what they send.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <DedicatedAccountSettings enabled={data.enabled} bank={data.bank} environment={data.environment} />
              <RequiresIdentificationSwitch enabled={data.enabled} bank={data.bank} requiresIdentification={data.requiresIdentification} />
            </div>
          </CardContent>
        </Card>
      )}

      {!ready && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Accounts cannot be created yet</AlertTitle>
          <AlertDescription><ul className="list-disc pl-4">{data.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Active students</CardDescription><CardTitle>{data.totals.students}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>With an account</CardDescription><CardTitle>{data.totals.withAccount}</CardTitle></CardHeader></Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Without one</CardDescription><CardTitle>{remaining}</CardTitle></CardHeader>
          {canManage && ready && remaining > 0 && <CardContent><AssignMissingButton remaining={remaining} /></CardContent>}
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex gap-2" action={`${basePath}/dedicated-accounts`}>
          <Input name="q" defaultValue={query} placeholder="Name or admission number" className="w-64" aria-label="Search students" />
          {missingOnly && <input type="hidden" name="missing" value="1" />}
          <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Search</Button>
        </form>
        <div className="flex gap-2">
          <Button asChild variant={missingOnly ? "outline" : "secondary"} size="sm"><Link href={`${basePath}/dedicated-accounts`}>All</Link></Button>
          <Button asChild variant={missingOnly ? "secondary" : "outline"} size="sm"><Link href={`${basePath}/dedicated-accounts?missing=1`}>Without account</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`${basePath}/unapplied-payments`}><Wallet className="mr-2 h-4 w-4" />Unapplied money</Link></Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Student</TableHead><TableHead>Admission no.</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.students.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No students match.</TableCell></TableRow>
            ) : data.students.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="font-medium">
                  {student.name}
                  {student.archived && (
                    <Badge variant="outline" className="ml-2 font-normal">Archived - deactivate this account</Badge>
                  )}
                </TableCell>
                <TableCell>{student.admissionNo}</TableCell>
                <TableCell>
                  {student.account
                    ? <span><span className="font-mono">{student.account.accountNumber}</span> · {student.account.bankName}<br /><span className="text-xs text-muted-foreground">{student.account.accountName}</span></span>
                    : <span className="text-muted-foreground">None</span>}
                </TableCell>
                <TableCell className="text-right">
                  {canManage && (student.account
                    ? <DeactivateAccountButton accountId={student.account.id} accountNumber={student.account.accountNumber} />
                    : ready && (!data.requiresIdentification || student.identification?.status === "SUCCEEDED"
                      ? <AssignOneButton studentId={student.id} />
                      : student.identification?.status === "PENDING"
                        ? <span className="text-xs text-muted-foreground">Paystack is checking the payer</span>
                        : (
                          <div className="flex flex-col items-end gap-1">
                            {student.identification?.status === "FAILED" && <span className="text-xs text-destructive">{student.identification.failureReason ?? "Identification failed"}</span>}
                            <IdentifyPayerButton studentId={student.id} environment={data.environment} />
                          </div>
                        )))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data.students.length === 200 && <p className="text-xs text-muted-foreground">Showing the first 200 students; search to narrow the list.</p>}
    </div>
  )
}

export async function UnappliedPaymentsView({ basePath, searchParams }: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const status = searchParams.status === "APPLIED" || searchParams.status === "RETURNED" ? searchParams.status : "OPEN"
  const [result, permissions] = await Promise.all([getUnappliedPayments({ status }), getEffectivePermissionsForCurrentUser()])
  if (!result.success) return <p className="text-destructive" role="alert">{result.error}</p>
  const canApply = permissions.includes("finance.collect_payments")
  const canReturn = permissions.includes("finance.manage_gateway")
  const canConfirmReturn = permissions.includes("finance.approve_refunds")
  const total = result.data.reduce((sum, row) => sum + Number(row.amount), 0)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Wallet className="h-7 w-7 text-primary" aria-hidden />
          <h1 className="text-3xl font-bold tracking-tight">Unapplied Money</h1>
          <InfoGuide guideKey="finance.unappliedPayments" />
        </div>
        <p className="text-muted-foreground">Transfers into dedicated accounts that were more than the student owed. Apply each one to fees once they are billed, or record that it was returned.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["OPEN", "APPLIED", "RETURNED"] as const).map((value) => (
            <Button key={value} asChild size="sm" variant={value === status ? "secondary" : "outline"}>
              <Link href={`${basePath}/unapplied-payments${value === "OPEN" ? "" : `?status=${value}`}`}>{value === "OPEN" ? "Held" : value === "APPLIED" ? "Applied" : "Returned"}</Link>
            </Button>
          ))}
        </div>
        <p className="text-sm font-medium">{result.data.length} · {formatNaira(total)}</p>
      </div>
      {result.data.length === 0 ? (
        <Card><CardHeader><CardTitle className="text-lg">Nothing here</CardTitle><CardDescription>{status === "OPEN" ? "No transfer is waiting on a decision." : "No records yet."}</CardDescription></CardHeader></Card>
      ) : (
        <div className="space-y-3">
          {result.data.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{formatNaira(row.amount)} · {row.studentName} <span className="text-muted-foreground">({row.admissionNo})</span></p>
                  <p className="text-sm text-muted-foreground">
                    From {row.senderName ?? "unknown sender"}{row.senderBank ? `, ${row.senderBank}` : ""}{row.paidAt ? ` on ${new Date(row.paidAt).toLocaleDateString("en-NG")}` : ""} ·{" "}
                    <Link className="underline-offset-4 hover:underline" href={`${basePath}/online-payments/${row.transactionId}`}>{row.reference}</Link>
                  </p>
                  {status === "OPEN" && <p className="text-sm">Owing now: {formatNaira(row.owingNow)}</p>}
                  {row.receiptNo && <p className="text-sm">Applied on receipt {row.receiptNo}</p>}
                  {row.resolutionNote && <p className="text-sm">{row.resolutionNote}</p>}
                </div>
                {status === "OPEN" && (
                  <div className="space-y-2 md:w-80">
                    <UnappliedActions id={row.id} canApply={canApply} canReturn={canReturn} canConfirmReturn={canConfirmReturn} pendingReturn={row.returnRequest} />
                    {canReturn && !row.returnRequest && <RefundHeldMoneyButton id={row.id} />}
                  </div>
                )}
                {status === "APPLIED" && canReturn && row.receiptNo && (
                  <div className="md:w-80"><MoveBackToHeldButton id={row.id} receiptNo={row.receiptNo} /></div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
