"use client"

import { useState, useTransition } from "react"
import { Loader2, Timer } from "lucide-react"
import { toast } from "sonner"

import { saveSchoolSessionSecurity } from "@/app/actions/session-security"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SessionSecuritySettings } from "@/lib/session-policy"

/**
 * How long a sign-in survives without being used.
 *
 * Split by role because the risk is not the same: a bursar's screen shows every family's
 * balance, a parent's shows one child's results. Zero turns the limit off for that tier —
 * a documented escape hatch rather than a second switch that could disagree with the
 * number beside it.
 */
export function SessionSecurityForm({ settings }: { settings: SessionSecuritySettings }) {
  const [privileged, setPrivileged] = useState(String(settings.idleMinutesPrivileged))
  const [staff, setStaff] = useState(String(settings.idleMinutesStaff))
  const [family, setFamily] = useState(String(settings.idleMinutesFamily))
  const [warning, setWarning] = useState(String(settings.warningSeconds))
  const [absolute, setAbsolute] = useState(String(settings.absoluteDays))
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await saveSchoolSessionSecurity({
        idleMinutesPrivileged: Number(privileged),
        idleMinutesStaff: Number(staff),
        idleMinutesFamily: Number(family),
        warningSeconds: Number(warning),
        absoluteDays: Number(absolute),
      })
      if (!result.success) {
        toast.error("Could not save", { description: result.error })
        return
      }
      toast.success("Session limits saved", {
        description: "These take effect on the next request, for everyone already signed in too.",
      })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-muted-foreground" />
          Sign-out after inactivity
        </CardTitle>
        <CardDescription>
          Enforced on the server, so closing the browser or disabling JavaScript does not
          avoid it. Set a tier to <strong>0</strong> to switch idle sign-out off for it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="idle-privileged">Admins and accountants</Label>
            <Input
              id="idle-privileged"
              inputMode="numeric"
              value={privileged}
              onChange={(event) => setPrivileged(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minutes. They can see and move money.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="idle-staff">Teachers</Label>
            <Input
              id="idle-staff"
              inputMode="numeric"
              value={staff}
              onChange={(event) => setStaff(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minutes. Marks and class lists.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="idle-family">Parents and students</Label>
            <Input
              id="idle-family"
              inputMode="numeric"
              value={family}
              onChange={(event) => setFamily(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minutes. Their own results.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="warning-seconds">Warning before sign-out</Label>
            <Input
              id="warning-seconds"
              inputMode="numeric"
              value={warning}
              onChange={(event) => setWarning(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Seconds of countdown, so a teacher halfway through entering marks is warned
              rather than losing the page. 0 shows no warning.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="absolute-days">Maximum session length</Label>
            <Input
              id="absolute-days"
              inputMode="numeric"
              value={absolute}
              onChange={(event) => setAbsolute(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Days from sign-in, however actively it is used. Shortening this applies to
              everyone already signed in.
            </p>
          </div>
        </div>

        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save session limits
        </Button>
      </CardContent>
    </Card>
  )
}
