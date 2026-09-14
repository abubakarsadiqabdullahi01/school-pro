"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createStaff, updateStaff } from "@/app/actions/hr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

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

  const isEditing = Boolean(staff)

  function submit(formData: FormData) {
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
    }

    startTransition(async () => {
      if (staff) {
        const result = await updateStaff({ ...payload, staffId: staff.id })
        if (!result.success) {
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
        toast.error("Could not add the staff member", { description: result.error })
        return
      }
      toast.success("Staff member added", { description: `Staff number ${result.data.staffNo}` })
      router.push(`${basePath}/staff/${result.data.id}`)
      router.refresh()
    })
  }

  return (
    <form action={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Who they are</CardTitle>
          <CardDescription>
            A staff number is issued automatically using the prefix in the HR settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" id="firstName">
            <Input id="firstName" name="firstName" required defaultValue={staff?.firstName} />
          </Field>
          <Field label="Last name" id="lastName">
            <Input id="lastName" name="lastName" required defaultValue={staff?.lastName} />
          </Field>
          <Field label="Gender" id="gender">
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="gender"><SelectValue placeholder="Not stated" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not stated</SelectItem>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date of birth" id="dateOfBirth">
            <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={dateValue(staff?.dateOfBirth)} />
          </Field>
          <Field label="Phone" id="phone">
            <Input id="phone" name="phone" defaultValue={staff?.phone ?? ""} />
          </Field>
          <Field label="Email" id="email">
            <Input id="email" name="email" type="email" defaultValue={staff?.email ?? ""} />
          </Field>
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" rows={2} defaultValue={staff?.address ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The job</CardTitle>
          <CardDescription>
            Linking a login means a teacher or accountant is one person with one payslip, rather than two records.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Department" id="department">
            <Input id="department" name="department" defaultValue={staff?.department ?? ""} placeholder="Sciences" />
          </Field>
          <Field label="Job title" id="jobTitle">
            <Input id="jobTitle" name="jobTitle" defaultValue={staff?.jobTitle ?? ""} placeholder="Senior Teacher" />
          </Field>
          <Field label="Staff type" id="staffType">
            <Select value={staffType} onValueChange={setStaffType}>
              <SelectTrigger id="staffType"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAFF_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Employment type" id="employmentType">
            <Select value={employmentType} onValueChange={setEmploymentType}>
              <SelectTrigger id="employmentType"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date employed" id="dateEmployed">
            <Input
              id="dateEmployed"
              name="dateEmployed"
              type="date"
              required
              defaultValue={dateValue(staff?.dateEmployed) || new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Qualification" id="qualification">
            <Input id="qualification" name="qualification" defaultValue={staff?.qualification ?? ""} />
          </Field>
          <Field label="Linked login" id="userId">
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="userId"><SelectValue placeholder="No login" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No login</SelectItem>
                {staff?.userId && !linkableUsers.some((user) => user.id === staff.userId) && (
                  <SelectItem value={staff.userId}>Currently linked</SelectItem>
                )}
                {linkableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.role.toLowerCase().replace("_", " ")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pay and next of kin</CardTitle>
          <CardDescription>Bank details are where salary is sent, so payroll never has to ask again.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Bank name" id="bankName">
            <Input id="bankName" name="bankName" defaultValue={staff?.bankName ?? ""} />
          </Field>
          <Field label="Account number" id="accountNumber">
            <Input id="accountNumber" name="accountNumber" defaultValue={staff?.accountNumber ?? ""} />
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
              defaultValue={staff?.emergencyContactPhone ?? ""}
            />
          </Field>
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={staff?.notes ?? ""} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isEditing ? "Save changes" : "Add staff member"}
        </Button>
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
