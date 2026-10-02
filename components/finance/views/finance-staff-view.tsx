import Link from "next/link"

import { getFinanceOfficers } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDocumentDate } from "@/lib/format"
import { formatNaira, sumAmounts } from "@/lib/money"
import { readParam } from "@/lib/query-filters"
import { InfoGuide } from "@/components/ui/info-guide"

const columns: DataTableColumn[] = [
  { label: "Officer", width: "24%" },
  { label: "Contact", width: "22%" },
  { label: "Status", width: "10%" },
  { label: "Receipts", align: "right", width: "10%" },
  { label: "Collected", align: "right", width: "15%" },
  { label: "Last receipt", width: "13%" },
  { label: "", printHidden: true, width: "6rem" },
]

const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "REVOKED", label: "Revoked" },
] as const

/**
 * The accountants who collect money on the school's behalf.
 *
 * The list is the screen; adding one and changing one are their own pages. What it has to
 * show is not names and phone numbers — it is who is actually handling money: receipts
 * issued, what they came to, and when they last took a payment. That is the figure an admin
 * needs before revoking anybody's access.
 */
export async function FinanceStaffView({
  basePath,
  searchParams,
}: {
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const officers = await getFinanceOfficers()
  if (!officers.success) {
    return <p className="text-destructive">{officers.error}</p>
  }

  const search = readParam(searchParams, "search")?.toLowerCase()
  const status = readParam(searchParams, "status")

  const rows = officers.data
    .filter((officer) =>
      status === "ACTIVE" ? officer.isActive : status === "REVOKED" ? !officer.isActive : true,
    )
    .filter((officer) =>
      search
        ? [officer.name, officer.email ?? "", officer.phone ?? ""].join(" ").toLowerCase().includes(search)
        : true,
    )

  const active = officers.data.filter((officer) => officer.isActive).length
  const collected = sumAmounts(officers.data.map((officer) => officer.totalCollected))
  const receipts = officers.data.reduce((total, officer) => total + officer.paymentsRecorded, 0)

  const tableRows: DataTableRow[] = rows.map((officer) => ({
    id: officer.userId,
    href: `${basePath}/staff/${officer.userId}`,
    search: [officer.name, officer.email ?? "", officer.phone ?? ""].join(" "),
    cells: [
      <div key="officer" className="min-w-0">
        <div className="font-medium">{officer.name}</div>
        <div className="text-xs text-muted-foreground">
          Added {formatDocumentDate(officer.createdAt)}
        </div>
      </div>,
      <div key="contact" className="min-w-0 text-sm">
        <div className="truncate">{officer.email ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{officer.phone ?? "No phone"}</div>
      </div>,
      <Badge key="status" variant={officer.isActive ? "default" : "secondary"}>
        {officer.isActive ? "Active" : "Revoked"}
      </Badge>,
      <span key="receipts" className="tabular-nums">
        {officer.paymentsRecorded}
      </span>,
      <span key="collected" className="whitespace-nowrap font-medium tabular-nums">
        {formatNaira(officer.totalCollected)}
      </span>,
      <span key="last" className="whitespace-nowrap text-xs text-muted-foreground">
        {officer.lastPaymentDate ? formatDocumentDate(officer.lastPaymentDate) : "Never"}
      </span>,
      <Button key="open" variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
        <Link href={`${basePath}/staff/${officer.userId}`}>Manage</Link>
      </Button>,
    ],
  }))

  const filterHref = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries({ search, status, ...next })) {
      if (value) params.set(key, value)
    }
    const query = params.toString()
    return query ? `${basePath}/staff?${query}` : `${basePath}/staff`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BackButton fallbackHref={basePath} />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Finance Staff</h1>
            <InfoGuide guideKey="finance.staff" />
          </div>
          <p className="text-muted-foreground">
            Accountants who record payments and print receipts on the school&apos;s behalf. They read every
            finance report but cannot configure fees or approve discounts and exemptions.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/admin/hr/staff/new">Onboard staff in HR</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          {/* A plain GET form: the list is small and the filters belong in the URL, so a
              filtered view can be sent to whoever asked for it. */}
          <form className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end" action={`${basePath}/staff`}>
            {status && <input type="hidden" name="status" value={status} />}
            <input
              name="search"
              defaultValue={search ?? ""}
              placeholder="Search name, email or phone"
              aria-label="Search finance staff"
              className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
            />
            <Button type="submit" size="sm">
              Search
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button variant={!status ? "default" : "outline"} size="sm" asChild>
              <Link href={filterHref({ status: undefined })}>All</Link>
            </Button>
            {STATUSES.map((option) => (
              <Button
                key={option.value}
                variant={status === option.value ? "default" : "outline"}
                size="sm"
                asChild
              >
                <Link href={filterHref({ status: option.value })}>{option.label}</Link>
              </Button>
            ))}
            {(search || status) && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${basePath}/staff`}>Clear</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Officers</p>
          <p className="text-2xl font-bold tabular-nums">{officers.data.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">With access</p>
          <p className="text-2xl font-bold tabular-nums">{active}</p>
          <p className="text-xs text-muted-foreground">{officers.data.length - active} revoked</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Receipts issued</p>
          <p className="text-2xl font-bold tabular-nums">{receipts}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Collected by them</p>
          <p className="text-2xl font-bold tabular-nums">{formatNaira(collected, { kobo: false })}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current finance staff</CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "officer" : "officers"}
            {status || search ? ` of ${officers.data.length}` : ""} · open one to change their details,
            reset their password or revoke access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={tableRows}
            unit="officers"
            searchable={false}
            emptyMessage={
              officers.data.length === 0
                ? "No finance staff assigned. Until someone is, finance stays with the admin."
                : "No officer matches this search."
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
