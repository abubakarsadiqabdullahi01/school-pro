"use client"

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
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Phone</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {officers.map((officer) => (
                <tr key={officer.userId} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{officer.name}</td>
                  <td className="py-3 pr-4">{officer.email ?? "-"}</td>
                  <td className="py-3 pr-4">{officer.phone ?? "-"}</td>
                  <td className="py-3 pr-4">{officer.isActive ? "Active" : "Revoked"}</td>
                  <td className="py-3 pr-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => toggle(officer.userId, !officer.isActive)}
                    >
                      {officer.isActive ? "Revoke Access" : "Restore Access"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {officers.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No finance staff assigned. Until someone is, finance stays with the admin.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
