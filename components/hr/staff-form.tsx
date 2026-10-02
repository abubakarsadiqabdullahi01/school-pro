"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { createStaff, updateStaff } from "@/app/actions/hr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SearchableSelect } from "@/components/ui/searchable-select"

const NONE = "NONE"

const STAFF_TYPES = [
  { value: "TEACHER", label: "Teacher" },
  { value: "ADMIN_STAFF", label: "Admin staff" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "CLEANER", label: "Cleaner" },
  { value: "DRIVER", label: "Driver" },
  { value: "SECURITY", label: "Security" },
  { value: "LIBRARIAN", label: "Librarian" },
  { value: "NURSE", label: "Nurse" },
  { value: "OTHER", label: "Other" },
]

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "CASUAL", label: "Casual" },
]

export type StaffFormValues = {
  id: string
  firstName: string
  lastName: string
  gender: string | null
  dateOfBirth: string | null
  phone: string | null
  email: string | null
  address: string | null
  department: string | null
  jobTitle: string | null
  staffType: string
  employmentType: string
  dateEmployed: string
  qualification: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bankName: string | null
  accountNumber: string | null
  accountName: string | null
  pensionPfa: string | null
  pensionPin: string | null
  taxId: string | null
  notes: string | null
  userId: string | null
}

function dateValue(iso?: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : ""
}

export function StaffForm({
  basePath,
  linkableUsers,
  staff,
}: {
  basePath: string
  /** Logins in this school not already claimed by another staff record. */
  linkableUsers: Array<{ id: string; name: string; role: string }>
  staff?: StaffFormValues
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [staffType, setStaffType] = useState(staff?.staffType ?? "TEACHER")
  const [employmentType, setEmploymentType] = useState(staff?.employmentType ?? "FULL_TIME")
  const [gender, setGender] = useState(staff?.gender ?? NONE)
  const [userId, setUserId] = useState(staff?.userId ?? NONE)
  const [createLogin, setCreateLogin] = useState(false)
  const [issued, setIssued] = useState<{ id: string; email: string; password: string } | null>(null)

  const isEditing = Boolean(staff)
  const [step, setStep] = useState(0)
  const [error, setError] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const steps = ["Personal details", "Employment and access", "Pay and emergency contact", "Review"]
  const [review, setReview] = useState<Record<string, string>>({})

  function nextStep() {
    const fields = formRef.current?.querySelectorAll<HTMLInputElement>(`[data-step="${step}"] input, [data-step="${step}"] textarea`)
    if (fields && Array.from(fields).some((field) => !field.reportValidity())) return
    setError("")
    if (formRef.current) setReview(Object.fromEntries(Array.from(new FormData(formRef.current).entries()).map(([key, value]) => [key, String(value)])))
    setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  function submit(formData: FormData) {
    if (step < steps.length - 1) { nextStep(); return }
    setError("")
    const payload = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      gender: gender === NONE ? undefined : gender,
      dateOfBirth: formData.get("dateOfBirth") || undefined,
      phone: formData.get("phone") || undefined,
      email: formData.get("email") || undefined,
      address: formData.get("address") || undefined,
      department: formData.get("department") || undefined,
      jobTitle: formData.get("jobTitle") || undefined,
      staffType,
      employmentType,
      dateEmployed: formData.get("dateEmployed"),
      qualification: formData.get("qualification") || undefined,
      emergencyContactName: formData.get("emergencyContactName") || undefined,
      emergencyContactPhone: formData.get("emergencyContactPhone") || undefined,
      bankName: formData.get("bankName") || undefined,
      accountNumber: formData.get("accountNumber") || undefined,
      accountName: formData.get("accountName") || undefined,
      pensionPfa: formData.get("pensionPfa") || undefined,
      pensionPin: formData.get("pensionPin") || undefined,
      taxId: formData.get("taxId") || undefined,
      notes: formData.get("notes") || undefined,
      userId: userId === NONE ? undefined : userId,
      createLogin: !isEditing && createLogin,
    }

    startTransition(async () => {
      if (staff) {
        const result = await updateStaff({ ...payload, staffId: staff.id })
        if (!result.success) {
          setError(result.error)
          toast.error("Could not save the staff record", { description: result.error })
          return
        }
        toast.success("Staff record saved")
        router.push(`${basePath}/staff/${staff.id}`)
        router.refresh()
        return
      }

      const result = await createStaff(payload)
      if (!result.success) {
        setError(result.error)
        toast.error("Could not add the staff member", { description: result.error })
        return
      }
      toast.success("Staff member added", { description: `Staff number ${result.data.staffNo}` })
      if (result.data.temporaryPassword && result.data.loginEmail) {
        setIssued({ id: result.data.id, email: result.data.loginEmail, password: result.data.temporaryPassword })
        return
      }
      router.push(`${basePath}/staff/${result.data.id}`)
      router.refresh()
    })
  }

  if (issued) return <Card>
    <CardHeader><CardTitle>Staff member and login created</CardTitle><CardDescription>Share these credentials privately. The password is displayed only here; ask the staff member to change it after signing in.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p>Login email: <strong>{issued.email}</strong></p>
      <p>Temporary password: <code>{issued.password}</code></p>
      <p>Continue with salary and supporting documents to complete onboarding.</p>
      <Button type="button" onClick={() => { router.push(`${basePath}/staff/${issued.id}`); router.refresh() }}>Open staff record</Button>
    </CardContent>
  </Card>

  return (
    <form ref={formRef} action={submit} noValidate className="space-y-6" onSubmit={(event) => {
      const fields = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>("input, textarea"))
      const invalid = fields.find((field) => !field.checkValidity())
      if (invalid) {
        event.preventDefault()
        const section = invalid.closest<HTMLElement>("[data-step]")
        setStep(Number(section?.dataset.step ?? 0))
        setError(`${invalid.labels?.[0]?.textContent ?? "Field"}: ${invalid.validationMessage}`)
        requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity() })
      }
    }}>
      <p className="text-sm text-muted-foreground">Fields marked * are required. Salary and supporting documents are completed on the staff record after saving.</p>
      <ol className="grid gap-2 sm:grid-cols-4" aria-label="Staff onboarding progress">
        {steps.map((title, index) => <li key={title} aria-current={step === index ? "step" : undefined} className={`rounded-md border p-3 text-sm ${step === index ? "border-primary text-primary font-semibold" : "text-muted-foreground"}`}>{index + 1}. {title}</li>)}
      </ol>
      {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
      <Card data-step="0" hidden={step !== 0}>
        <CardHeader>
          <CardTitle>Who they are</CardTitle>
          <CardDescription>
            A staff number is issued automatically using the prefix in the HR settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="First name *" id="firstName">
            <Input id="firstName" name="firstName" required maxLength={80} pattern=".*\S.*" defaultValue={staff?.firstName} />
          </Field>
          <Field label="Last name *" id="lastName">
            <Input id="lastName" name="lastName" required maxLength={80} pattern=".*\S.*" defaultValue={staff?.lastName} />
          </Field>
          <Field label="Gender" id="gender">
            <SearchableSelect id="gender" value={gender} onChange={setGender} options={[{ value: NONE, label: "Not stated" }, { value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }]} />
          </Field>
          <Field label="Date of birth" id="dateOfBirth">
            <Input id="dateOfBirth" name="dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={dateValue(staff?.dateOfBirth)} />
          </Field>
          <Field label="Phone" id="phone">
            <Input id="phone" name="phone" type="tel" inputMode="tel" maxLength={40} pattern="\+?[0-9 ()-]{7,40}" title="Enter at least 7 digits; spaces, brackets and hyphens are allowed" defaultValue={staff?.phone ?? ""} />
          </Field>
          <Field label={createLogin ? "Email *" : "Email"} id="email">
            <Input id="email" name="email" type="email" required={createLogin} defaultValue={staff?.email ?? ""} />
          </Field>
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" rows={2} defaultValue={staff?.address ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card data-step="1" hidden={step !== 1}>
        <CardHeader>
          <CardTitle>The job</CardTitle>
          <CardDescription>
            Linking a login means a teacher or accountant is one person with one payslip, rather than two records.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Department" id="department">
            <Choice id="department" what="department" initial={staff?.department} options={["Administration", "Finance", "Sciences", "Mathematics", "Languages", "Humanities", "ICT", "Early Years", "Primary", "Library", "Health", "Transport", "Security", "Facilities", "Other"]} />
          </Field>
          <Field label="Job title" id="jobTitle">
            <Choice id="jobTitle" what="job title" initial={staff?.jobTitle} options={["Teacher", "Senior Teacher", "Head Teacher", "Principal", "Vice Principal", "Head of Department", "Teaching Assistant", "Administrative Officer", "Accountant", "Bursar", "Librarian", "Nurse", "Driver", "Security Officer", "Cleaner", "Other"]} />
          </Field>
          <Field label="Staff type *" id="staffType">
            <SearchableSelect id="staffType" value={staffType} onChange={(value) => { setStaffType(value); setCreateLogin(false) }} options={STAFF_TYPES} />
          </Field>
          <Field label="Employment type *" id="employmentType">
            <SearchableSelect id="employmentType" value={employmentType} onChange={setEmploymentType} options={EMPLOYMENT_TYPES} />
          </Field>
          <Field label="Date employed *" id="dateEmployed">
            <Input
              id="dateEmployed"
              name="dateEmployed"
              type="date"
              required
              defaultValue={dateValue(staff?.dateEmployed) || new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Qualification" id="qualification">
            <Choice id="qualification" what="qualification" initial={staff?.qualification} options={["FSLC", "SSCE", "NCE", "ND", "HND", "B.Ed", "B.Sc", "B.A", "B.Sc (Ed)", "B.A (Ed)", "PGDE", "PGD", "M.Ed", "M.Sc", "M.A", "PhD", "Professional certification", "No formal qualification", "Other"]} />
          </Field>
          <Field label="Linked login" id="userId">
            <SearchableSelect id="userId" value={userId} onChange={(value) => { setUserId(value); if (value !== NONE) setCreateLogin(false) }} options={[
              { value: NONE, label: "No login" },
              ...(staff?.userId && !linkableUsers.some((user) => user.id === staff.userId) ? [{ value: staff.userId, label: "Currently linked" }] : []),
              ...linkableUsers.map((user) => ({ value: user.id, label: `${user.name} (${user.role.toLowerCase().replace(/_/g, " ")})` })),
            ]} />
          </Field>
          {!isEditing && ["TEACHER", "ACCOUNTANT"].includes(staffType) && <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="createLogin">System access</Label>
            <SearchableSelect id="createLogin" value={createLogin ? "CREATE" : "LATER"} onChange={(value) => { setCreateLogin(value === "CREATE"); if (value === "CREATE") setUserId(NONE) }} options={[{ value: "LATER", label: "No new login / link an existing login" }, { value: "CREATE", label: "Create login with this staff record (email required)" }]} />
            <p className="text-sm text-muted-foreground">Teachers with a login appear in Teachers for class and subject assignments. Creating accountant access requires finance setup permission.</p>
          </div>}
        </CardContent>
      </Card>

      <Card data-step="2" hidden={step !== 2}>
        <CardHeader>
          <CardTitle>Pay and next of kin</CardTitle>
          <CardDescription>Bank details are where salary is sent, so payroll never has to ask again.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Bank name" id="bankName">
            <Choice id="bankName" what="bank" initial={staff?.bankName} options={["Access Bank", "Fidelity Bank", "First Bank of Nigeria", "First City Monument Bank", "Guaranty Trust Bank", "United Bank for Africa", "Zenith Bank", "Other"]} />
          </Field>
          <Field label="Account number" id="accountNumber">
            <Input id="accountNumber" name="accountNumber" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} title="Enter a 10-digit bank account number" defaultValue={staff?.accountNumber ?? ""} />
          </Field>
          <Field label="Account name" id="accountName">
            <Input id="accountName" name="accountName" defaultValue={staff?.accountName ?? ""} />
          </Field>
          <Field label="Pension provider" id="pensionPfa">
            <Input id="pensionPfa" name="pensionPfa" defaultValue={staff?.pensionPfa ?? ""} />
          </Field>
          <Field label="Pension PIN" id="pensionPin">
            <Input id="pensionPin" name="pensionPin" defaultValue={staff?.pensionPin ?? ""} />
          </Field>
          <Field label="Tax ID" id="taxId">
            <Input id="taxId" name="taxId" defaultValue={staff?.taxId ?? ""} />
          </Field>
          <Field label="Emergency contact" id="emergencyContactName">
            <Input
              id="emergencyContactName"
              name="emergencyContactName"
              defaultValue={staff?.emergencyContactName ?? ""}
            />
          </Field>
          <Field label="Emergency phone" id="emergencyContactPhone">
            <Input
              id="emergencyContactPhone"
              name="emergencyContactPhone"
              type="tel"
              inputMode="tel"
              maxLength={40}
              pattern="\+?[0-9 ()-]{7,40}"
              title="Enter at least 7 digits; spaces, brackets and hyphens are allowed"
              defaultValue={staff?.emergencyContactPhone ?? ""}
            />
          </Field>
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={staff?.notes ?? ""} />
          </div>
        </CardContent>
      </Card>

      {step === 3 && <Card><CardHeader><CardTitle>Review staff onboarding</CardTitle><CardDescription>Check the information before saving. Use Back to make corrections.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <p><strong>Name:</strong> {review.firstName} {review.lastName}</p>
          <p><strong>Staff type:</strong> {STAFF_TYPES.find((item) => item.value === staffType)?.label}</p>
          <p><strong>Employment:</strong> {EMPLOYMENT_TYPES.find((item) => item.value === employmentType)?.label} · {review.dateEmployed}</p>
          <p><strong>Department / job:</strong> {review.department || "Not provided"} / {review.jobTitle || "Not provided"}</p>
          <p><strong>Email:</strong> {review.email || "Not provided"}</p>
          <p><strong>Access:</strong> {createLogin ? "Create a new login" : userId !== NONE ? "Link existing login" : "No login"}</p>
          <p><strong>Bank:</strong> {review.bankName || "Not provided"} {review.accountNumber ? `· ending ${review.accountNumber.slice(-4)}` : ""}</p>
          <p className="text-sm text-muted-foreground">New staff remain in the onboarding queue until required details, salary and documents are completed. Creating a record does not approve it for payroll.</p>
        </CardContent></Card>}
      <div className="flex gap-2">
        {step > 0 && <Button type="button" variant="outline" disabled={isPending} onClick={() => setStep(step - 1)}>Back</Button>}
        {step < steps.length - 1
          ? <Button type="button" onClick={nextStep}>Next</Button>
          : <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : isEditing ? "Save changes" : "Create staff record"}</Button>}
      </div>
    </form>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

/**
 * A searchable list for a field schools mostly fill the same way, so the same value is not
 * typed five ways. "Other" asks for the actual value rather than storing the word "Other",
 * and a value saved before the list existed is kept and offered as it was.
 */
function Choice({ id, what, initial, options }: { id: string; what: string; initial?: string | null; options: string[] }) {
  const [value, setValue] = useState(initial ?? "")
  const choices = initial && !options.includes(initial) ? [initial, ...options] : options
  const other = value === "Other"
  return (
    <>
      <input type="hidden" name={id} value={value} disabled={other} />
      <SearchableSelect id={id} options={choices} value={value} onChange={setValue} allowClear />
      {other && (
        <>
          <Label htmlFor={`${id}-other`}>Specify the {what} *</Label>
          <Input id={`${id}-other`} name={id} required maxLength={120} />
        </>
      )}
    </>
  )
}
