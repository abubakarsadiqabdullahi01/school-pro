"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { motion } from "framer-motion"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getStudent, updateStudent, getClasses, getCurrentSessionAndTerm } from "@/app/actions/student-management"
import { FormSkeleton } from "@/components/ui/loading-skeleton"
import type { Gender } from "@prisma/client"

// Define the form schema for student editing
const studentEditFormSchema = z.object({
  firstName: z.string().min(2, { message: "First name must be at least 2 characters." }),
  lastName: z.string().min(2, { message: "Last name must be at least 2 characters." }),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid date.",
  }),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  state: z.string().optional(),
  lga: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  classId: z.string().optional(),
  termId: z.string().optional(),
  year: z
    .number()
    .int()
    .min(2000)
    .max(new Date().getFullYear() + 1)
    .optional(),
  isActive: z.boolean().default(true),
})

type StudentEditFormValues = z.infer<typeof studentEditFormSchema>

interface ClassOption {
  id: string
  name: string
  level: string
}

interface StudentEditFormProps {
  studentId: string
}

export default function StudentEditForm({ studentId }: StudentEditFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [currentTerm, setCurrentTerm] = useState<{ id: string; name: string } | null>(null)
  const router = useRouter()

  const form = useForm<StudentEditFormValues>({
    resolver: zodResolver(studentEditFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: undefined,
      state: "",
      lga: "",
      address: "",
      phone: "",
      classId: "",
      termId: "",
      year: new Date().getFullYear(),
      isActive: true,
    },
  })

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        // Fetch student data
        const studentResult = await getStudent(studentId)
        if (!studentResult.success || !studentResult.data) {
          toast.error("Error", {
            description: studentResult.error || "Failed to fetch student details",
          })
          router.push("/dashboard/admin/students")
          return
        }

        const student = studentResult.data

        // Populate form with student data
        form.reset({
          firstName: student.firstName,
          lastName: student.lastName,
          dateOfBirth: student.dateOfBirth,
          gender: student.gender as Gender | undefined,
          state: student.state === "Not Specified" ? "" : student.state,
          lga: student.lga === "Not Specified" ? "" : student.lga,
          address: student.address === "Not Specified" ? "" : student.address,
          phone: student.phone,
          classId: student.currentClass?.id || "",
          termId: student.currentClass?.termId || "",
          year: student.year || new Date().getFullYear(),
          isActive: student.isActive,
        })

        // Fetch current session and term
        const sessionResult = await getCurrentSessionAndTerm()
        if (sessionResult.success && sessionResult.data) {
          setCurrentTerm({
            id: sessionResult.data.termId,
            name: sessionResult.data.termName,
          })
          // Set current term if not already set
          if (!student.currentClass?.termId) {
            form.setValue("termId", sessionResult.data.termId)
          }
        }

        // Fetch classes
        const classesResult = await getClasses()
        if (classesResult.success && classesResult.data) {
          setClasses(classesResult.data)
        }
      } catch (error) {
        console.error("Error fetching data:", error)
        toast.error("Error", {
          description: "Failed to fetch student data. Please try again.",
        })
        router.push("/dashboard/admin/students")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [studentId, form, router])

  async function onSubmit(data: StudentEditFormValues) {
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      const result = await updateStudent(studentId, {
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
        isActive: data.isActive,
      })

      if (result.success) {
        toast.success("Student Updated Successfully", {
          description: `${data.firstName} ${data.lastName} has been updated.`,
        })
        router.push(`/dashboard/admin/students/${studentId}`)
      } else {
        toast.error("Update Failed", {
          description: result.error || "There was an error updating the student. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error updating student:", error)
      toast.error("Update Failed", {
        description: "There was an error updating the student. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <FormSkeleton />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-6"
    >
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-2xl">Edit Student</CardTitle>
              <CardDescription>Update student information and settings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Personal Information</h3>
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
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
              </div>

              {/* Academic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Academic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="classId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Class (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
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
                            onChange={(e) =>
                              field.onChange(e.target.value ? Number.parseInt(e.target.value) : undefined)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {currentTerm && (
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center mb-2">
                      <h4 className="font-medium">Current Term</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">Student will be assigned to: {currentTerm.name}</p>
                  </div>
                )}
              </div>

              {/* Account Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Account Settings</h3>
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Account Status</FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Enable or disable the student's account access
                        </div>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* Submit Button */}
              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Update Student
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
