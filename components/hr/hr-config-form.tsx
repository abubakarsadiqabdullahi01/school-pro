"use client"

import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/reports/data-table"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  createAllowanceType,
  createDeductionType,
  createSalaryScale,
  saveHrConfig,
  setComponentTypeActive,
  setSalaryScaleActive,
} from "@/app/actions/hr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { formatNaira } from "@/lib/money"

const NONE = "NONE"

type ConfigValues = {
  staffNoPrefix: string
  payrollClosingDay: number
  defaultAccountId: string | null
  defaultPaymentMethod: string
  requirePayrollApproval: boolean
  allowNegativeNet: boolean
  prorateFirstMonth: boolean
  payslipNote: string | null
}

const METHODS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CASH", label: "Cash" },
  { value: "POS", label: "POS" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "ONLINE", label: "Online" },
]

/**
 * The school's HR settings.
 *
 * The three switches are the ones that change how payroll behaves, so each says what it
 * does rather than just naming itself.
 */
export function HrConfigForm({
  config,
  accounts,
}: {
  config: ConfigValues
  accounts: Array<{ id: string; name: string; isActive: boolean }>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await saveHrConfig({
        staffNoPrefix: formData.get("staffNoPrefix"),
        payrollClosingDay: formData.get("payrollClosingDay"),
        defaultAccountId: formData.get("defaultAccountId") === NONE ? undefined : formData.get("defaultAccountId"),
        defaultPaymentMethod: formData.get("defaultPaymentMethod"),
        requirePayrollApproval: formData.get("requirePayrollApproval") === "on",
        allowNegativeNet: formData.get("allowNegativeNet") === "on",
        prorateFirstMonth: formData.get("prorateFirstMonth") === "on",
        payslipNote: formData.get("payslipNote") || undefined,
      })
      if (!result.success) {
        toast.error("Could not save the settings", { description: result.error })
        return
      }
      toast.success("HR settings saved")
      router.refresh()
    })
  }

  return (
    <form action={save} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Numbering and payment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="staffNoPrefix">Staff number prefix</Label>
            <Input id="staffNoPrefix" name="staffNoPrefix" defaultValue={config.staffNoPrefix} maxLength={10} />
            <p className="text-sm text-muted-foreground">Numbers are issued as {config.staffNoPrefix}-0001.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payrollClosingDay">Payroll closing day</Label>
            <Input
              id="payrollClosingDay"
              name="payrollClosingDay"
              type="number"
              min="1"
              max="31"
              defaultValue={config.payrollClosingDay}
            />
            <p className="text-sm text-muted-foreground">A reminder for the office. Nothing enforces it.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultAccountId">Default paying account</Label>
            <Select name="defaultAccountId" defaultValue={config.defaultAccountId ?? NONE}>
              <SelectTrigger id="defaultAccountId"><SelectValue placeholder="Choose at payment time" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Choose at payment time</SelectItem>
                {accounts
                  .filter((account) => account.isActive)
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultPaymentMethod">Default payment method</Label>
            <Select name="defaultPaymentMethod" defaultValue={config.defaultPaymentMethod}>
              <SelectTrigger id="defaultPaymentMethod"><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How payroll behaves</CardTitle>
          <CardDescription>These three change what the payroll run will and will not do.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            name="requirePayrollApproval"
            defaultChecked={config.requirePayrollApproval}
            label="Require approval before payment"
            hint="On: a generated run starts as a draft and an admin must approve it. Off: it is generated ready to pay, for a school where the admin does everything."
          />
          <Toggle
            name="allowNegativeNet"
            defaultChecked={config.allowNegativeNet}
            label="Allow a negative net salary"
            hint="Off: generation refuses if anyone's deductions exceed their pay, which is nearly always a misconfigured deduction. On: it goes through anyway."
          />
          <Toggle
            name="prorateFirstMonth"
            defaultChecked={config.prorateFirstMonth}
            label="Pay part months pro rata"
            hint="On: somebody joining or leaving mid-month is paid for the days they worked. Off: they get a full month."
          />
          <div className="space-y-2">
            <Label htmlFor="payslipNote">Payslip footnote</Label>
            <Textarea id="payslipNote" name="payslipNote" rows={2} defaultValue={config.payslipNote ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={isPending}>Save settings</Button>
    </form>
  )
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string
  label: string
  hint: string
  defaultChecked: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-4">
      <div className="space-y-1">
        <Label htmlFor={name}>{label}</Label>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <Switch id={name} name={name} defaultChecked={defaultChecked} />
    </div>
  )
}
