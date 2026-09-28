"use client"

import { useState } from "react"
import { Check, Copy, Key, Loader2, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * One reset dialog for learners, guardians and staff.
 *
 * It was three near-identical copies, and they had drifted: the teacher one told the
 * administrator the person "will be required to change it on their first login", which has
 * never been true — nothing in the system forces a change. Somebody reading that would
 * reasonably hand out a password and consider the matter closed. This one says what
 * actually happens instead, and there is only one of it to keep honest.
 */

export interface ResetPasswordResult {
  success: boolean
  data?: { newPassword?: string }
  error?: string
}

interface ResetPasswordDialogProps {
  /** Whose password it is, as it should read in the title. */
  personName: string
  /** The server action. Returns the new password so it can be handed over once. */
  onReset: () => Promise<ResetPasswordResult>
  /** Shown instead of the confirm button when the person has no login at all. */
  hasLogin?: boolean
  triggerLabel?: string
  triggerVariant?: "outline" | "ghost" | "secondary" | "default"
  triggerClassName?: string
  /** Renders the trigger as a plain full-width row, for use inside a dropdown menu. */
  asMenuItem?: boolean
  /**
   * What the action actually sets, so the dialog cannot describe one and do the other.
   * Learners and guardians get their registration year; staff who can change other
   * people's records get a generated password instead.
   */
  passwordKind?: "registration-year" | "generated"
}

export function ResetPasswordDialog({
  personName,
  onReset,
  hasLogin = true,
  triggerLabel = "Reset password",
  triggerVariant = "outline",
  triggerClassName,
  asMenuItem = false,
  passwordKind = "registration-year",
}: ResetPasswordDialogProps) {
  const isYear = passwordKind === "registration-year"
  const [open, setOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [copied, setCopied] = useState(false)

  async function handleReset() {
    setIsResetting(true)
    try {
      const result = await onReset()
      if (result.success && result.data?.newPassword) {
        setNewPassword(result.data.newPassword)
        toast.success("Password reset", {
          description: `${personName} can sign in with the password shown.`,
        })
      } else {
        toast.error("Not reset", { description: result.error ?? "Please try again." })
      }
    } catch {
      toast.error("Not reset", { description: "Something went wrong. Please try again." })
    } finally {
      setIsResetting(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(newPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access is refused in some browsers over plain http. The password is on
      // screen either way, so this is not worth an error toast.
      toast.info("Could not copy", { description: "Select the password and copy it by hand." })
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    // Clear the password when the dialog closes so it is not still sitting there the next
    // time somebody opens it on a different person.
    if (!next) {
      setNewPassword("")
      setCopied(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {asMenuItem ? (
          <button
            type="button"
            className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          >
            <Key className="h-4 w-4" />
            {triggerLabel}
          </button>
        ) : (
          <Button variant={triggerVariant} size="sm" className={triggerClassName}>
            <Key className="mr-2 h-4 w-4" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {personName}</DialogTitle>
          <DialogDescription>
            {isYear
              ? "The password becomes their registration year — the same year on their " +
                "admission number and registration date."
              : "A new password is generated for them. It is shown once, here, and cannot " +
                "be read again afterwards."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!hasLogin ? (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                {personName} has no login yet, so there is no password to reset.
              </AlertDescription>
            </Alert>
          ) : newPassword ? (
            <>
              <div className="space-y-2 rounded-md bg-muted p-3">
                <p className="text-sm font-medium">New password</p>
                <div className="flex items-center gap-2">
                  <code className={`flex-1 rounded border bg-background px-3 py-2 font-mono ${
                      isYear ? "text-lg tracking-widest" : "text-sm break-all"
                    }`}>
                    {newPassword}
                  </code>
                  <Button variant="ghost" size="sm" onClick={copy}>
                    {copied ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  {isYear
                    ? "This is the registration year, so it is easy to pass on and easy to " +
                      "guess — anyone who knows the admission number can work it out. Ask " +
                      "them to change it from their profile the first time they sign in. " +
                      "Nothing forces them to."
                    : "Write it down now — it is not stored anywhere you can read it back. " +
                      "Ask them to change it from their profile once they are in."}
                </AlertDescription>
              </Alert>
            </>
          ) : (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Their current password stops working immediately and they are signed out
                everywhere. Only do this when you can tell them the new one.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {newPassword ? "Done" : "Cancel"}
          </Button>
          {hasLogin && !newPassword ? (
            <Button onClick={handleReset} disabled={isResetting}>
              {isResetting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Reset password
                </>
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
