"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { KeyRound } from "lucide-react"
import { toast } from "sonner"

import { createLoginForStaff } from "@/app/actions/hr"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Gives a hired teacher or accountant a login, from their HR record. The temporary password
 * is shown once, here, for HR to pass on privately.
 */
export function CreateStaffLoginButton({ staffId, staffName, roleLabel, defaultEmail }: {
  staffId: string
  staffName: string
  roleLabel: string
  defaultEmail: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail ?? "")
  const [error, setError] = useState("")
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)
  const [pending, start] = useTransition()

  function close(next: boolean) {
    setOpen(next)
    if (!next && issued) {
      setIssued(null)
      router.refresh()
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="mr-2 h-4 w-4" />Create {roleLabel} login
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          {issued ? (
            <>
              <DialogHeader>
                <DialogTitle>Login created for {staffName}</DialogTitle>
                <DialogDescription>
                  Share these privately. The password is shown only now; ask {staffName} to change it after signing in.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
                <p>Login email: <strong className="break-all">{issued.email}</strong></p>
                <p>Temporary password: <code className="rounded bg-background px-1.5 py-0.5">{issued.password}</code></p>
              </div>
              <DialogFooter><Button onClick={() => close(false)}>Done</Button></DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create a {roleLabel} login</DialogTitle>
                <DialogDescription>
                  {staffName} signs in with this email. {roleLabel === "teacher"
                    ? "Once they can sign in, they appear under Teachers for class and subject assignments."
                    : "Once they can sign in, they appear under Finance staff."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="login-email">Email *</Label>
                <Input id="login-email" type="email" value={email} maxLength={160} onChange={(event) => setEmail(event.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <DialogFooter>
                <Button variant="outline" disabled={pending} onClick={() => close(false)}>Cancel</Button>
                <Button disabled={pending || !/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => start(async () => {
                  setError("")
                  const result = await createLoginForStaff({ staffId, email })
                  if (!result.success) return setError(result.error)
                  toast.success("Login created")
                  setIssued({ email: result.data.loginEmail, password: result.data.temporaryPassword })
                })}>{pending ? "Creating…" : "Create login"}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
