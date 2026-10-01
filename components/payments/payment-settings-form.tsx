"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  CreditCard,
  ExternalLink,
  KeyRound,
  Landmark,
  Loader2,
  LockKeyhole,
  ShieldAlert,
  WalletCards,
} from "lucide-react"
import { toast } from "sonner"

import {
  choosePaymentGatewayMode,
  connectPlatformManagedPaystack,
  connectSchoolOwnedPaystack,
  getPaymentBanks,
  resolvePaymentSettlementAccount,
  setPaymentGatewayEnabled,
  updatePaymentGatewayPolicy,
} from "@/app/actions/payment-settings"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { PaymentSettingsDto } from "@/lib/payments/payment-settings.server"

type PaymentMode = "OFFLINE" | "PLATFORM_MANAGED" | "SCHOOL_OWNED"
type Bank = { name: string; code: string }

function statusLabel(status?: string) {
  switch (status) {
    case "READY":
      return "Verified"
    case "PENDING_VERIFICATION":
      return "Verification pending"
    case "SUSPENDED":
      return "Suspended"
    case "DISABLED":
      return "Offline"
    default:
      return "Setup required"
  }
}

export function PaymentSettingsForm({ initialData }: { initialData: PaymentSettingsDto }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const configuration = initialData.configuration
  const [mode, setMode] = useState<PaymentMode>(
    configuration?.status === "DISABLED" ? "OFFLINE" : (configuration?.accountMode ?? "OFFLINE"),
  )
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankCode, setBankCode] = useState(configuration?.settlementBankCode ?? "")
  const [accountNumber, setAccountNumber] = useState("")
  const [accountName, setAccountName] = useState("")
  const [businessName, setBusinessName] = useState(configuration?.businessName ?? initialData.school.name)
  const [secretKey, setSecretKey] = useState("")
  const [publicKey, setPublicKey] = useState("")
  const [channels, setChannels] = useState<string[]>(
    configuration?.allowedChannels.length ? configuration.allowedChannels : ["card", "bank_transfer"],
  )
  // A school that has already chosen keeps its choice. A school setting this up for the
  // first time starts on the payer, matching the database default, because adopting online
  // payment should not quietly cost the school 1.5% of every fee it collects.
  const [feePolicy, setFeePolicy] = useState<"SCHOOL_PAYS" | "PARENT_PAYS_GROSS_UP">(
    configuration ? (configuration.feePolicy === "PARENT_PAYS_GROSS_UP" ? "PARENT_PAYS_GROSS_UP" : "SCHOOL_PAYS")
      : "PARENT_PAYS_GROSS_UP",
  )
  const [partialPayments, setPartialPayments] = useState(configuration?.allowPartialPayments ?? false)

  const environment = initialData.environment

  function run(task: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    startTransition(async () => {
      const result = await task()
      if (!result.success) {
        toast.error(result.error || "The payment setting could not be saved")
        return
      }
      toast.success(successMessage)
      router.refresh()
    })
  }

  function saveMode(nextMode: PaymentMode) {
    setMode(nextMode)
    run(
      () => choosePaymentGatewayMode({ environment, mode: nextMode }),
      nextMode === "OFFLINE" ? "Online payments disabled" : "Payment connection type saved",
    )
  }

  async function loadBanks() {
    startTransition(async () => {
      const result = await getPaymentBanks({ environment })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setBanks(result.data)
      toast.success(`Loaded ${result.data.length} settlement banks`)
    })
  }

  async function resolveAccount() {
    startTransition(async () => {
      setAccountName("")
      const result = await resolvePaymentSettlementAccount({ environment, bankCode, accountNumber })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setAccountName(result.data.accountName)
      toast.success("Bank account verified")
    })
  }

  const ready = configuration?.status === "READY"
  const enabled = configuration?.isEnabled === true

  return (
    <div className="space-y-6">
      {environment === "LIVE" ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Live money configuration</AlertTitle>
          <AlertDescription>
            Live activation is blocked until the test connection has been verified. Verify settlement ownership and
            run the complete test checkout before enabling this environment.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Test environment</AlertTitle>
          <AlertDescription>No real money is processed here. Complete this setup before configuring live keys.</AlertDescription>
        </Alert>
      )}

      {initialData.payerContactReadiness.missingEmail > 0 ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Parent email cleanup required</AlertTitle>
          <AlertDescription>
            {initialData.payerContactReadiness.missingEmail} of {initialData.payerContactReadiness.parentAccounts} parent accounts
            {initialData.payerContactReadiness.missingEmail === 1 ? " is" : " are"} missing an email login. Checkout will remain
            unavailable to those parents until an administrator adds a unique email to their profile.
          </AlertDescription>
        </Alert>
      ) : initialData.payerContactReadiness.parentAccounts > 0 ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Parent contact readiness passed</AlertTitle>
          <AlertDescription>All {initialData.payerContactReadiness.parentAccounts} parent accounts have an email for Paystack checkout.</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Choose how this school receives online payments</CardTitle>
          <CardDescription>The school may stay offline, use DigiSchool's integration, or connect its own Paystack account.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={mode} onValueChange={(value) => saveMode(value as PaymentMode)} className="grid gap-4 lg:grid-cols-3">
            <ModeOption
              value="OFFLINE"
              title="Offline only"
              icon={CircleDollarSign}
              description="Keep cash, POS, cheque and manually recorded bank transfers. No parent checkout."
            />
            <ModeOption
              value="PLATFORM_MANAGED"
              title="DigiSchool-managed"
              icon={Landmark}
              description="Use DigiSchool's Paystack integration. Settlement still goes to this school's verified bank account."
            />
            <ModeOption
              value="SCHOOL_OWNED"
              title="School-owned Paystack"
              icon={KeyRound}
              description="The school opens Paystack and owns its keys, settlement settings, refunds and disputes."
            />
          </RadioGroup>
        </CardContent>
      </Card>

      {mode === "PLATFORM_MANAGED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />2. Verify the school's settlement account</CardTitle>
            <CardDescription>
              DigiSchool supplies the API connection; the account name and bank account must belong to the school or its authorized proprietor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!initialData.platformConnectionAvailable ? (
              <Alert variant="destructive">
                <LockKeyhole className="h-4 w-4" />
                <AlertTitle>Platform {environment.toLowerCase()} key is not configured</AlertTitle>
                <AlertDescription>Add the matching Paystack key to the server environment before bank verification.</AlertDescription>
              </Alert>
            ) : null}

            {configuration?.subaccountCode ? (
              <div className="rounded-lg border bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Settlement account verified</div>
                <p className="mt-1">Account ending •••• {configuration.settlementAccountLast4} · Subaccount {configuration.subaccountCode}</p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="business-name">Legal school/business name</Label>
                <Input id="business-name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={191} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Settlement bank</Label>
                  <Button type="button" variant="outline" size="sm" onClick={loadBanks} disabled={pending || !initialData.platformConnectionAvailable}>
                    {pending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}Load banks
                  </Button>
                </div>
                <Select value={bankCode} onValueChange={setBankCode}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>
                    {banks.map((bank) => <SelectItem key={bank.code} value={bank.code}>{bank.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-number">10-digit account number</Label>
                <Input id="account-number" inputMode="numeric" maxLength={10} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={resolveAccount} disabled={pending || !bankCode || accountNumber.length !== 10}>
                Verify account name
              </Button>
              {accountName ? <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">{accountName}</Badge> : null}
            </div>

            <Button
              type="button"
              disabled={pending || !initialData.platformConnectionAvailable || !accountName}
              onClick={() => run(
                () => connectPlatformManagedPaystack({ environment, businessName, bankCode, accountNumber }),
                "School settlement account connected; payments remain disabled",
              )}
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Landmark className="mr-2 h-4 w-4" />}
              Save verified settlement account
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {mode === "SCHOOL_OWNED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />2. Connect the school's Paystack account</CardTitle>
            <CardDescription>
              Keys are verified with a read-only Paystack request, encrypted before storage, and never displayed again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!initialData.schoolOwnedEncryptionAvailable ? (
              <Alert variant="destructive">
                <LockKeyhole className="h-4 w-4" />
                <AlertTitle>Encrypted credential storage is not configured</AlertTitle>
                <AlertDescription>Set PAYMENT_GATEWAY_ENCRYPTION_KEY on the server before entering a school secret key.</AlertDescription>
              </Alert>
            ) : null}

            {configuration?.credential ? (
              <div className="rounded-lg border bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />School-owned connection verified</div>
                <p className="mt-1">Encrypted secret ending •••• {configuration.credential.secretLast4}</p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="school-secret">{environment === "TEST" ? "Test" : "Live"} secret key</Label>
                <Input id="school-secret" type="password" autoComplete="new-password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} placeholder={`sk_${environment.toLowerCase()}_...`} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school-public">Public key (optional for redirect checkout)</Label>
                <Input id="school-public" value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder={`pk_${environment.toLowerCase()}_...`} />
              </div>
            </div>

            <Button
              type="button"
              disabled={pending || !initialData.schoolOwnedEncryptionAvailable || secretKey.length < 12}
              onClick={() => run(
                async () => {
                  const result = await connectSchoolOwnedPaystack({ environment, secretKey, publicKey })
                  if (result.success) {
                    setSecretKey("")
                    setPublicKey("")
                  }
                  return result
                },
                "School Paystack account verified and encrypted; payments remain disabled",
              )}
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}
              Verify and save encrypted connection
            </Button>

            {configuration?.credential?.webhookUrl ? (
              <div className="space-y-2 rounded-lg border p-4">
                <Label>Webhook URL for this school-owned Paystack account</Label>
                <div className="flex gap-2">
                  <Input readOnly value={configuration.credential.webhookUrl} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={async () => {
                    await navigator.clipboard.writeText(configuration.credential!.webhookUrl)
                    toast.success("Webhook URL copied")
                  }}><Copy className="h-4 w-4" /></Button>
                </div>
                <p className="text-xs text-muted-foreground">Enter this exact URL in that school's Paystack dashboard.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {mode !== "OFFLINE" && configuration ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" />3. Payment policy</CardTitle>
            <CardDescription>These settings are snapshotted when a checkout begins, so later changes cannot rewrite an existing payment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Channels offered to parents</Label>
              {(["card", "bank_transfer"] as const).map((channel) => (
                <label key={channel} className="flex items-center gap-3 rounded-lg border p-3">
                  <Checkbox
                    checked={channels.includes(channel)}
                    onCheckedChange={(checked) => setChannels((current) => checked ? [...new Set([...current, channel])] : current.filter((item) => item !== channel))}
                  />
                  <span className="text-sm font-medium">{channel === "card" ? "Card" : "Pay with Transfer"}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Who covers Paystack's processing fee?</Label>
              <Select value={feePolicy} onValueChange={(value) => setFeePolicy(value as typeof feePolicy)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHOOL_PAYS">School absorbs the fee</SelectItem>
                  <SelectItem value="PARENT_PAYS_GROSS_UP">Parent pays published standard fee on top</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Parent-paid gross-up uses Paystack's published standard Nigerian local rate. Schools with negotiated or education pricing should keep “School absorbs” until their exact rate is configured. Platform-paid fees are not a school-controlled setting.</p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-medium">Allow part payments</p>
                <p className="text-sm text-muted-foreground">Parents may pay less than the full selected balance.</p>
              </div>
              <Switch checked={partialPayments} onCheckedChange={setPartialPayments} />
            </div>

            <Button type="button" disabled={pending || channels.length === 0} onClick={() => run(
              () => updatePaymentGatewayPolicy({ environment, channels, feePolicy, allowPartialPayments: partialPayments }),
              "Payment policy saved",
            )}>
              Save payment policy
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {mode !== "OFFLINE" && configuration ? (
        <Card className={enabled ? "border-emerald-300" : "border-amber-300"}>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />4. Activation</CardTitle>
                <CardDescription>Connection and policy changes never activate checkout automatically.</CardDescription>
              </div>
              <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Enabled" : statusLabel(configuration.status)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm md:grid-cols-3">
              <Readiness ok={ready} label="Provider connection verified" />
              <Readiness ok={channels.length > 0} label="At least one channel selected" />
              <Readiness ok={!enabled || ready} label="Explicit activation recorded" />
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant={enabled ? "outline" : "default"} disabled={pending || (!enabled && !ready)}>
                  {enabled ? "Disable online payments" : `Enable ${environment.toLowerCase()} online payments`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{enabled ? "Disable online payments?" : `Enable ${environment.toLowerCase()} payments?`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {enabled
                      ? "New parent checkouts will stop. Existing confirmed payments and receipts remain intact."
                      : "Parents will see Pay online on their child's fees and can pay through Paystack using this verified configuration. You can switch it off again at any time."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => run(
                    () => setPaymentGatewayEnabled({ environment, enabled: !enabled, confirmation: true }),
                    enabled ? "Online payments disabled" : "Payment configuration enabled",
                  )}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <a href="https://dashboard.paystack.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Open Paystack dashboard <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function ModeOption({
  value,
  title,
  description,
  icon: Icon,
}: {
  value: PaymentMode
  title: string
  description: string
  icon: typeof CircleDollarSign
}) {
  return (
    <Label htmlFor={`payment-mode-${value}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-muted/40">
      <RadioGroupItem id={`payment-mode-${value}`} value={value} className="mt-1" />
      <Icon className="mt-0.5 h-5 w-5 text-primary" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm font-normal text-muted-foreground">{description}</span>
      </span>
    </Label>
  )
}

function Readiness({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border p-3">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
      <span>{label}</span>
    </div>
  )
}
