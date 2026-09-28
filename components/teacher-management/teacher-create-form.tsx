"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  Eye,
  EyeOff,
  Loader2,
  UserPlus,
  User,
  Shield,
  Mail,
  Phone,
  BookOpen,
  GraduationCap,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { StateLgaFields } from "@/components/forms/state-lga-fields"
import { cn } from "@/lib/utils"
import { createTeacher } from "@/app/actions/teacher-management"

// Define the form schema
const teacherFormSchema = z.object({
  firstName: z.string().min(2, { message: "First name must be at least 2 characters." }),
  lastName: z.string().min(2, { message: "Last name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }).optional().or(z.literal("")),
  phone: z.string().optional(),
  staffId: z.string().min(2, { message: "Staff ID must be at least 2 characters." }),
  department: z.string().optional(),
  qualification: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable(),
  dateOfBirth: z.string().optional(),
  state: z.string().optional(),
  lga: z.string().optional(),
  address: z.string().optional(),
  generatePassword: z.boolean().default(true),
  customPassword: z.string().optional(),
})

type TeacherFormValues = z.infer<typeof teacherFormSchema>

/**
 * The wizard's steps, and which fields each one owns.
 *
 * `fields` is what gets validated before the step will let you move on. Keeping the list
 * beside the step is what makes that possible — validating the whole form on every Next
 * would reject step one for a staff ID the person has not been asked for yet.
 */
const STEPS = [
  {
    id: "personal",
    title: "Personal Info",
    description: "Basic personal details about the teacher",
    icon: User,
    fields: ["firstName", "lastName", "gender", "dateOfBirth", "address", "state", "lga"],
  },
  {
    id: "professional",
    title: "Professional",
    description: "Teacher's professional details and qualifications",
    icon: BookOpen,
    fields: ["staffId", "department", "qualification"],
  },
  {
    id: "credentials",
    title: "Credentials",
    description: "Set up the teacher's login and access",
    icon: Shield,
    fields: ["email", "phone", "generatePassword", "customPassword"],
  },
] as const

type StepFields = (typeof STEPS)[number]["fields"][number]

/** Details carried over from an HR record, when HR hired this teacher first. */
export type TeacherPrefill = {
  staffId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  department: string
  qualification: string
  gender: TeacherFormValues["gender"]
  dateOfBirth: string
  address: string
}

interface TeacherCreateFormProps {
  schoolId: string
  schoolName: string
  prefill?: TeacherPrefill | null
}

export function TeacherCreateForm({ schoolId, schoolName, prefill = null }: TeacherCreateFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Initialize form
  const form = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      firstName: prefill?.firstName ?? "",
      lastName: prefill?.lastName ?? "",
      email: prefill?.email ?? "",
      phone: prefill?.phone ?? "",
      staffId: prefill?.staffId ?? "",
      department: prefill?.department ?? "",
      qualification: prefill?.qualification ?? "",
      gender: prefill?.gender ?? null,
      dateOfBirth: prefill?.dateOfBirth ?? "",
      state: "",
      lga: "",
      address: prefill?.address ?? "",
      generatePassword: true,
      customPassword: "",
    },
  })

  const generatePassword = form.watch("generatePassword")

  const [step, setStep] = useState(0)
  /** Steps the person has reached, so the stepper only lets them jump back, never skip ahead. */
  const [furthestStep, setFurthestStep] = useState(0)
  const isLastStep = step === STEPS.length - 1

  const goNext = async () => {
    // Only this step's fields, so an untouched later step cannot block progress.
    const valid = await form.trigger(STEPS[step].fields as unknown as StepFields[], {
      shouldFocus: true,
    })
    if (!valid) return
    const next = Math.min(step + 1, STEPS.length - 1)
    setStep(next)
    setFurthestStep((prev) => Math.max(prev, next))
  }

  const goBack = () => setStep((prev) => Math.max(prev - 1, 0))

  // Handle form submission
  async function onSubmit(data: TeacherFormValues) {
    setIsSubmitting(true)

    try {
      // Determine password to use
      const password = data.generatePassword ? "" : data.customPassword || ""

      // Create credentials array if email is provided
      const credentials = []

      if (data.email) {
        credentials.push({
          type: "EMAIL" as const,
          value: data.email,
          passwordHash: password,
          isPrimary: true,
        })
      }

      // Add PSN as a credential
      if (data.staffId) {
        credentials.push({
          type: "PSN" as const,
          value: data.staffId,
          passwordHash: password,
          isPrimary: !data.email, // Primary if no email
        })
      }

      const result = await createTeacher({
        ...data,
        schoolId,
        credentials: credentials.length > 0 ? credentials : undefined,
      })

      if (result.success) {
        const issuedPassword = result.data?.temporaryPassword || "Generated securely"
        toast.success("Teacher Created Successfully", {
          description:
            `Teacher ${data.firstName} ${data.lastName} has been created. Temporary password: ${issuedPassword}` +
            (result.data?.linkedToExistingHrRecord
              ? `. Linked to HR record ${result.data.staffNo}.`
              : result.data?.staffNo
                ? `. HR record ${result.data.staffNo} opened for onboarding.`
                : ""),
          action: {
            label: "Copy Password",
            onClick: () => navigator.clipboard.writeText(issuedPassword),
          },
          duration: 10000,
        })
        router.push("/dashboard/admin/teachers")
        router.refresh()
      } else {
        toast.error("Creation Failed", {
          description: result.error || "Failed to create teacher. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error creating teacher:", error)
      toast.error("Creation Failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-primary/10">
          <UserPlus className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">Create New Teacher</h3>
          <p className="text-sm text-muted-foreground">
            Add a new teacher to {schoolName} with appropriate credentials
          </p>
        </div>
      </div>

      {/* Stepper. Completed steps are clickable so somebody can go back and correct an
          answer; steps ahead are not, because they have not been validated into yet. */}
      <nav aria-label="Progress" className="mb-6">
        <ol className="flex items-center">
          {STEPS.map((entry, index) => {
            const isComplete = index < step
            const isCurrent = index === step
            const canVisit = index <= furthestStep
            const Icon = entry.icon

            return (
              <li key={entry.id} className={cn("flex items-center", index < STEPS.length - 1 && "flex-1")}>
                <button
                  type="button"
                  onClick={() => canVisit && setStep(index)}
                  disabled={!canVisit}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors",
                    canVisit ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                      isComplete && "border-primary bg-primary text-primary-foreground",
                      isCurrent && "border-primary text-primary ring-2 ring-primary/20",
                      !isComplete && !isCurrent && "border-muted-foreground/30 text-muted-foreground",
                    )}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="hidden sm:block">
                    <span
                      className={cn(
                        "block text-xs font-medium uppercase tracking-wide",
                        isCurrent ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      Step {index + 1}
                    </span>
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        isCurrent || isComplete ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {entry.title}
                    </span>
                  </span>
                </button>

                {index < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "mx-2 hidden h-px flex-1 sm:block",
                      index < step ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          // Enter inside a field would otherwise submit the whole form from step one,
          // creating a teacher before the staff ID has even been asked for.
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isLastStep) event.preventDefault()
          }}
          className="space-y-6"
        >
            {step === 0 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Basic personal details about the teacher</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter first name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter last name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="gender"
                      
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select onValueChange={(value) => field.onChange(value || null)} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="MALE">Male</SelectItem>
                              <SelectItem value="FEMALE">Female</SelectItem>
                              <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter complete address"
                            className="resize-none"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StateLgaFields form={form} stateName="state" lgaName="lga" />
                  </div>
                </CardContent>
              </Card>
            </div>
            )}

            {step === 1 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Professional Information</CardTitle>
                  <CardDescription>Teacher's professional details and qualifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="staffId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Staff ID *</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter staff ID" {...field} />
                          </FormControl>
                          <FormDescription>
                            Used to sign in. If HR has already hired this person, enter the staff
                            number HR gave them and the login is attached to that HR record.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <FormControl>
                            <Input placeholder="E.g., Science, Mathematics" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="qualification"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qualification</FormLabel>
                        <FormControl>
                          <Input placeholder="E.g., B.Ed, M.Ed, PGDE" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>
            )}

            {step === 2 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Login Credentials</CardTitle>
                  <CardDescription>Set up teacher's login credentials and access</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="Enter email address" type="email" className="pl-10" {...field} value={field.value || ""} />
                            </div>
                          </FormControl>
                          <FormDescription>This will be used as a login credential</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="Enter phone number" className="pl-10" {...field} value={field.value || ""} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <FormField
                      control={form.control}
                      name="generatePassword"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Generate Default Password</FormLabel>
                            <FormDescription>
                              Generate a secure temporary password automatically
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {!generatePassword && (
                      <FormField
                        control={form.control}
                        name="customPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Custom Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? "text" : "password"}
                                  placeholder="Enter custom password"
                                  {...field}
                                  value={field.value || ""}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                  onClick={() => setShowPassword(!showPassword)}
                                >
                                  {showPassword ? (
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  <span className="sr-only">
                                    {showPassword ? "Hide password" : "Show password"}
                                  </span>
                                </Button>
                              </div>
                            </FormControl>
                            <FormDescription>
                              Set a custom password for the teacher
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {generatePassword && (
                      <div className="rounded-lg bg-muted p-4">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          <span className="font-medium">Default Password:</span>
                          <Badge variant="outline" className="font-mono">
                            Secure password generated after account creation
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          The temporary password is shown once after account creation.
                          They will be prompted to change it on first login.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            )}

            <div className="flex items-center justify-between gap-4 border-t pt-6">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/dashboard/admin/teachers")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                {step > 0 && (
                  <Button type="button" variant="ghost" onClick={goBack} disabled={isSubmitting}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-muted-foreground tabular-nums sm:block">
                  Step {step + 1} of {STEPS.length}
                </span>
                {/* The submit button exists only on the last step. Rendering it throughout
                    and hiding it would still let a stray Enter or a screen reader fire it.
                    The `key`s are load-bearing: without them React sees one <button> replaced
                    by another in the same slot and reuses the DOM node, so clicking "Next" on
                    the second-to-last step flipped that very node's type to "submit" before
                    the browser ran the click's default action — advancing a step and
                    submitting the form in a single click. Distinct keys force a real
                    unmount/mount, so the node the browser is acting on is still type="button". */}
                {isLastStep ? (
                  <Button key="submit" type="submit" disabled={isSubmitting} className="min-w-32">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Create Teacher
                      </>
                    )}
                  </Button>
                ) : (
                  <Button key="next" type="button" onClick={goNext} className="min-w-32">
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
    </div>
  )
}
