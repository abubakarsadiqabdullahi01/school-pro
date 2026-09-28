"use client"

import { useState, useTransition } from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { setPlatformCharge } from "@/app/actions/payment-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MAX_FLAT_CHARGE_NAIRA, MAX_PERCENTAGE_CHARGE } from "@/lib/payments/platform-charge"

type ChargeType = "NONE" | "FLAT" | "PERCENTAGE"

export type PlatformConfigurationRow = {
  id: string
  schoolId: string
  schoolName: string
  schoolCode: string
  environment: "TEST" | "LIVE"
  accountMode: string
  status: string
  isEnabled: boolean
  platformChargeType: ChargeType
  platformChargeValue: string
}

export function PlatformChargeTable({ rows }: { rows: PlatformConfigurationRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No payment configuration yet</CardTitle>
          <CardDescription>
            A school appears here once it chooses an online payment mode.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => <ChargeRow key={row.id} row={row} />)}
    </div>
  )
}

function ChargeRow({ row }: { row: PlatformConfigurationRow }) {
  const [type, setType] = useState<ChargeType>(row.platformChargeType)
  const [value, setValue] = useState(row.platformChargeValue)
  const [pending, startTransition] = useTransition()

  const platformManaged = row.accountMode === "PLATFORM_MANAGED"

  function save() {
    startTransition(async () => {
      const result = await setPlatformCharge({
        configurationId: row.id,
        type,
        value: type === "NONE" ? 0 : Number(value),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Platform charge saved for ${row.schoolName}`)
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{row.schoolName}</CardTitle>
            <CardDescription>
              {row.schoolCode} · {row.environment === "LIVE" ? "Live" : "Test"} ·{" "}
              {platformManaged ? "DigiSchool-managed" : "School-owned Paystack"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={row.isEnabled ? "default" : "secondary"}>
              {row.isEnabled ? "Collecting" : "Not collecting"}
            </Badge>
            <Badge variant="outline">{row.status.replaceAll("_", " ")}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* A school on its own keys settles straight from Paystack to its own bank. There is
            no transaction passing through the platform account to take anything from, so
            offering the control would imply revenue that cannot be collected. */}
        {!platformManaged ? (
          <p className="text-sm text-muted-foreground">
            This school settles directly on its own Paystack account, so no platform charge applies.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48">
              <Label htmlFor={`type-${row.id}`}>Charge</Label>
              <Select value={type} onValueChange={(next) => setType(next as ChargeType)}>
                <SelectTrigger id={`type-${row.id}`} className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No platform charge</SelectItem>
                  <SelectItem value="FLAT">Flat amount per payment</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentage of the fees paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type !== "NONE" && (
              <div className="w-40">
                <Label htmlFor={`value-${row.id}`}>
                  {type === "FLAT" ? "Naira per payment" : "Percent"}
                </Label>
                <Input
                  id={`value-${row.id}`}
                  className="mt-1.5"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={type === "FLAT" ? 1 : 0.01}
                  max={type === "FLAT" ? MAX_FLAT_CHARGE_NAIRA : MAX_PERCENTAGE_CHARGE}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </div>
            )}
            {type !== "NONE" && (
              <p className="basis-full text-xs text-muted-foreground">
                {type === "FLAT"
                  ? "Dedicated-account (bank transfer) payments cannot carry a flat charge; they settle in full to the school."
                  : "Also applied to dedicated-account transfers through the school's Paystack split — use a whole number."}
              </p>
            )}
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
