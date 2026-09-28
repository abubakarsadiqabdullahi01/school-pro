"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Power } from "lucide-react"
import { toast } from "sonner"

import {
  applyUnappliedPayment,
  assignDedicatedAccount,
  assignMissingDedicatedAccounts,
  deactivateDedicatedAccount,
  markUnappliedReturned,
  requestDedicatedIdentification,
  setDedicatedAccountSettings,
} from "@/app/actions/dedicated-accounts"
import { provideRefundBankDetails, requestUnappliedRefund } from "@/app/actions/gateway-operations-slice7"
import { getPaymentBanks } from "@/app/actions/payment-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

type Bank = "wema-bank" | "titan-paystack"

export function DedicatedAccountSettings({ enabled, bank, environment }: { enabled: boolean; bank: string | null; environment: "TEST" | "LIVE" }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [liveBank, setLiveBank] = useState<Bank>(bank === "titan-paystack" ? "titan-paystack" : "wema-bank")
  const [pending, start] = useTransition()

  function save(nextOn: boolean, nextBank: Bank) {
    start(async () => {
      const result = await setDedicatedAccountSettings({ enabled: nextOn, bank: nextBank })
      if (!result.success) {
        setOn(enabled)
        toast.error(result.error)
        return
      }
      toast.success(nextOn ? "Dedicated accounts are on" : "Dedicated accounts are off")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-6">
      <div className="flex items-center gap-3">
        <Switch id="dva-enabled" checked={on} disabled={pending} onCheckedChange={(value) => { setOn(value); save(value, liveBank) }} />
        <Label htmlFor="dva-enabled">Give students dedicated account numbers</Label>
      </div>
      {environment === "LIVE" ? (
        <div className="w-56">
          <Label htmlFor="dva-bank">Partner bank for new accounts</Label>
          <Select value={liveBank} disabled={pending} onValueChange={(value) => { setLiveBank(value as Bank); save(on, value as Bank) }}>
            <SelectTrigger id="dva-bank" className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="wema-bank">Wema Bank</SelectItem>
              <SelectItem value="titan-paystack">Titan Trust (Paystack)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Test mode uses Paystack&apos;s test bank.</p>
      )}
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" />}
    </div>
  )
}

export function AssignMissingButton({ remaining }: { remaining: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failures, setFailures] = useState<Array<{ name: string; error: string }>>([])

  return (
    <div className="space-y-2">
      <Button disabled={pending || remaining === 0} onClick={() => start(async () => {
        const result = await assignMissingDedicatedAccounts()
        if (!result.success) return void toast.error(result.error)
        setFailures(result.data.failures)
        toast.success(`Created ${result.data.created} account${result.data.created === 1 ? "" : "s"}; ${result.data.remaining} student${result.data.remaining === 1 ? "" : "s"} still without one`)
        router.refresh()
      })}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        {pending ? "Creating…" : `Create accounts (next ${Math.min(remaining, 25)})`}
      </Button>
      {failures.length > 0 && (
        <ul className="space-y-1 text-sm text-destructive" role="alert">
          {failures.map((failure) => <li key={failure.name}>{failure.name}: {failure.error}</li>)}
        </ul>
      )}
    </div>
  )
}

export function AssignOneButton({ studentId }: { studentId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
      const result = await assignDedicatedAccount({ studentId })
      if (!result.success) return void toast.error(result.error)
      toast.success(`Account ${result.data.accountNumber} (${result.data.bankName}) created`)
      router.refresh()
    })}>{pending ? "Creating…" : "Create account"}</Button>
  )
}

export function DeactivateAccountButton({ accountId, accountNumber }: { accountId: string; accountNumber: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  if (!confirming) {
    return <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}><Power className="mr-1 h-4 w-4" />Deactivate</Button>
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs">Transfers to {accountNumber} will stop. Continue?</span>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => {
        const result = await deactivateDedicatedAccount({ accountId, confirmation: true })
        if (!result.success) return void toast.error(result.error)
        toast.success(`Account ${accountNumber} deactivated`)
        router.refresh()
      })}>Deactivate</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
    </div>
  )
}

export function UnappliedActions({ id, canApply, canReturn }: { id: string; canApply: boolean; canReturn: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<"idle" | "return">("idle")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  if (mode === "return") {
    return (
      <div className="space-y-2">
        <Label htmlFor={`return-${id}`}>How was it returned?</Label>
        <Input id={`return-${id}`} value={note} maxLength={500} placeholder="e.g. Transferred back from the school account on 3 Oct" onChange={(event) => setNote(event.target.value)} />
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={pending || note.trim().length < 10} onClick={() => start(async () => {
            const result = await markUnappliedReturned({ id, note, confirmation: true })
            if (!result.success) return setError(result.error)
            router.refresh()
          })}>Mark returned</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("idle")}>Cancel</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {canApply && (
          <Button size="sm" disabled={pending} onClick={() => start(async () => {
            setError("")
            const result = await applyUnappliedPayment({ id, confirmation: true })
            if (!result.success) return setError(result.error)
            toast.success(`Applied to fees — receipt ${result.data.receiptNo}`)
            router.refresh()
          })}>Apply to fees</Button>
        )}
        {canReturn && <Button size="sm" variant="outline" onClick={() => setMode("return")}>Returned to payer</Button>}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}

function useBanks(environment: "TEST" | "LIVE") {
  const [banks, setBanks] = useState<Array<{ name: string; code: string; id: number | null }> | null>(null)
  const [error, setError] = useState("")
  async function load() {
    if (banks) return
    const result = await getPaymentBanks({ environment })
    if (!result.success) return setError(result.error)
    setBanks(result.data)
  }
  return { banks, error, load }
}

/** Sends a payer's BVN and bank account to Paystack. Nothing typed here is stored by DigiSchool. */
export function IdentifyPayerButton({ studentId, environment }: { studentId: string; environment: "TEST" | "LIVE" }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ firstName: "", lastName: "", bvn: "", bankCode: "", accountNumber: "" })
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  const { banks, error: bankError, load } = useBanks(environment)

  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => { setOpen(true); void load() }}>Verify payer</Button>
  }
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value })
  return (
    <div className="space-y-2 rounded-md border p-3 text-left">
      <p className="text-xs text-muted-foreground">The payer&apos;s name exactly as on their BVN. DigiSchool sends these to Paystack and does not keep the BVN or account number.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="First name" placeholder="First name" value={form.firstName} onChange={set("firstName")} />
        <Input aria-label="Last name" placeholder="Last name" value={form.lastName} onChange={set("lastName")} />
        <Input aria-label="BVN" placeholder="BVN (11 digits)" inputMode="numeric" maxLength={11} value={form.bvn} onChange={set("bvn")} />
        <Input aria-label="Account number" placeholder="Account number" inputMode="numeric" maxLength={10} value={form.accountNumber} onChange={set("accountNumber")} />
      </div>
      <Select value={form.bankCode} onValueChange={(value) => setForm({ ...form, bankCode: value })}>
        <SelectTrigger aria-label="Bank"><SelectValue placeholder={banks ? "Payer's bank" : "Loading banks…"} /></SelectTrigger>
        <SelectContent>{banks?.map((bank) => <SelectItem key={bank.code} value={bank.code}>{bank.name}</SelectItem>)}</SelectContent>
      </Select>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" />
        The payer has agreed to these details being sent to Paystack to verify their identity.
      </label>
      {(error || bankError) && <p className="text-sm text-destructive" role="alert">{error || bankError}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !consent} onClick={() => start(async () => {
          setError("")
          const result = await requestDedicatedIdentification({ studentId, ...form, consent: true })
          if (!result.success) return setError(result.error)
          toast.success("Sent to Paystack. The account is created when Paystack confirms.")
          setOpen(false)
          router.refresh()
        })}>{pending ? "Sending…" : "Send to Paystack"}</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  )
}

export function RequiresIdentificationSwitch({ enabled, bank, requiresIdentification }: { enabled: boolean; bank: string | null; requiresIdentification: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(requiresIdentification)
  const [pending, start] = useTransition()
  return (
    <div className="flex items-center gap-3">
      <Switch id="dva-identification" checked={on} disabled={pending} onCheckedChange={(value) => {
        setOn(value)
        start(async () => {
          const result = await setDedicatedAccountSettings({ enabled, bank: bank === "titan-paystack" ? "titan-paystack" : "wema-bank", requiresIdentification: value })
          if (!result.success) { setOn(!value); toast.error(result.error); return }
          router.refresh()
        })
      }} />
      <Label htmlFor="dva-identification">Paystack requires payer identification (BVN) before accounts are created</Label>
    </div>
  )
}

export function RefundHeldMoneyButton({ id }: { id: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Refund through Paystack</Button>
  return (
    <div className="space-y-2">
      <Label htmlFor={`refund-held-${id}`}>Reason</Label>
      <Input id={`refund-held-${id}`} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
      <p className="text-xs text-muted-foreground">A second authorised person must approve it before it is sent.</p>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || reason.trim().length < 10} onClick={() => start(async () => {
          const result = await requestUnappliedRefund({ unappliedId: id, reason, confirmation: true })
          if (!result.success) return setError(result.error)
          toast.success("Refund requested; waiting for approval")
          setOpen(false)
          router.refresh()
        })}>Request refund</Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  )
}

/** Paystack could not pay a transfer refund back on its own and needs the payer's account. */
export function RefundBankDetailsForm({ refundId, environment }: { refundId: string; environment: "TEST" | "LIVE" }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [accountNumber, setAccountNumber] = useState("")
  const [bankId, setBankId] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  const { banks, error: bankError, load } = useBanks(environment)
  if (!open) return <Button size="sm" onClick={() => { setOpen(true); void load() }}>Give payer&apos;s bank account</Button>
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Input aria-label="Payer's account number" placeholder="Account number" inputMode="numeric" maxLength={10} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} />
      <Select value={bankId} onValueChange={setBankId}>
        <SelectTrigger aria-label="Payer's bank"><SelectValue placeholder={banks ? "Payer's bank" : "Loading banks…"} /></SelectTrigger>
        <SelectContent>{banks?.filter((bank) => bank.id !== null).map((bank) => <SelectItem key={bank.id} value={String(bank.id)}>{bank.name}</SelectItem>)}</SelectContent>
      </Select>
      {(error || bankError) && <p className="text-sm text-destructive" role="alert">{error || bankError}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || accountNumber.length !== 10 || !bankId} onClick={() => start(async () => {
          const result = await provideRefundBankDetails({ refundId, accountNumber, bankId, confirmation: true })
          if (!result.success) return setError(result.error)
          toast.success("Sent to Paystack")
          setOpen(false)
          router.refresh()
        })}>Send to Paystack</Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  )
}
