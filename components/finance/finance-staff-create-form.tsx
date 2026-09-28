"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createFinanceOfficer } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { canUseOfficerEmail } from "@/lib/finance/finance-staff-rules"

/**
 * Adding an accountant, on its own screen.
 *
 * The password is shown once and never again — it is stored hashed, so a copy that is not
 * passed on has to be reset rather than looked up. That is why the screen stops on the
 * credentials rather than returning to the list: somebody has to write them down.
 */
export function FinanceStaffCreateForm({
  basePath,
  takenEmails,
}: {
  basePath: string
  /** Every sign-in address already in use, so a clash is caught before submitting. */
  takenEmails: Array<{ userId: string; email: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null)

  const listPath = `${basePath}/staff`
  const verdict = canUseOfficerEmail(email, takenEmails)
  const emailError = email.trim().length > 0 && !verdict.allowed ? verdict.reason : null

  const create = (formData: FormData) => {
    startTransition(async () => {
      const firstName = String(formData.get("firstName") ?? "").trim()
      const lastName = String(formData.get("lastName") ?? "").trim()

      const result = await createFinanceOfficer({
        firstName,
        lastName,
        email,
        phone: String(formData.get("phone") ?? "") || undefined,
      })

      if (!result.success) {
        toast.error("Could not add finance staff", { description: result.error })
        return
      }

      setIssued({ name: `${firstName} ${lastName}`, email, password: result.data.defaultPassword })
      toast.success(`${firstName} ${lastName} added`)
      router.refresh()
    })
  }

  if (issued) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{issued.name} can now sign in</CardTitle>
          <CardDescription>
            This is the only time the password is shown. Pass it on directly and have them change it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-dashed p-4">
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{issued.email}</p>
            <p className="mt-3 text-sm text-muted-foreground">Temporary password</p>
            <p className="font-mono text-lg">{issued.password}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href={listPath}>Back to finance staff</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIssued(null)
                setEmail("")
              }}
            >
              Add another
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Officer details</CardTitle>
          <CardDescription>
            The name and sign-in address for the account. Everything else follows from the role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                aria-invalid={Boolean(emailError)}
              />
              <p className={emailError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {emailError ?? "What they sign in with."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" placeholder="Optional" />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending || Boolean(emailError)}>
                {pending ? "Adding…" : "Add finance officer"}
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(listPath)}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* What the account can do, beside the form that creates it — the answer to "should this
          person be an accountant at all" belongs on this screen, not in a handbook. */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">What an accountant can do</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">They collect.</strong> Record payments, allocate them across
            fees, print and reissue receipts, and work the debtor list.
          </p>
          <p>
            <strong className="text-foreground">They report.</strong> Every finance report is readable to
            them — receipts, debtors, class summary and the accumulated fund.
          </p>
          <p>
            <strong className="text-foreground">They cannot set fees.</strong> Fee setup, discounts and
            exemptions stay with the admin, so the person taking the money is not the person deciding how
            much it is.
          </p>
          <p>
            <strong className="text-foreground">They see nothing else.</strong> No results, no staff, no
            student records beyond what a receipt needs.
          </p>
          <p>
            <strong className="text-foreground">Their name is on the record.</strong> Every receipt they
            issue carries it, which is why an account that has taken money is revoked rather than deleted.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
