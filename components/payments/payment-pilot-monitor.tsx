import { AlertTriangle, CheckCircle2, CircleAlert, Radio } from "lucide-react"

import type { ParkedGatewayEvent, SchoolPaymentHealth } from "@/lib/payments/payment-health.server"
import { LiveApprovalControl } from "@/components/payments/live-approval-control"
import { ParkedEventActions } from "@/components/payments/parked-event-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNaira } from "@/lib/money"

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: "bad" }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${tone === "bad" && value !== 0 ? "text-destructive" : ""}`}>{value}</p>
    </div>
  )
}

function when(value: Date | null) {
  return value ? value.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "Never"
}

export function PaymentPilotMonitor({
  schools,
  unattributedFailedEvents,
  parkedEvents,
  generatedAt,
}: {
  schools: SchoolPaymentHealth[]
  unattributedFailedEvents: number
  parkedEvents: ParkedGatewayEvent[]
  generatedAt: string
}) {
  const liveSchools = schools.filter((school) => school.counts.liveEnabled).length
  const needingAction = schools.filter((school) => school.alerts.some((alert) => alert.severity === "critical")).length

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Schools with payment setup" value={schools.length} />
        <Metric label="Collecting live money" value={liveSchools} />
        <Metric label="Schools needing action" value={needingAction} tone="bad" />
      </div>

      {unattributedFailedEvents > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{unattributedFailedEvents} failed or parked webhook event{unattributedFailedEvents === 1 ? "" : "s"} could not be matched to a school</AlertTitle>
          <AlertDescription>
            Usually a bank transfer into a dedicated account DigiSchool does not know, such as one
            created directly in the Paystack dashboard: the money reached Paystack but no student
            was credited. Find the reference in Paystack, credit the student by hand, then close
            the event below. Otherwise check the webhook URL and keys. Nothing here has been
            posted to any student.
          </AlertDescription>
        </Alert>
      )}

      {parkedEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Webhook events that failed</CardTitle>
            <CardDescription>
              A failing event retries on its own for about 17 hours, then is parked here until a
              person acts: try it again once the cause is fixed, or close it once it has been
              settled by hand. Closing posts nothing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {parkedEvents.map((event) => (
              <div key={event.id} className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-medium">
                    {event.schoolName ?? "No school matched"} · {event.eventType}
                    {event.amount ? ` · ${formatNaira(event.amount)}` : ""}
                  </p>
                  <p className="break-all text-muted-foreground">
                    {event.environment} · {event.reference ?? "no reference"} · received {when(new Date(event.receivedAt))} · {event.attempts} attempt{event.attempts === 1 ? "" : "s"}
                  </p>
                  {event.lastError && <p className="break-words text-destructive">{event.lastError.slice(0, 300)}</p>}
                </div>
                <div className="shrink-0 md:w-80">
                  {event.status === "DEAD"
                    ? <ParkedEventActions eventId={event.id} />
                    : <Badge variant="secondary">Still retrying</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {schools.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No school has started online payment setup</CardTitle>
            <CardDescription>A school appears here once its admin chooses a payment mode.</CardDescription>
          </CardHeader>
        </Card>
      ) : schools.map((school) => {
        const live = school.connections.find((connection) => connection.environment === "LIVE")
        return (
          <Card key={school.schoolId}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{school.schoolName}</CardTitle>
                  <CardDescription>{school.schoolCode}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {school.connections.map((connection) => (
                    <Badge key={connection.configurationId} variant={connection.isEnabled ? "default" : "secondary"}>
                      {connection.environment === "LIVE" && <Radio className="mr-1 h-3 w-3" />}
                      {connection.environment} · {connection.isEnabled ? "on" : "off"} · {connection.status.replaceAll("_", " ").toLowerCase()}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {school.alerts.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Nothing needs attention.</p>
              ) : (
                <ul className="space-y-1">
                  {school.alerts.map((alert) => (
                    <li key={alert.message} className={`flex items-center gap-2 text-sm ${alert.severity === "critical" ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
                      <CircleAlert className="h-4 w-4 shrink-0" />{alert.message}
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Live payments, 7 days" value={`${school.liveLastSevenDays.count} · ${formatNaira(school.liveLastSevenDays.amount)}`} />
                <Metric label="Pending over 30 min" value={school.counts.stalePending} tone="bad" />
                <Metric label="Needs review" value={school.counts.requiresReview} tone="bad" />
                <Metric label="Failed events" value={school.counts.failedEvents} tone="bad" />
                <Metric label="Open exceptions" value={school.counts.openIssues} tone="bad" />
                <Metric label="Refunds awaiting approval" value={school.counts.refundsAwaitingApproval} />
                <Metric label="Disputes due soon" value={school.counts.disputesDueSoon} tone="bad" />
                <Metric label="Last reconciled" value={when(school.counts.lastReconciledAt)} />
              </div>

              {live ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Live approval:{" "}
                    {live.liveApprovedAt
                      ? `approved ${when(new Date(live.liveApprovedAt))}${live.pilotMaxAmount ? `, limited to ${formatNaira(live.pilotMaxAmount)} per payment` : ", no limit"}`
                      : "not approved"}
                  </p>
                  <LiveApprovalControl
                    configurationId={live.configurationId}
                    schoolName={school.schoolName}
                    approvedAt={live.liveApprovedAt}
                    pilotMaxAmount={live.pilotMaxAmount}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">The school has not set up a live connection yet, so there is nothing to approve.</p>
              )}
            </CardContent>
          </Card>
        )
      })}

      <p className="text-xs text-muted-foreground">Generated {new Date(generatedAt).toLocaleString("en-NG")}.</p>
    </div>
  )
}
