"use client"

import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createFinanceOfficer, setFinanceOfficerActive } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Officer = {
  userId: string
  name: string
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
}

export function FinanceStaffForm({ officers }: { officers: Officer[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Shown once, after creation. The password is never stored in readable form, so if the
  // admin navigates away before passing it on it has to be reset rather than looked up.
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)

  function create(formData: FormData) {
    startTransition(async () => {
      const email = String(formData.get("email") ?? "")
      const result = await createFinanceOfficer({
        firstName: formData.get("firstName"),
        lastName: formData.get("lastName"),
        email,
        phone: formData.get("phone") || undefined,
      })

      if (!result.success) {
        toast.error("Could not add finance staff", { description: result.error })
        return
      }

      setIssued({ email, password: result.data.defaultPassword })
      toast.success("Finance staff added")
      router.refresh()
    })
  }

  function toggle(userId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setFinanceOfficerActive({ userId, isActive })
      if (!result.success) {
        toast.error("Could not update finance staff", { description: result.error })
        return
      }
      toast.success(isActive ? "Access restored" : "Access revoked")
      router.refresh()
    })
  }

  const officerColumns: DataTableColumn[] = [
    { label: "Name" },
    { label: "Email" },
    { label: "Phone" },
    { label: "Status" },
    { label: "Action" },
  ]

  const officerRows: DataTableRow[] = officers.map((officer) => ({
    id: officer.userId,
    search: [officer.name, officer.email ?? "", officer.phone ?? ""].join(" "),
    cells: [
      <span className="font-medium">{officer.name}</span>,
      officer.email ?? "-",
      officer.phone ?? "-",
      officer.isActive ? "Active" : "Revoked",
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => toggle(officer.userId, !officer.isActive)}>
        {officer.isActive ? "Revoke Access" : "Restore Access"}
      </Button>,
    ],
  }))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assign Finance Staff</CardTitle>
          <CardDescription>
            An accountant signs in to their own finance area. They record payments, print receipts, and read
            every finance report — they cannot configure fees or approve discounts and exemptions, and they
            reach nothing else in the school.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" name="lastName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isPending}>Add Finance Staff</Button>
            </div>
          </form>

          {issued && (
            <div className="mt-4 rounded-md border border-dashed p-4">
              <p className="font-medium">Sign-in details</p>
              <p className="text-sm text-muted-foreground">
                {issued.email} · temporary password <span className="font-mono">{issued.password}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pass these on directly and have them change the password. This is the only time it is shown.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Finance Staff</CardTitle>
          <CardDescription>Revoking access keeps their name on past receipts and approvals.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={officerColumns}
            rows={officerRows}
            pageSize={10}
            unit="officers"
            searchPlaceholder="Search name, email or phone"
            emptyMessage="No finance staff assigned. Until someone is, finance stays with the admin."
          />
        </CardContent>
      </Card>
    </div>
  )
}
