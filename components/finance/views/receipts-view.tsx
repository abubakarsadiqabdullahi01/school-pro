import Link from "next/link"

import { getFinanceSetupData, getReceiptRegister } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { ReceiptsRegisterTable } from "@/components/finance/views/receipts-register-table"
import { BrandedPrintHeader, BrandedReportExport } from "@/components/reports/branded"
import { PeriodFilter } from "@/components/reports/period-filter"
import type { ExportTable } from "@/components/reports/report-export"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatNaira, formatNairaPlain, toCsvAmount } from "@/lib/money"

/**
 * Every receipt the school has issued.
 *
 * The register exists so a receipt can be found by its number, by the student, or by the
 * bank reference — previously the only route to one was through the payment that created it,
 * which is no use when a parent turns up holding a printed slip.
 */
export async function ReceiptsView({
  basePath,
  termId,
  search,
}: {
  basePath: string
  termId?: string
  search?: string
}) {
  const [register, setup] = await Promise.all([
    getReceiptRegister({ termId, search }),
    getFinanceSetupData(),
  ])

  if (!register.success) {
    return <p className="text-destructive">{register.error}</p>
  }

  const rows = register.data
  const termName = setup.success ? setup.data.terms.find((term) => term.id === termId)?.name : undefined
  const scope = termName ?? "All terms"
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString()

  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0)

  const exportTable: ExportTable = {
    columns: ["Date", "Receipt No", "Student", "Admission No", "Class", "Method", "Status", "Amount", "Received By"],
    rows: rows.map((row) => [
      formatDate(row.paymentDate),
      row.receiptNo,
      row.studentName,
      row.admissionNo,
      row.className ?? "-",
      row.method.replace("_", " "),
      row.status,
      formatNairaPlain(row.amount),
      row.receivedByName ?? "-",
    ]),
    csvRows: rows.map((row) => [
      row.paymentDate.slice(0, 10),
      row.receiptNo,
      row.studentName,
      row.admissionNo,
      row.className ?? "",
      row.method,
      row.status,
      toCsvAmount(row.amount),
      row.receivedByName ?? "",
    ]),
  }

  return (
    <div className="space-y-6" data-print-document data-print-report data-print-landscape>
      <BrandedPrintHeader title="Receipt Register" reference={scope} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <h1 className="text-3xl font-bold tracking-tight">Receipts</h1>
          <p className="text-muted-foreground">
            Every receipt issued by the school. Search by receipt number, student, admission number, or reference.
          </p>
        </div>
        <BrandedReportExport title={`Receipts ${scope}`} subtitle={scope} table={exportTable} orientation="landscape" />
      </div>

      {/* A plain GET form: the search lands in the URL, so a found receipt can be linked to
          a colleague, and the back button behaves. */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <form className="flex flex-col gap-2 sm:flex-row">
            {termId && <input type="hidden" name="termId" value={termId} />}
            <Input
              name="search"
              defaultValue={search ?? ""}
              placeholder="Receipt number, student name, admission number, or bank reference"
              className="sm:max-w-md"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">Search</Button>
              {(search || termId) && (
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href={`${basePath}/receipts`}>Clear</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {setup.success && (
        <PeriodFilter basePath={`${basePath}/receipts`} terms={setup.data.terms} selectedTermId={termId} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Receipt Register</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "receipt" : "receipts"} · {formatNaira(String(total))} collected
            {rows.length === 500 ? " (showing the most recent 500 — narrow the search to see more)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReceiptsRegisterTable basePath={basePath} rows={rows} />
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {search ? `Nothing matches “${search}”.` : "No receipts have been issued yet."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
