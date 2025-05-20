"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { motion, AnimatePresence } from "framer-motion"
import { Check, Loader2, Plus, Search, User } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Stepper, Step, StepDescription, StepTitle } from "@/components/student-management/stepper"
import { ParentSearchDialog } from "@/components/student-management/parent-search-dialog"
import { createStudent, getCurrentSessionAndTerm, getClasses } from "@/app/actions/student-management"
import { FormSkeleton } from "@/components/ui/loading-skeleton"
import { Gender } from "@prisma/client";


// Define the form schema for student registration
const studentFormSchema = z.object({
  // Personal Information
  firstName: z.string().min(2, { message: "First name must be at least 2 characters." }),
  lastName: z.string().min(2, { message: "Last name must be at least 2 characters." }),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid date.",
  }),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  state: z.string().optional(),
  lga: z.string().optional(),
  address: z.string().optional(),

  // Academic Information
  classId: z.string().min(1, { message: "Please select a class." }),
  termId: z.string().min(1, { message: "Please select a term." }),
  year: z.number().int().min(2000).max(new Date().getFullYear() + 1).optional(),

  // Contact Information
  phone: z.string().optional(),

  // Parent/Guardian Information
  parentId: z.string().optional(),
  relationship: z.string().optional(),

  // Account Information
  isActive: z.boolean().default(true),
  createLoginCredentials: z.boolean().default(true),
})

type StudentFormValues = z.infer<typeof studentFormSchema>

interface ClassOption {
  id: string
  name: string
  level: string
}

export default function StudentForm() {
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedParent, setSelectedParent] = useState<any>(null)
  const [isParentDialogOpen, setIsParentDialogOpen] = useState(false)
  const [currentSession, setCurrentSession] = useState<{ id: string; name: string } | null>(null)
  const [currentTerm, setCurrentTerm] = useState<{ id: string; name: string } | null>(null)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [generatedAdmissionNo, setGeneratedAdmissionNo] = useState("")
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  // Fetch current session, term, and classes when component mounts
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        // Fetch current session and term
        const sessionResult = await getCurrentSessionAndTerm()
        if (sessionResult.success && sessionResult.data) {
          setCurrentSession({
            id: sessionResult.data.sessionId,
            name: sessionResult.data.sessionName,
          })
          setCurrentTerm({
            id: sessionResult.data.termId,
            name: sessionResult.data.termName,
          })

          // Update the form with the current term ID
          form.setValue("termId", sessionResult.data.termId)
        } else {
          toast.error("Error", {
            description: sessionResult.error || "Failed to fetch current session and term",
          })
        }

        // Fetch classes
        const classesResult = await getClasses()
        if (classesResult.success && classesResult.data) {
          setClasses(classesResult.data)
        } else {
          toast.error("Error", {
            description: classesResult.error || "Failed to fetch classes",
          })
        }

        // Generate admission number
        const regNumber = `STD/${currentYear}/${Math.floor(1000 + Math.random() * 9000)}`
        setGeneratedAdmissionNo(regNumber)
      } catch (error) {
        console.error("Error fetching data:", error)
        toast.error("Error", {
          description: "Failed to fetch required data. Please try again.",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  // Initialize form
  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: undefined, // Explicitly undefined to match schema
      state: "",
      lga: "",
      address: "",
      classId: "",
      termId: "",
      year: currentYear,
      phone: "",
      parentId: "",
      relationship: "",
      isActive: true,
      createLoginCredentials: true,
    },
  })

  // Handle form submission
  async function onSubmit(data: StudentFormValues) {
    if (isSubmitting) return;
    setIsSubmitting(true);
  
    try {
      const studentData = {
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        state: data.state,
        lga: data.lga,
        address: data.address,
        phone: data.phone,
        classId: data.classId,
        termId: data.termId,
        year: currentYear,
        admissionNo: generatedAdmissionNo,
        parentId: selectedParent?.id, // Always pass parentId
        relationship: data.relationship || "PARENT",
        isActive: true,
        credentials: data.createLoginCredentials
          ? [
              {
                type: "REGISTRATION_NUMBER",
                value: generatedAdmissionNo,
                passwordHash: currentYear.toString(),
                isPrimary: true,
              },
            ]
          : [],
      };
  
      const result = await createStudent(studentData);
  
      if (result.success) {
        toast.success("Student Registered Successfully", {
          description: `Registration Number: ${generatedAdmissionNo}`,
        });
        if (selectedParent) {
          toast.success("Parent Assigned", {
            description: `Parent: ${selectedParent.firstName} ${selectedParent.lastName}`,
          });
        }
        router.push("/dashboard/admin/students");
      } else {
        toast.error("Registration Failed", {
          description: result.error || "There was an error registering the student. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error registering student:", error);
      toast.error("Registration Failed", {
        description: "There was an error registering the student. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle parent selection
  const handleParentSelect = (parent: any) => {
    setSelectedParent(parent)
    form.setValue("parentId", parent.id)
    form.setValue("relationship", parent.relationship || "")
    setIsParentDialogOpen(false)
  }

  // Animation variants for step transitions
  const variants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  }

  // Calculate if the current step is valid
  const isStepValid = (stepNumber: number) => {
    switch (stepNumber) {
      case 1:
        return ["firstName", "lastName", "dateOfBirth"].every(
          (field) => !form.getFieldState(field).invalid,
        )
      case 2:
        return ["classId"].every((field) => !form.getFieldState(field).invalid)
      case 3:
        return true // Parent is optional
      case 4:
        return true // Account settings are pre-filled
      default:
        return true
    }
  }

  // Validate current step and move to next
  const goToNextStep = async () => {
    const fieldsToValidate =
      step === 1 ? ["firstName", "lastName", "dateOfBirth"] : step === 2 ? ["classId"] : []

    if (fieldsToValidate.length > 0) {
      const result = await form.trigger(fieldsToValidate as any)
      if (!result) return
    }

    setStep(step + 1)
  }

  if (isLoading) {
    return (
        <FormSkeleton />
    )
  }

  return (
    <div className="container mx-auto py-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card className="w-full max-w-7xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">Student Registration</CardTitle>
            <CardDescription>
              Register a new student in the system. Current Session: {currentSession?.name || "Not set"}, Term:{" "}
              {currentTerm?.name || "Not set"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stepper currentStep={step} className="mb-8">
              <Step step={1}>
                <StepTitle>Personal Information</StepTitle>
                <StepDescription>Student's basic details</StepDescription>
              </Step>
              <Step step={2}>
                <StepTitle>Academic Details</StepTitle>
                <StepDescription>Class and term information</StepDescription>
              </Step>
              <Step step={3}>
                <StepTitle>Parent/Guardian</StepTitle>
                <StepDescription>Link to parent or guardian</StepDescription>
              </Step>
              <Step step={4}>
                <StepTitle>Account Setup</StepTitle>
                <StepDescription>Login credentials</StepDescription>
              </Step>
              <Step step={5}>
                <StepTitle>Review & Submit</StepTitle>
                <StepDescription>Confirm all details</StepDescription>
              </Step>
            </Stepper>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name</FormLabel>
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
                              <FormLabel>Last Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter last name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="dateOfBirth"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Date of Birth</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="gender"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Gender (Optional)</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State (Optional)</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter state" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="lga"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Local Government Area (Optional)</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter LGA" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="address"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Address (Optional)</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter address" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number (Optional)</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter phone number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div
                      key="step2"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-1 gap-6">
                        <FormField
                          control={form.control}
                          name="classId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Class</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select class" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {classes.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id}>
                                      {cls.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="year"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Admission Year (Optional)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="Enter admission year"
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="bg-muted p-4 rounded-lg">
                        <div className="flex items-center mb-2">
                          <div className="mr-2 text-primary">
                            <Check size={16} />
                          </div>
                          <h3 className="font-medium">Current Academic Period</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm font-medium">Session</p>
                            <p className="text-sm">{currentSession?.name || "Not set"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Term</p>
                            <p className="text-sm">{currentTerm?.name || "Not set"}</p>
                          </div>
                        </div>
                        <FormDescription className="mt-2 text-xs">
                          The student will be registered for the current academic period.
                        </FormDescription>
                      </div>
                    </motion.div>
                  )}

                  {step === 3 && (
                    <motion.div
                      key="step3"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="bg-muted p-4 rounded-lg mb-4">
                        <h3 className="font-medium mb-2">Parent/Guardian Information</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Search for an existing parent/guardian or create a new one.
                        </p>

                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsParentDialogOpen(true)}
                            className="flex items-center gap-2"
                          >
                            <Search size={16} />
                            Search for Parent/Guardian
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            className="flex items-center gap-2"
                            onClick={() => {
                              setIsParentDialogOpen(true)
                            }}
                          >
                            <Plus size={16} />
                            Create New
                          </Button>
                        </div>

                        {selectedParent && (
                          <div className="bg-background p-4 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <User size={20} />
                              </div>
                              <div>
                                <p className="font-medium">
                                  {selectedParent.firstName} {selectedParent.lastName}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {selectedParent.id.startsWith("new-")
                                    ? "New Parent/Guardian"
                                    : "Existing Parent/Guardian"}
                                </p>
                                {selectedParent.email && (
                                  <p className="text-xs text-muted-foreground">{selectedParent.email}</p>
                                )}
                                {selectedParent.phone && (
                                  <p className="text-xs text-muted-foreground">{selectedParent.phone}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {selectedParent && (
                        <FormField
                          control={form.control}
                          name="relationship"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Relationship to Student</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select relationship" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="FATHER">Father</SelectItem>
                                  <SelectItem value="MOTHER">Mother</SelectItem>
                                  <SelectItem value="GUARDIAN">Guardian</SelectItem>
                                  <SelectItem value="OTHER">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </motion.div>
                  )}
                  {step === 4 && (
                    <motion.div
                      key="step4"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="bg-muted p-4 rounded-lg">
                        <h3 className="font-medium mb-2">Account Information</h3>
                        <p className="text-sm text-muted-foreground mb-4">Set up login credentials for the student.</p>

                        <div className="space-y-4">
                          <div className="bg-background p-4 rounded-lg border">
                            <h4 className="text-sm font-medium mb-2">Admission Number (Login ID)</h4>
                            <p className="text-sm mb-1">{generatedAdmissionNo}</p>
                            <p className="text-xs text-muted-foreground">
                              This will be used as the student's login ID.
                            </p>
                          </div>

                          <div className="bg-background p-4 rounded-lg border">
                            <h4 className="text-sm font-medium mb-2">Default Password</h4>
                            <p className="text-sm mb-1">{currentYear}</p>
                            <p className="text-xs text-muted-foreground">
                              The student will be required to change this password on first login.
                            </p>
                          </div>

                          <FormField
                            control={form.control}
                            name="createLoginCredentials"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Create Login Credentials</FormLabel>
                                  <FormDescription>
                                    Allow the student to login to the system using their admission number.
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="isActive"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Account Status</FormLabel>
                                  <FormDescription>Enable or disable the student's account.</FormDescription>
                                </div>
                                <FormControl>
                                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {step === 5 && (
                    <motion.div
                      key="step5"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      <div className="bg-muted p-4 rounded-lg">
                        <h3 className="font-medium mb-4">Review Student Information</h3>

                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Personal Information</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                              <div>
                                <p className="text-xs text-muted-foreground">First Name</p>
                                <p className="text-sm">{form.getValues("firstName")}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Last Name</p>
                                <p className="text-sm">{form.getValues("lastName")}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Date of Birth</p>
                                <p className="text-sm">{form.getValues("dateOfBirth")}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Gender</p>
                                <p className="text-sm">{form.getValues("gender") || "Not specified"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">State</p>
                                <p className="text-sm">{form.getValues("state") || "Not specified"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Local Government Area</p>
                                <p className="text-sm">{form.getValues("lga") || "Not specified"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Address</p>
                                <p className="text-sm">{form.getValues("address") || "Not specified"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Phone</p>
                                <p className="text-sm">{form.getValues("phone") || "Not specified"}</p>
                              </div>
                            </div>
                          </div>

                          <Separator />

                          <div>
                            <h4 className="text-sm font-medium mb-2">Academic Information</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                              <div>
                                <p className="text-xs text-muted-foreground">Class</p>
                                <p className="text-sm">
                                  {classes.find((c) => c.id === form.getValues("classId"))?.name || "Not selected"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Session</p>
                                <p className="text-sm">{currentSession?.name || "Not set"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Term</p>
                                <p className="text-sm">{currentTerm?.name || "Not set"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Admission Year</p>
                                <p className="text-sm">{form.getValues("year") || "Not specified"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Admission Number</p>
                                <p className="text-sm">{generatedAdmissionNo}</p>
                              </div>
                            </div>
                          </div>

                          <Separator />

                          <div>
                            <h4 className="text-sm font-medium mb-2">Parent/Guardian Information</h4>
                            {selectedParent ? (
                              <div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Name</p>
                                    <p className="text-sm">
                                      {selectedParent.firstName} {selectedParent.lastName}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Relationship</p>
                                    <p className="text-sm">{form.getValues("relationship") || "Not specified"}</p>
                                  </div>
                                  {selectedParent.email && (
                                    <div>
                                      <p className="text-xs text-muted-foreground">Email</p>
                                      <p className="text-sm">{selectedParent.email}</p>
                                    </div>
                                  )}
                                  {selectedParent.phone && (
                                    <div>
                                      <p className="text-xs text-muted-foreground">Phone</p>
                                      <p className="text-sm">{selectedParent.phone}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Show parent credentials if this is a new parent */}
                                {selectedParent.id.startsWith("new-") && selectedParent.credentials && (
                                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                                    <p className="text-xs font-medium text-yellow-800">Login Credentials</p>
                                    <p className="text-xs text-yellow-700">
                                      Parent can login with{" "}
                                      {selectedParent.email ||
                                        selectedParent.credentials.find((c: any) => c.type === "EMAIL")?.value ||
                                        ""}
                                      {selectedParent.phone ||
                                      selectedParent.credentials.find((c: any) => c.type === "PHONE")?.value
                                        ? ` or ${
                                            selectedParent.phone ||
                                            selectedParent.credentials.find((c: any) => c.type === "PHONE")?.value
                                          }`
                                        : ""}
                                    </p>
                                    <p className="text-xs text-yellow-700">Default password: {currentYear}</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No parent/guardian selected</p>
                            )}
                          </div>

                          <Separator />

                          <div>
                            <h4 className="text-sm font-medium mb-2">Account Information</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                              <div>
                                <p className="text-xs text-muted-foreground">Create Login Credentials</p>
                                <p className="text-sm">{form.getValues("createLoginCredentials") ? "Yes" : "No"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Account Status</p>
                                <p className="text-sm">{form.getValues("isActive") ? "Active" : "Inactive"}</p>
                              </div>
                              {form.getValues("createLoginCredentials") && (
                                <>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Login ID</p>
                                    <p className="text-sm">{generatedAdmissionNo}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Default Password</p>
                                    <p className="text-sm">{currentYear}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-between mt-6">
                  <Button type="button" variant="outline" onClick={() => setStep(step - 1)} disabled={step === 1}>
                    Previous
                  </Button>

                  {step < 5 ? (
                    <Button type="button" onClick={goToNextStep}>
                      Next
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={isSubmitting || !isStepValid(1) || !isStepValid(2)}
                      className="bg-primary"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Registering...
                        </>
                      ) : (
                        "Register Student"
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>

      <ParentSearchDialog
        open={isParentDialogOpen}
        onOpenChange={setIsParentDialogOpen}
        onSelect={handleParentSelect}
      />
    </div>
  )
}