"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, UserPlus, UserRound, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StudentDetailsForm } from "@/components/student-managements/student-details-form"
import { StudentCredentialsForm } from "@/components/student-managements/student-credentials-form"
import { ParentDetailsForm } from "@/components/student-managements/parent-details-form"
import { RegistrationReview } from "@/components/student-managements/registration-review"
import { cn } from "@/lib/utils"
import { registerStudent } from "@/app/actions/student-managements"
import { toast } from "sonner"

interface Class {
  id: string
  name: string
}

interface Term {
  id: string
  name: string
  sessionId: string
  sessionName: string
}

interface StudentRegistrationStepperProps {
  schoolId: string
  classes: Class[]
  terms: Term[]
  currentTerm: Term | null
}

export function StudentRegistrationStepper({ schoolId, classes, terms, currentTerm }: StudentRegistrationStepperProps) {
  const [activeStep, setActiveStep] = useState("student-details")
  const [studentData, setStudentData] = useState<any>(null)
  const [credentialsData, setCredentialsData] = useState<any>(null)
  const [parentsData, setParentsData] = useState<any[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null)
  const router = useRouter()

  // Handle student details submission
  const handleStudentDetailsSubmit = (data: any) => {
    setStudentData(data)
    setSelectedClass(data.classId)
    setSelectedTerm(data.termId)
    setActiveStep("credentials")
  }

  // Handle credentials submission
  const handleCredentialsSubmit = (data: any) => {
    setCredentialsData(data)
    setActiveStep("parent-details")
  }

  // Handle parent details submission
  const handleParentDetailsSubmit = (data: any) => {
    setParentsData([...parentsData, data])
    setActiveStep("review")
  }

  // Handle add another parent
  const handleAddAnotherParent = () => {
    setActiveStep("parent-details")
  }

  // Handle final submission
  const handleFinalSubmit = async () => {
    try {
      setIsSubmitting(true)

      const result = await registerStudent({
        studentData,
        credentialsData,
        parentsData,
        schoolId,
      })

      if (result.success) {
        toast.success("The student has been added to the system")
        router.push("/dashboard/admin/students")
      } else {
        throw new Error("Failed to register student")
      }
    } catch (error) {
      console.error("Error submitting student registration:", error)
      toast.error(error.message || "There was an error registering the student")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-center">
        <ol className="flex w-full max-w-3xl items-center">
          <li
            className={cn(
              "flex w-full items-center after:inline-block after:h-1 after:w-full after:border-b after:border-4 after:content-['']",
              activeStep !== "student-details" ? "after:border-primary" : "after:border-gray-200",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 bg-primary text-white",
                activeStep === "student-details" ? "border-primary" : "border-primary",
              )}
            >
              {activeStep !== "student-details" ? <Check className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
            </div>
          </li>
          <li
            className={cn(
              "flex w-full items-center after:inline-block after:h-1 after:w-full after:border-b after:border-4 after:content-['']",
              activeStep !== "student-details" && activeStep !== "credentials"
                ? "after:border-primary"
                : "after:border-gray-200",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4",
                activeStep === "student-details"
                  ? "border-gray-200 bg-gray-100 text-gray-600"
                  : activeStep === "credentials"
                    ? "border-primary bg-primary text-white"
                    : "border-primary bg-primary text-white",
              )}
            >
              {activeStep !== "student-details" && activeStep !== "credentials" ? <Check className="h-5 w-5" /> : "2"}
            </div>
          </li>
          <li
            className={cn(
              "flex w-full items-center after:inline-block after:h-1 after:w-full after:border-b after:border-4 after:content-['']",
              activeStep === "review" ? "after:border-primary" : "after:border-gray-200",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4",
                activeStep === "parent-details"
                  ? "border-primary bg-primary text-white"
                  : activeStep === "review"
                    ? "border-primary bg-primary text-white"
                    : "border-gray-200 bg-gray-100 text-gray-600",
              )}
            >
              {activeStep === "review" ? <Check className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            </div>
          </li>
          <li className="flex items-center">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4",
                activeStep === "review"
                  ? "border-primary bg-primary text-white"
                  : "border-gray-200 bg-gray-100 text-gray-600",
              )}
            >
              {activeStep === "review" ? <Check className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            </div>
          </li>
        </ol>
      </div>

      <Tabs value={activeStep} className="w-full">
        <TabsList className="hidden">
          <TabsTrigger value="student-details">Student Details</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="parent-details">Parent/Guardian</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="student-details" className="mt-0">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4">Student Information</h3>
            <p className="text-muted-foreground mb-6">
              Enter the basic details of the student. Fields marked with * are required.
            </p>

            <StudentDetailsForm
              schoolId={schoolId}
              classes={classes}
              terms={terms}
              currentTerm={currentTerm}
              onSubmit={handleStudentDetailsSubmit}
              initialData={studentData}
            />
          </Card>
        </TabsContent>

        <TabsContent value="credentials" className="mt-0">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4">Student Login Credentials</h3>
            <p className="text-muted-foreground mb-6">
              Set up login credentials for the student to access the platform.
            </p>

            <StudentCredentialsForm
              onSubmit={handleCredentialsSubmit}
              initialData={credentialsData}
              onBack={() => setActiveStep("student-details")}
            />
          </Card>
        </TabsContent>

        <TabsContent value="parent-details" className="mt-0">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4">Parent/Guardian Information</h3>
            <p className="text-muted-foreground mb-6">
              Add parent or guardian information. You can add multiple parents/guardians.
            </p>

            <ParentDetailsForm
              schoolId={schoolId}
              onSubmit={handleParentDetailsSubmit}
              onBack={() => setActiveStep("credentials")}
              onSkip={() => setActiveStep("review")}
            />
          </Card>
        </TabsContent>

        <TabsContent value="review" className="mt-0">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4">Review & Confirm</h3>
            <p className="text-muted-foreground mb-6">
              Review all the information before finalizing the student registration.
            </p>

            <RegistrationReview
              studentData={studentData}
              credentialsData={credentialsData}
              parentsData={parentsData}
              classData={classes.find(cls => cls.id === selectedClass) || null}
              termData={terms.find(term => term.id === selectedTerm) || null}
              sessionData={selectedTerm ? terms.find(term => term.id === selectedTerm)?.session : null}
              onAddAnotherParent={handleAddAnotherParent}
              onSubmit={handleFinalSubmit}
              onBack={() => setActiveStep("parent-details")}
              isSubmitting={isSubmitting}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
