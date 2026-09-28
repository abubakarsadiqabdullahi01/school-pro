"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Database, Loader2, Server, Settings } from "lucide-react"
import { toast } from "sonner"
import { motion } from "framer-motion"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { updateSystemSettings, type SystemConfig } from "@/app/actions/system-settings"
import { PLATFORM_SETTINGS } from "@/lib/system-config"
import { InfoGuide } from "@/components/ui/info-guide"

/**
 * Platform settings, health and backup status.
 *
 * What was here before: six tabs of switches and inputs — Email, Notifications, Appearance,
 * Developer Options — every one of them `defaultChecked` with nothing behind it, and a save
 * handler that passed the *section name* as `systemName`. None of it was wired to anything.
 *
 * This screen now offers exactly the settings that exist and are read somewhere. Tabs come
 * back as the features behind them do.
 */

export interface SystemHealth {
  database: { status: string; totalUsers: number; totalSchools: number; activeSessions: number }
  process: {
    uptimeSeconds: number
    heapUsedMb: number
    rssMb: number
    totalMemoryMb: number
    loadAverage: number | null
    diskUsage: null
    cpuUsage: null
  }
  activity: { successfulLogins24h: number; failedLogins24h: number }
}

export interface BackupStatus {
  configured: boolean
  lastBackupAt: string | null
  sizeBytes?: number | null
  file?: string | null
  detail: string
}

interface SystemSettingsProps {
  settings: SystemConfig
  health: SystemHealth | null
  backup: BackupStatus | null
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function SystemSettings({ settings, health, backup }: SystemSettingsProps) {
  const [values, setValues] = useState<SystemConfig>(settings)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const isDirty = PLATFORM_SETTINGS.some((s) => values[s.key] !== settings[s.key])

  async function handleSave() {
    setIsSaving(true)
    try {
      // Only the settings that actually changed are sent, so the audit entry names the
      // ones someone meant to touch.
      const changed: Partial<SystemConfig> = {}
      for (const definition of PLATFORM_SETTINGS) {
        if (values[definition.key] !== settings[definition.key]) {
          changed[definition.key] = values[definition.key]
        }
      }

      const result = await updateSystemSettings(changed)

      if (!result.success) {
        toast.error("Not saved", { description: result.error })
        return
      }

      toast.success(result.message)
      router.refresh()
    } catch {
      toast.error("Not saved", { description: "Something went wrong. Try again." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
          <InfoGuide guideKey="superAdmin.system" />
        </div>
        <p className="text-muted-foreground">Platform-wide configuration, health and backups</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Platform settings</CardTitle>
          </div>
          <CardDescription>
            These are stored in the database and read by the application. Nothing here is
            decorative.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {PLATFORM_SETTINGS.map((definition) => {
            const value = values[definition.key]

            return (
              <div key={definition.key} className="space-y-2">
                <Label htmlFor={definition.key}>{definition.description}</Label>

                {definition.type === "BOOLEAN" ? (
                  <div className="flex items-center gap-3">
                    <Switch
                      id={definition.key}
                      checked={Boolean(value)}
                      onCheckedChange={(checked) =>
                        setValues((prev) => ({ ...prev, [definition.key]: checked }))
                      }
                    />
                    <span className="text-sm text-muted-foreground">
                      {value ? "On" : "Off"}
                    </span>
                  </div>
                ) : (
                  <Input
                    id={definition.key}
                    type={definition.type === "NUMBER" ? "number" : "text"}
                    value={String(value ?? "")}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [definition.key]:
                          definition.type === "NUMBER"
                            ? Number(event.target.value)
                            : event.target.value,
                      }))
                    }
                  />
                )}
                <p className="text-xs font-mono text-muted-foreground">{definition.key}</p>
              </div>
            )
          })}

          <Button onClick={handleSave} disabled={isSaving || !isDirty}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save settings"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Health</CardTitle>
          </div>
          <CardDescription>
            Measured now. Uptime and memory describe the application process, not the server
            — on shared hosting those are different things.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {health ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Database"
                value={health.database.status === "healthy" ? "Healthy" : "Unreachable"}
                tone={health.database.status === "healthy" ? "good" : "bad"}
              />
              <Metric label="Process uptime" value={formatUptime(health.process.uptimeSeconds)} />
              <Metric
                label="Memory in use"
                value={`${health.process.rssMb} MB of ${health.process.totalMemoryMb} MB`}
              />
              <Metric
                label="Load average"
                value={
                  health.process.loadAverage === null
                    ? "Not available on this platform"
                    : health.process.loadAverage.toFixed(2)
                }
              />
              <Metric label="Schools" value={String(health.database.totalSchools)} />
              <Metric label="Users" value={String(health.database.totalUsers)} />
              <Metric label="Active sessions" value={String(health.database.activeSessions)} />
              <Metric
                label="Sign-ins today"
                value={`${health.activity.successfulLogins24h} ok, ${health.activity.failedLogins24h} failed`}
                tone={health.activity.failedLogins24h > 50 ? "warn" : undefined}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Health could not be read.</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Disk and CPU usage are not shown because Node cannot read them without native
            modules. This screen previously displayed fixed numbers for both.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Backups</CardTitle>
          </div>
          <CardDescription>
            Backups run on a schedule, not from this screen — a full dump takes longer than a
            web request should.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {backup?.configured ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">Last backup</Badge>
                <span className="text-sm">
                  {backup.lastBackupAt
                    ? new Date(backup.lastBackupAt).toLocaleString()
                    : "date not recorded"}
                </span>
                {backup.sizeBytes ? (
                  <span className="text-sm text-muted-foreground">
                    · {(backup.sizeBytes / 1024 / 1024).toFixed(2)} MB
                  </span>
                ) : null}
              </div>
              {backup.file ? (
                <p className="text-xs font-mono text-muted-foreground break-all">{backup.file}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">{backup.detail}</p>
            </>
          ) : (
            <Alert variant="destructive">
              <AlertTitle>No backup has ever been recorded</AlertTitle>
              <AlertDescription>
                {backup?.detail ??
                  "Schedule scripts/backup-database.ts as a cron job. See documentation/backup-and-restore.md."}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "good" | "warn" | "bad"
}) {
  const toneClass =
    tone === "good"
      ? "text-green-700 dark:text-green-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "bad"
          ? "text-red-700 dark:text-red-400"
          : "text-foreground"

  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-medium ${toneClass}`}>{value}</div>
    </div>
  )
}
