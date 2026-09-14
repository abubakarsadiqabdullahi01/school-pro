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

export function SalaryScalesForm({
  scales,
}: {
  scales: Array<{
    id: string
    name: string
    gradeLevel: string | null
    step: string | null
    baseSalary: string
    description: string | null
    isActive: boolean
    staffCount: number
  }>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function create(formData: FormData) {
    startTransition(async () => {
      const result = await createSalaryScale({
        name: formData.get("name"),
        gradeLevel: formData.get("gradeLevel") || undefined,
        step: formData.get("step") || undefined,
        baseSalary: formData.get("baseSalary"),
        description: formData.get("description") || undefined,
      })
      if (!result.success) {
        toast.error("Could not create the scale", { description: result.error })
        return
      }
      toast.success("Salary scale created")
      router.refresh()
    })
  }

  function toggle(scaleId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setSalaryScaleActive({ scaleId, isActive })
      if (!result.success) {
        toast.error("Could not update the scale", { description: result.error })
        return
      }
      router.refresh()
    })
  }

  const scaleColumns: DataTableColumn[] = [
    { label: "Scale" },
    { label: "Grade / Step" },
    { label: "Base Salary", align: "right" },
    { label: "On Scale", align: "right" },
    { label: "Status" },
    { label: "Action" },
  ]

  const scaleRows: DataTableRow[] = scales.map((scale) => ({
    id: scale.id,
    search: [scale.name, scale.description ?? "", scale.gradeLevel ?? "", scale.step ?? ""].join(" "),
    cells: [
      <>
        <div className="font-medium">{scale.name}</div>
        {scale.description && <div className="text-muted-foreground">{scale.description}</div>}
      </>,
      [scale.gradeLevel, scale.step].filter(Boolean).join(" · ") || "—",
      formatNaira(scale.baseSalary),
      scale.staffCount,
      scale.isActive ? "Active" : "Retired",
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => toggle(scale.id, !scale.isActive)}>
        {scale.isActive ? "Retire" : "Reactivate"}
      </Button>,
    ],
  }))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New Salary Scale</CardTitle>
          <CardDescription>
            A standard level — Grade Level 1, Senior Teacher, Principal. Assigning a scale to somebody copies its base
            salary onto their record, so a later change to the scale does not silently alter anyone's pay.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="scale-name">Name</Label>
              <Input id="scale-name" name="name" required placeholder="Senior Teacher" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gradeLevel">Grade / level</Label>
              <Input id="gradeLevel" name="gradeLevel" placeholder="GL 08" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="step">Step</Label>
              <Input id="step" name="step" placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseSalary">Base salary</Label>
              <Input id="baseSalary" name="baseSalary" type="number" min="1" step="0.01" required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="scale-description">Description</Label>
              <Input id="scale-description" name="description" placeholder="Optional" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={isPending}>Add Scale</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salary Scales</CardTitle>
          <CardDescription>
            A scale in use is retired rather than deleted, so staff already on it keep their pay history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={scaleColumns}
            rows={scaleRows}
            pageSize={10}
            unit="scales"
            searchPlaceholder="Search scale, grade or step"
            emptyMessage="No salary scales yet."
          />
        </CardContent>
      </Card>
    </div>
  )
}

type ComponentType = {
  id: string
  name: string
  kind: string
  value: string
  isActive: boolean
  isRecurring: boolean
  assignedCount: number
  isTaxable?: boolean
  timing?: string
}

/**
 * Allowance and deduction configuration.
 *
 * One component for both, because they differ only in a single extra field: an allowance is
 * taxable or not, a deduction comes before or after tax.
 */
export function ComponentTypesForm({
  kind,
  types,
}: {
  kind: "ALLOWANCE" | "DEDUCTION"
  types: ComponentType[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isAllowance = kind === "ALLOWANCE"
  const noun = isAllowance ? "allowance" : "deduction"

  function create(formData: FormData) {
    startTransition(async () => {
      const shared = {
        name: formData.get("name"),
        kind: formData.get("kind"),
        value: formData.get("value"),
        isRecurring: formData.get("isRecurring") === "on",
      }
      const result = isAllowance
        ? await createAllowanceType({ ...shared, isTaxable: formData.get("isTaxable") === "on" })
        : await createDeductionType({ ...shared, timing: formData.get("timing") })

      if (!result.success) {
        toast.error(`Could not create the ${noun}`, { description: result.error })
        return
      }
      toast.success(`${isAllowance ? "Allowance" : "Deduction"} created`)
      router.refresh()
    })
  }

  function toggle(typeId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setComponentTypeActive({ kind, typeId, isActive })
      if (!result.success) {
        toast.error(`Could not update the ${noun}`, { description: result.error })
        return
      }
      router.refresh()
    })
  }

  const typeColumns: DataTableColumn[] = [
    { label: "Name" },
    { label: "Value", align: "right" },
    { label: isAllowance ? "Taxable" : "Applies" },
    { label: "Recurring" },
    { label: "Assigned", align: "right" },
    { label: "Status" },
    { label: "Action" },
  ]

  const typeRows: DataTableRow[] = types.map((type) => ({
    id: type.id,
    search: `${type.name} ${type.isActive ? "active" : "retired"}`,
    cells: [
      <span className="font-medium">{type.name}</span>,
      type.kind === "PERCENTAGE" ? `${Number(type.value)}%` : formatNaira(type.value),
      isAllowance
        ? type.isTaxable
          ? "Taxable"
          : "Not taxable"
        : type.timing === "PRE_TAX"
          ? "Before tax"
          : "After tax",
      type.isRecurring ? "Yes" : "One-off",
      type.assignedCount,
      type.isActive ? "Active" : "Retired",
      <Button variant="outline" size="sm" disabled={isPending} onClick={() => toggle(type.id, !type.isActive)}>
        {type.isActive ? "Retire" : "Reactivate"}
      </Button>,
    ],
  }))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New {isAllowance ? "Allowance" : "Deduction"}</CardTitle>
          <CardDescription>
            {isAllowance
              ? "A percentage allowance is taken from base salary, so it scales with a part month."
              : "Before tax means it reduces the figure a percentage deduction like PAYE is then worked out on. Pension is the usual example."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor={`${kind}-name`}>Name</Label>
              <Input
                id={`${kind}-name`}
                name="name"
                required
                placeholder={isAllowance ? "Transport allowance" : "PAYE tax"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${kind}-kind`}>Type</Label>
              <Select name="kind" defaultValue="FIXED">
                <SelectTrigger id={`${kind}-kind`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed amount</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${kind}-value`}>Amount or percent</Label>
              <Input id={`${kind}-value`} name="value" type="number" min="0.01" step="0.01" required />
            </div>
            {isAllowance ? (
              <div className="flex items-end gap-3 pb-2">
                <Switch id="isTaxable" name="isTaxable" defaultChecked />
                <Label htmlFor="isTaxable">Taxable</Label>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="timing">Applies</Label>
                <Select name="timing" defaultValue="POST_TAX">
                  <SelectTrigger id="timing"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRE_TAX">Before tax</SelectItem>
                    <SelectItem value="POST_TAX">After tax</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-end gap-3 pb-2">
              <Switch id={`${kind}-isRecurring`} name="isRecurring" defaultChecked />
              <Label htmlFor={`${kind}-isRecurring`}>Recurring by default</Label>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={isPending}>Add {isAllowance ? "Allowance" : "Deduction"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isAllowance ? "Allowances" : "Deductions"}</CardTitle>
          <CardDescription>
            Retired rather than deleted: the name appears on past payslips and those must keep resolving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={typeColumns}
            rows={typeRows}
            pageSize={10}
            unit={`${noun}s`}
            searchPlaceholder={`Search ${noun} name`}
            emptyMessage={`No ${noun}s configured yet.`}
          />
        </CardContent>
      </Card>
    </div>
  )
}
