import { notFound } from "next/navigation"
import Link from "next/link"

import { getStudentStatement } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { BrandedDocumentDownload, BrandedPrintHeader } from "@/components/reports/branded"
import { PrintButton } from "@/components/reports/print-button"
import type { PrintableDocument } from "@/components/reports/document-download"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDocumentDate as formatDate } from "@/lib/format"
import { formatNaira, formatNairaPlain } from "@/lib/money"
import { amountInWords } from "@/lib/amount-in-words"
import { buildStatementLedger, chargeStatementDate } from "@/lib/finance/statement-ledger"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * A running balance, in the convention a statement uses.
 *
 * A negative balance means the school is holding the family's money — a payment made ahead
 * of the charge it covers. Accounts mark that "CR", not with a minus sign, which reads as
 * an error to anyone scanning a column of figures.
 */
function formatBalance(value: { isNegative(): boolean; abs(): unknown }, plain = false): string {
  const format = plain ? formatNairaPlain : formatNaira
  const magnitude = format(value.abs() as never)
  return value.isNegative() ? `${magnitude} CR` : magnitude
}

export async function StudentStatementView({
  basePath,
  studentId,
}: {
  /** Which finance tree this is rendered under, so receipt links stay inside it. */
  basePath: string
  studentId: string
}) {
  const statement = await getStudentStatement(studentId)

  if (!statement.success) notFound()

  const { school, student, totals, charges, payments, issuedBy } = statement.data
  const adjustments = String(Number(totals.discounts) + Number(totals.exemptions))

  // The statement proper: every charge and every settled payment on one running balance.
  const ledger = buildStatementLedger(
    charges.map((charge) => ({ ...charge, raisedOn: chargeStatementDate(charge) })),
    payments,
  )

  // What is still owed, for the parent who wants the short answer rather than the history.
  const outstanding = charges.filter((charge) => Number(charge.balance) > 0)

  const periodFrom = ledger.entries[0]?.date
  const periodTo = ledger.entries[ledger.entries.length - 1]?.date
  const generatedAt = new Date().toLocaleString()

  // The role a signatory is addressed by. The schema carries no job title, so the account
  // role is turned into the nearest office a parent would recognise on a school document.
  const ROLE_TITLES: Record<string, string> = {
    SUPER_ADMIN: "Platform Administrator",
    ADMIN: "Finance Officer",
    ACCOUNTANT: "Bursar / Accountant",
  }
  const issuerTitle = ROLE_TITLES[issuedBy.role] ?? "Finance Office"

  const document: PrintableDocument = {
    title: "Statement of Account",
    reference: `${student.name} ${student.admissionNo}`,
    schoolName: school.name,
    schoolCode: school.code,
    fields: [
      { label: "Student", value: student.name },
      { label: "Admission No", value: student.admissionNo },
      { label: "Class / Section", value: student.currentClass ?? "-" },
      { label: "Term", value: student.currentTerm ?? "-" },
      {
        label: "Period",
        value: periodFrom && periodTo ? `${formatDate(periodFrom)} – ${formatDate(periodTo)}` : "-",
      },
      { label: "Balance in Words", value: amountInWords(totals.balance) },
    ],
    table: {
      caption: "Account activity",
      columns: ["Date", "Description", "Reference", "Charged", "Paid", "Balance"],
      rows:
        ledger.entries.length > 0
          ? ledger.entries.map((entry) => [
              formatDate(entry.date),
              entry.description,
              entry.reference ?? "—",
              entry.debit.isZero() ? "—" : formatNairaPlain(entry.debit),
              entry.credit.isZero() ? "—" : formatNairaPlain(entry.credit),
              formatBalance(entry.balance, true),
            ])
          : [["—", "Nothing has been charged to this student yet", "—", "—", "—", "—"]],
    },
    totals: [
      { label: "Total charged", value: formatNairaPlain(totals.charged) },
      { label: "Total received", value: formatNairaPlain(totals.paid) },
      { label: "Adjustments", value: formatNairaPlain(adjustments) },
      { label: "Balance due", value: formatNairaPlain(totals.balance) },
    ],
    notice: ledger.pendingTotal.isZero()
      ? null
      : `${formatNairaPlain(ledger.pendingTotal)} is awaiting confirmation and is not included in the balance due.`,
    signatures: [
      {
        label: `${issuerTitle} · ${school.name}`,
        name: issuedBy.name,
        caption: `Issued electronically on ${generatedAt}. Valid without an ink signature.`,
      },
      {
        label: "Parent / Guardian",
        caption: "Name, signature and date on receipt of this statement.",
      },
    ],
  }

  return (
    <div className="space-y-5" data-print-document data-print-report>
      <BrandedPrintHeader
        title="Statement of Account"
        reference={`${student.name} · ${student.admissionNo}`}
      />

      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Statement of Account</h1>
            <InfoGuide guideKey="finance.studentStatement" />
          </div>
          <p className="text-muted-foreground">
            {student.name} · {student.admissionNo} · {student.currentClass ?? "No class"} ·{" "}
            {student.currentTerm ?? "No term"}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton label="Print Statement" />
          <BrandedDocumentDownload document={document} label="Download PDF" />
        </div>
      </div>

      {/* Who and when, in one line each, above the figures they belong to. */}
      <div className="grid gap-x-6 gap-y-3 rounded-md border p-4 sm:grid-cols-3">
        <Detail label="Student" value={`${student.name} (${student.admissionNo})`} />
        <Detail label="Class / Section" value={student.currentClass ?? "—"} />
        <Detail label="Term" value={student.currentTerm ?? "—"} />
        <Detail label="School" value={`${school.name} (${school.code})`} />
        <Detail
          label="Period covered"
          value={periodFrom && periodTo ? `${formatDate(periodFrom)} – ${formatDate(periodTo)}` : "—"}
        />
        <Detail label="Statement date" value={generatedAt} />
      </div>

      {/* Four figures, one row — the same band the report card uses. `print:grid-cols-4`
          because the print viewport falls below the `sm` breakpoint and the tiles would
          otherwise stack into a page of their own. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:gap-2 print:grid-cols-4">
        <Figure label="Total charged" value={totals.charged} />
        <Figure label="Total received" value={totals.paid} />
        <Figure label="Adjustments" value={adjustments} />
        <Figure label="Balance due" value={totals.balance} emphasis />
      </div>

      <p className="text-sm text-muted-foreground">
        Balance due in words: <span className="font-medium text-foreground">{amountInWords(totals.balance)}</span>
      </p>

      {!ledger.pendingTotal.isZero() && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {formatNaira(ledger.pendingTotal)} is awaiting confirmation and is not included in the balance due.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account activity</CardTitle>
          <CardDescription>
            Every charge raised and every payment received, in date order, with the balance after each.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {/*
            Column widths are fixed, and only the description is allowed to wrap.
            Left to itself the browser gave the money columns less room than their contents
            needed, so "N52,500.00 CR" was clipped at the page edge while the reference
            column sat half empty. The balance column is widest because it is the only one
            that can carry a "CR" suffix.

            `tabular-nums` puts every digit on the same advance width, so the figures form
            straight columns instead of ragged ones — the thing that most makes a financial
            table look set rather than typed.
          */}
          <table className="w-full table-fixed text-sm tabular-nums print:text-[8pt]">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[20%]" />
              <col className="w-[17%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="border-b-2 text-left">
                <th className="px-2 py-2 font-semibold first:pl-0">Date</th>
                <th className="px-2 py-2 font-semibold">Description</th>
                <th className="px-2 py-2 font-semibold">Reference</th>
                <th className="px-2 py-2 text-right font-semibold">Charged</th>
                <th className="px-2 py-2 text-right font-semibold">Paid</th>
                <th className="py-2 pl-2 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-2 py-2 align-top text-muted-foreground first:pl-0">
                    {formatDate(entry.date)}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {entry.description}
                    {entry.pending && (
                      <span className="block text-xs text-muted-foreground">not applied to fees</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-top text-muted-foreground">
                    {entry.reference && entry.kind === "payment" ? (
                      <Link
                        className="text-primary underline-offset-4 hover:underline print:text-inherit"
                        href={`${basePath}/receipts/${entry.id.replace("payment-", "")}`}
                      >
                        {entry.reference}
                      </Link>
                    ) : (
                      ""
                    )}
                  </td>
                  {/* An empty cell rather than a dash: in a column of figures a row of
                      em-dashes is noise, and the eye reads blank as "nothing here" faster. */}
                  <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                    {entry.debit.isZero() ? "" : formatNaira(entry.debit)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                    {entry.credit.isZero() ? "" : formatNaira(entry.credit)}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-2 text-right align-top font-medium">
                    {formatBalance(entry.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            {ledger.entries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/40 print:bg-transparent">
                  <td className="px-2 py-2.5 font-semibold first:pl-0" colSpan={3}>
                    Closing balance
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold">
                    {formatNaira(totals.charged)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold">
                    {formatNaira(totals.paid)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pl-2 text-right font-bold">
                    {formatBalance(ledger.closingBalance)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {ledger.entries.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing has been charged to this student yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Still outstanding</CardTitle>
          <CardDescription>
            {outstanding.length === 0
              ? "Every fee raised against this student has been settled."
              : "The fees that make up the balance due."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {outstanding.length > 0 && (
            <table className="w-full table-fixed text-sm tabular-nums print:text-[8pt]">
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead>
                <tr className="border-b-2 text-left">
                  <th className="px-2 py-2 font-semibold first:pl-0">Fee</th>
                  <th className="px-2 py-2 font-semibold">Due</th>
                  <th className="px-2 py-2 text-right font-semibold">Charged</th>
                  <th className="px-2 py-2 text-right font-semibold">Paid</th>
                  <th className="py-2 pl-2 text-right font-semibold">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((charge) => (
                  <tr key={charge.id} className="border-b last:border-0">
                    <td className="px-2 py-2 align-top first:pl-0">{charge.description}</td>
                    <td className="whitespace-nowrap px-2 py-2 align-top text-muted-foreground">
                      {charge.dueDate ? formatDate(charge.dueDate) : ""}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                      {formatNaira(charge.amount)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                      {formatNaira(charge.paid)}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right align-top font-medium">
                      {formatNaira(charge.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/40 print:bg-transparent">
                  <td className="px-2 py-2.5 font-semibold first:pl-0" colSpan={4}>
                    Total outstanding
                  </td>
                  <td className="whitespace-nowrap py-2.5 pl-2 text-right font-bold">
                    {formatNaira(totals.balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/*
        A statement leaves the school in somebody's hands, so it has to say who issued it.
        There is no signature image in the schema and no ink on a generated document, so the
        left block is an electronic signature — the officer's name, their office, and when
        the copy was produced — and the right is a ruled space for the parent to sign the
        copy they keep.
      */}
      <div className="grid gap-6 pt-6 sm:grid-cols-2">
        <div>
          <p className="font-[cursive] text-xl leading-tight text-foreground/80">{issuedBy.name}</p>
          <div className="mt-1 border-t pt-2">
            <p className="text-sm font-medium">
              {issuerTitle} · {school.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Issued electronically on {generatedAt}. Valid without an ink signature.
            </p>
          </div>
        </div>
        <div>
          <p className="text-xl leading-tight text-transparent select-none" aria-hidden>
            &nbsp;
          </p>
          <div className="mt-1 border-t pt-2">
            <p className="text-sm font-medium">Parent / Guardian</p>
            <p className="text-xs text-muted-foreground">
              Name, signature and date on receipt of this statement.
            </p>
          </div>
        </div>
      </div>

      <p className="hidden pt-2 text-xs text-muted-foreground print:block">
        Generated {generatedAt} · {school.name} ({school.code}) · Statement ref {school.code}/
        {student.admissionNo}
      </p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

/** One figure in the summary band: label small and quiet, number large. */
function Figure({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${emphasis ? "border-primary/40 bg-primary/5" : "bg-muted/40"}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${emphasis ? "text-primary" : ""}`}>
        {formatNaira(value, { kobo: false })}
      </p>
    </div>
  )
}
