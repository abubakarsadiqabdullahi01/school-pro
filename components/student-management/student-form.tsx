"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { motion, AnimatePresence } from "framer-motion"
import { Check, Loader2, Plus, Search, User, Calendar, School, BookOpen, UserCheck, Lock, CheckCircle } from "lucide-react"
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
import { createStudent, getCurrentSessionAndTerm, getClassesBySchool } from "@/app/actions/student-management"
import { FormSkeleton } from "@/components/ui/loading-skeleton"
import { Gender } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

// Define the form schema for student registration
const studentFormSchema = z.object({
  firstName: z.string().min(2, { message: "First name must be at least 2 characters." }),
  lastName: z.string().min(2, { message: "Last name must be at least 2 characters." }),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid date.",
  }),
  gender: z.nativeEnum(Gender).optional(),
  state: z.string().optional(),
  lga: z.string().optional(),
  address: z.string().optional(),
  classId: z.string().min(1, { message: "Please select a class." }),
  termId: z.string().min(1, { message: "Please select a term." }),
  year: z.number().int().min(2000).max(new Date().getFullYear() + 1),
  phone: z.string().optional(),
  parentId: z.string().optional(),
  relationship: z.string().optional(),
  isActive: z.boolean().default(true),
  createLoginCredentials: z.boolean().default(true),
})

type StudentFormValues = z.infer<typeof studentFormSchema>

interface ClassOption {
  id: string
  name: string
  level: string
}

interface SchoolInfo {
  id: string
  name: string
  code: string
}

interface ParentOption {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  credentials?: unknown
  relationship?: string
}

export default function StudentForm() {
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(null)
  const [isParentDialogOpen, setIsParentDialogOpen] = useState(false)
  const [currentSession, setCurrentSession] = useState<{ id: string; name: string } | null>(null)
  const [currentTerm, setCurrentTerm] = useState<{ id: string; name: string } | null>(null)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null)
  const [lastAdmissionNo, setLastAdmissionNo] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  // Generate recent years for dropdown (current year and previous 10 years)
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - i)

  // Initialize form
  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: undefined,
      state: "",
      lga: "",
      address: "",
      classId: "",
      termId: "", // will be set via setValue once current term is fetched
      year: currentYear,
      phone: "",
      parentId: "",
      relationship: "",
      isActive: true,
      createLoginCredentials: true,
    },
    mode: "onTouched",         // validate fields once touched
    reValidateMode: "onChange",// revalidate on change after a failed validation
    criteriaMode: "all",       // return all validation errors per field
    shouldFocusError: true,
  })
  const { setValue } = form

  // Fetch current session, term, classes, and admission number when component mounts
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
          setValue("termId", sessionResult.data.termId)
        } else {
          toast.error("Error", {
            description: sessionResult.error || "Failed to fetch current session and term",
          })
        }

        // Fetch classes for the admin's school
        const classesResult = await getClassesBySchool()
        if (classesResult.success && classesResult.data) {
          setClasses(classesResult.data.classes)
          setSchoolInfo(classesResult.data.school)
        } else {
          toast.error("Error", {
            description: classesResult.error || "Failed to fetch classes",
          })
        }

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
  }, [setValue])

  // Handle form submission
  async function onSubmit(data: StudentFormValues) {
    if (isSubmitting) return
    setIsSubmitting(true)

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
        year: data.year,
        parentId: selectedParent?.id,
        relationship: data.relationship || "PARENT",
        isActive: true,
        createLoginCredentials: data.createLoginCredentials,
      }

      const result = await createStudent(studentData)

      if (result.success) {
        setLastAdmissionNo(result.data?.admissionNo || "") 

        toast.success("Student Registered Successfully", {
          description: `Registration Number: ${result.data?.admissionNo}`,
        })
        
        if (selectedParent) {
          toast.success("Parent Assigned", {
            description: `Parent: ${selectedParent.firstName} ${selectedParent.lastName}`,
          })
        }
        
        // Redirect after a brief delay to show success message
        setTimeout(() => {
          router.push("/dashboard/admin/students")
          router.refresh()
        }, 1500)
      } else {
        toast.error("Registration Failed", {
          description: result.error || "There was an error registering the student. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error registering student:", error)
      toast.error("Registration Failed", {
        description: "There was an error registering the student. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

const handleParentSelect = (parent: ParentOption) => {
  // For new parents, we need to create them first
  if (parent.id && !parent.id.startsWith("new-")) {
    setSelectedParent(parent)
    form.setValue("parentId", parent.id)
    form.setValue("relationship", parent.relationship || "PARENT")
    setIsParentDialogOpen(false)
    
    toast.success("Parent Selected", {
      description: `${parent.firstName} ${parent.lastName} has been linked to this student.`
    })
  }
  // Note: For new parents, the creation happens in the dialog itself
  // and the onSelect callback is only called after successful creation
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
        return (["firstName", "lastName", "dateOfBirth"] as (keyof StudentFormValues)[]).every(
          (field) => !form.getFieldState(field as keyof StudentFormValues).invalid,
        )
      case 2:
  return (["classId", "year"] as (keyof StudentFormValues)[]).every((field) => !form.getFieldState(field as keyof StudentFormValues).invalid)
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
    const fieldsToValidate: (keyof StudentFormValues)[] =
      step === 1 ? (["firstName", "lastName", "dateOfBirth"] as (keyof StudentFormValues)[]) :
      step === 2 ? (["classId", "year"] as (keyof StudentFormValues)[]) : []

    if (fieldsToValidate.length > 0) {
      const result = await form.trigger(fieldsToValidate)
      if (!result) return
    }

    setStep(step + 1)
  }

  if (isLoading) {
    return <FormSkeleton />
  }

  return (
    <div className="container">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-6xl mx-auto border-0 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/20 rounded-lg">
                <UserCheck className="h-8 w-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-3xl font-bold text-foreground">
                  Student Registration
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  Register a new student for {schoolInfo?.name} ({schoolInfo?.code})
                </CardDescription>
              </div>
            </div>
            
            {currentSession && currentTerm && (
              <Badge variant="secondary" className="w-fit mt-4">
                <Calendar className="h-3 w-3 mr-1" />
                Current: {currentSession.name} • {currentTerm.name}
              </Badge>
            )}
          </CardHeader>
          
          <CardContent className="pt-8">
            <Stepper currentStep={step} className="mb-8">
              <Step step={1}>
                <StepTitle>Personal Information</StepTitle>
                <StepDescription>Student&apos;s basic details</StepDescription>
              </Step>
              <Step step={2}>
                <StepTitle>Academic Details</StepTitle>
                <StepDescription>Class and enrollment</StepDescription>
              </Step>
              <Step step={3}>
                <StepTitle>Parent/Guardian</StepTitle>
                <StepDescription>Link to family</StepDescription>
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
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      <Alert>
                        <User className="h-4 w-4" />
                        <AlertDescription>
                          Please provide the student&apos;s personal information. Fields marked with * are required.
                        </AlertDescription>
                      </Alert>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-1">
                                First Name <span className="text-destructive">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="Enter first name" {...field} className="h-11" />
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
                              <FormLabel className="flex items-center gap-1">
                                Last Name <span className="text-destructive">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="Enter last name" {...field} className="h-11" />
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
                          <FormItem className="w-full">
                            <FormLabel className="flex items-center gap-1">
                            Date of Birth <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                            <Input type="date" {...field} className="w-full h-11" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="gender"
                          render={({ field }) => (
                          <FormItem className="w-full">
                            <FormLabel>Gender</FormLabel>
                            <Select onValueChange={(value) => field.onChange(value)} value={field.value ?? ""}>
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
                              <FormLabel>State</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter state" {...field} className="h-11" />
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
                              <FormLabel>Local Government Area</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter LGA" {...field} className="h-11" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 gap-6">
                        <FormField
                          control={form.control}
                          name="address"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Address</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter full address" {...field} className="h-11" />
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
                              <FormLabel>Phone Number</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter phone number" {...field} className="h-11" />
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
                      className="space-y-6"
                    >
                      <Alert>
                        <School className="h-4 w-4" />
                        <AlertDescription>
                          Select the academic class and enrollment year for the student.
                        </AlertDescription>
                      </Alert>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="classId"
                          render={({ field }) => (
                          <FormItem className="w-full">
                            <FormLabel className="flex items-center gap-1">
                            Class <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl className="w-full">
                            <Select
                              onValueChange={(value) => field.onChange(value)}
                              defaultValue={field.value}
                            >
                              <SelectTrigger className="w-full h-11">
                              <SelectValue placeholder="Select class" />
                              </SelectTrigger>
                              <SelectContent className="w-full">
                              {classes.map((cls) => (
                                <SelectItem key={cls.id} value={cls.id}>
                                <div className="flex items-center gap-2">
                                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                                  {cls.name}
                                </div>
                                </SelectItem>
                              ))}
                              </SelectContent>
                            </Select>
                            </FormControl>
                            <FormDescription>
                            Classes available at {schoolInfo?.name}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="year"
                          render={({ field }) => (
                          <FormItem className="w-full">
                            <FormLabel className="flex items-center gap-1">
                            Admission Year <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl className="w-full">
                            <Select
                              onValueChange={(value) => field.onChange(parseInt(value))}
                              defaultValue={field.value?.toString()}
                            >
                              <SelectTrigger className="w-full h-11">
                              <SelectValue placeholder="Select year" />
                              </SelectTrigger>
                              <SelectContent className="w-full">
                              {yearOptions.map((year) => (
                                <SelectItem key={year} value={year.toString()}>
                                {year}
                                </SelectItem>
                              ))}
                              </SelectContent>
                            </Select>
                            </FormControl>
                            <FormDescription>
                            Year the student is being admitted
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                          )}
                        />
                        </div>

                      <div className="bg-muted/50 p-6 rounded-lg border">
                        <div className="flex items-center mb-4">
                          <div className="mr-3 bg-primary/10 p-2 rounded-full">
                            <Check className="h-4 w-4 text-primary" />
                          </div>
                          <h3 className="font-semibold">Current Academic Period</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground">Session</p>
                            <p className="text-lg font-semibold">{currentSession?.name || "Not set"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground">Term</p>
                            <p className="text-lg font-semibold">{currentTerm?.name || "Not set"}</p>
                          </div>
                        </div>
                        <FormDescription className="mt-3">
                          The student will be automatically registered for the current academic period.
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
                      className="space-y-6"
                    >
                      <Alert className="bg-blue-50 border-blue-200">
                        <User className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-800">
                          Link a parent or guardian to this student. This is optional but recommended for better communication.
                        </AlertDescription>
                      </Alert>

                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-100">
                        <div className="flex items-center mb-4">
                          <div className="bg-blue-100 p-2 rounded-lg mr-3">
                            <User className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg text-foreground">Parent/Guardian Information</h3>
                            <p className="text-sm text-muted-foreground">
                              Connect with an existing parent or create a new parent account
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 mb-6">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsParentDialogOpen(true)}
                            className="flex items-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            <Search size={16} />
                            Search Existing Parent
                          </Button>
                          <Button
                            type="button"
                            variant="default"
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                            onClick={() => setIsParentDialogOpen(true)}
                          >
                            <Plus size={16} />
                            Create New Parent
                          </Button>
                        </div>

                        {selectedParent && (
                          <div className="bg-white p-4 rounded-lg border border-blue-200 shadow-sm">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                                <User className="h-6 w-6 text-blue-600" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-semibold text-foreground">
                                    {selectedParent.firstName} {selectedParent.lastName}
                                  </p>
                                  <Badge variant={selectedParent.id.startsWith("new-") ? "secondary" : "outline"} className="text-xs">
                                    {selectedParent.id.startsWith("new-") ? "New" : "Existing"}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                                  {selectedParent.email && (
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">Email:</span>
                                      {selectedParent.email}
                                    </div>
                                  )}
                                  {selectedParent.phone && (
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">Phone:</span>
                                      {selectedParent.phone}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedParent(null)
                                  form.setValue("parentId", "")
                                  form.setValue("relationship", "")
                                }}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                Remove
                              </Button>
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
                              <FormLabel className="flex items-center gap-1">
                                Relationship to Student <span className="text-destructive">*</span>
                              </FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11 w-full">
                                    <SelectValue placeholder="Select relationship" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="FATHER">👨 Father</SelectItem>
                                  <SelectItem value="MOTHER">👩 Mother</SelectItem>
                                  <SelectItem value="GUARDIAN">🛡️ Guardian</SelectItem>
                                  <SelectItem value="OTHER">❓ Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Specify the relationship between the parent/guardian and the student
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {!selectedParent && (
                        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                          <User className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-500 text-sm">No parent/guardian selected yet</p>
                          <p className="text-gray-400 text-xs">Click the buttons above to add one</p>
                        </div>
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
                      className="space-y-6"
                    >
                      <Alert className="bg-purple-50 border-purple-200">
                        <User className="h-4 w-4 text-purple-600" />
                        <AlertDescription className="text-purple-800">
                          Configure the student&apos;s account settings and login credentials
                        </AlertDescription>
                      </Alert>

                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-lg border border-purple-100">
                        <h3 className="font-semibold text-lg text-foreground mb-4">Account Configuration</h3>
                        
                        <div className="space-y-4">
                          {/* Admission Number Card */}
                          <div className="bg-white p-5 rounded-lg border border-purple-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="bg-purple-100 p-2 rounded-lg">
                                <BookOpen className="h-5 w-5 text-purple-600" />
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground">Admission Number</h4>
                                <p className="text-sm text-muted-foreground">Unique identifier for student login</p>
                              </div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-md">
                              <p className="font-mono text-lg font-semibold text-center text-foreground">
                                {lastAdmissionNo || "XXXX-XXXX-XXXX"}
                              </p>
                              <p className="text-xs text-center text-muted-foreground mt-1">
                                {lastAdmissionNo ? "Will be generated upon submission" : "Generated after submission"}
                              </p>
                            </div>
                          </div>

                          {/* Default Password Card */}
                          <div className="bg-white p-5 rounded-lg border border-purple-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="bg-pink-100 p-2 rounded-lg">
                                <Lock className="h-5 w-5 text-pink-600" />
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground">Default Password</h4>
                                <p className="text-sm text-muted-foreground">Temporary password for first login</p>
                              </div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-md">
                              <p className="font-mono text-lg font-semibold text-center text-foreground">
                                {currentYear}
                              </p>
                              <p className="text-xs text-center text-muted-foreground mt-1">
                                Student must change this on first login
                              </p>
                            </div>
                          </div>

                          {/* Login Credentials Toggle */}
                          <FormField
                            control={form.control}
                            name="createLoginCredentials"
                            render={({ field }) => (
                              <FormItem className="bg-white p-5 rounded-lg border border-purple-100 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="bg-blue-100 p-2 rounded-lg">
                                      <UserCheck className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                      <FormLabel className="text-base font-semibold">Create Login Credentials</FormLabel>
                                      <FormDescription>
                                        Enable student access to the portal with admission number
                                      </FormDescription>
                                    </div>
                                  </div>
                                  <FormControl>
                                    <Switch 
                                      checked={field.value} 
                                      onCheckedChange={field.onChange}
                                      className="data-[state=checked]:bg-blue-600"
                                    />
                                  </FormControl>
                                </div>
                              </FormItem>
                            )}
                          />

                          {/* Account Status Toggle */}
                          <FormField
                            control={form.control}
                            name="isActive"
                            render={({ field }) => (
                              <FormItem className="bg-white p-5 rounded-lg border border-purple-100 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="bg-green-100 p-2 rounded-lg">
                                      <CheckCircle className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div>
                                      <FormLabel className="text-base font-semibold">Account Status</FormLabel>
                                      <FormDescription>
                                        Activate or deactivate the student&apos;s account
                                      </FormDescription>
                                    </div>
                                  </div>
                                  <FormControl>
                                    <Switch 
                                      checked={field.value} 
                                      onCheckedChange={field.onChange}
                                      className="data-[state=checked]:bg-green-600"
                                    />
                                  </FormControl>
                                </div>
                                {field.value && (
                                  <Badge variant="outline" className="mt-2 bg-green-50 text-green-700 border-green-200">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Account will be active
                                  </Badge>
                                )}
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
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">
                          Review all information before submitting. Double-check for accuracy.
                        </AlertDescription>
                      </Alert>

                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-green-100">
                        <h3 className="font-semibold text-lg text-foreground mb-6 text-center">
                          📋 Student Registration Summary
                        </h3>

                        <div className="space-y-6">
                          {/* Personal Information Section */}
                          <div className="bg-white p-5 rounded-lg border border-green-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="bg-blue-100 p-2 rounded-lg">
                                <User className="h-5 w-5 text-blue-600" />
                              </div>
                              <h4 className="font-semibold text-foreground">Personal Information</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {[
                                { label: "First Name", value: form.getValues("firstName") },
                                { label: "Last Name", value: form.getValues("lastName") },
                                { label: "Date of Birth", value: form.getValues("dateOfBirth") },
                                { label: "Gender", value: form.getValues("gender") || "Not specified" },
                                { label: "State", value: form.getValues("state") || "Not specified" },
                                { label: "LGA", value: form.getValues("lga") || "Not specified" },
                                { label: "Address", value: form.getValues("address") || "Not specified", colSpan: "md:col-span-2" },
                                { label: "Phone", value: form.getValues("phone") || "Not specified" },
                              ].map((item, index) => (
                                <div key={index} className={item.colSpan || ""}>
                                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                                  <p className="text-base font-semibold text-foreground">{item.value}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <Separator className="my-6" />

                          {/* Academic Information Section */}
                          <div className="bg-white p-5 rounded-lg border border-green-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="bg-purple-100 p-2 rounded-lg">
                                <School className="h-5 w-5 text-purple-600" />
                              </div>
                              <h4 className="font-semibold text-foreground">Academic Information</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {[
                                { label: "Class", value: classes.find((c) => c.id === form.getValues("classId"))?.name || "Not selected" },
                                { label: "Session", value: currentSession?.name || "Not set" },
                                { label: "Term", value: currentTerm?.name || "Not set" },
                                { label: "Admission Year", value: form.getValues("year")?.toString() || "Not specified" },
                              ].map((item, index) => (
                                <div key={index}>
                                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                                  <p className="text-base font-semibold text-foreground">{item.value}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <Separator className="my-6" />

                          {/* Parent/Guardian Section */}
                          <div className="bg-white p-5 rounded-lg border border-green-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="bg-pink-100 p-2 rounded-lg">
                                <UserCheck className="h-5 w-5 text-pink-600" />
                              </div>
                              <h4 className="font-semibold text-foreground">Parent/Guardian Information</h4>
                            </div>
                            {selectedParent ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {[
                                    { label: "Name", value: `${selectedParent.firstName} ${selectedParent.lastName}` },
                                    { label: "Relationship", value: form.getValues("relationship") || "Not specified" },
                                    ...(selectedParent.email ? [{ label: "Email", value: selectedParent.email }] : []),
                                    ...(selectedParent.phone ? [{ label: "Phone", value: selectedParent.phone }] : []),
                                  ].map((item, index) => (
                                    <div key={index}>
                                      <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                                      <p className="text-base font-semibold text-foreground">{item.value}</p>
                                    </div>
                                  ))}
                                </div>
                                {selectedParent.id.startsWith("new-") && Array.isArray(selectedParent.credentials) && (
                                  <Alert className="bg-yellow-50 border-yellow-200 mt-4">
                                    <AlertDescription className="text-yellow-800 text-sm">
                                      New parent account will be created with default password: {currentYear}
                                    </AlertDescription>
                                  </Alert>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-4 text-muted-foreground">
                                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No parent/guardian selected</p>
                              </div>
                            )}
                          </div>

                          <Separator className="my-6" />

                          {/* Account Information Section */}
                          <div className="bg-white p-5 rounded-lg border border-green-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="bg-indigo-100 p-2 rounded-lg">
                                <Lock className="h-5 w-5 text-indigo-600" />
                              </div>
                              <h4 className="font-semibold text-foreground">Account Information</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {[
                                { label: "Login Credentials", value: form.getValues("createLoginCredentials") ? "Enabled" : "Disabled" },
                                { label: "Account Status", value: form.getValues("isActive") ? "Active" : "Inactive" },
                                ...(form.getValues("createLoginCredentials") && lastAdmissionNo ? [
                                  { label: "Login ID", value: lastAdmissionNo },
                                  { label: "Default Password", value: currentYear.toString() },
                                ] : []),
                              ].map((item, index) => (
                                <div key={index}>
                                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                                  <p className="text-base font-semibold text-foreground">{item.value}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Final Confirmation */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mt-6">
                          <div className="flex items-center gap-3">
                            <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <p className="text-sm text-blue-800">
                              By submitting, you confirm that all information provided is accurate and complete.
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  
                </AnimatePresence>
                
                <div className="flex justify-between pt-6 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setStep(step - 1)} 
                    disabled={step === 1}
                    className="min-w-[120px]"
                  >
                    Previous
                  </Button>
                  
                  {step < 5 ? (
                    <Button 
                      type="button" 
                      onClick={goToNextStep}
                      className="min-w-[120px] bg-primary hover:bg-primary/90"
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={isSubmitting || !isStepValid(1) || !isStepValid(2)}
                      className="min-w-[120px] bg-primary hover:bg-primary/90"
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