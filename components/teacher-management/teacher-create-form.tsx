"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Eye, EyeOff, Loader2, UserPlus, User, Shield, Mail, Phone, BookOpen, GraduationCap } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
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

interface TeacherCreateFormProps {
  schoolId: string
  schoolName: string
}

export function TeacherCreateForm({ schoolId, schoolName }: TeacherCreateFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const currentYear = new Date().getFullYear().toString()

  // Initialize form
  const form = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      staffId: "",
      department: "",
      qualification: "",
      gender: null,
      dateOfBirth: "",
      state: "",
      lga: "",
      address: "",
      generatePassword: true,
      customPassword: "",
    },
  })

  const generatePassword = form.watch("generatePassword")

  // Handle form submission
  async function onSubmit(data: TeacherFormValues) {
    setIsSubmitting(true)

    try {
      // Determine password to use
      const password = data.generatePassword ? currentYear : data.customPassword || currentYear

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
        credentials: credentials.length > 0 ? credentials : undefined,
      })

      if (result.success) {
        toast.success("Teacher Created Successfully", {
          description: `Teacher ${data.firstName} ${data.lastName} has been created with default password: ${password}`,
          action: {
            label: "Copy Password",
            onClick: () => navigator.clipboard.writeText(password),
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

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="personal">
            <User className="h-4 w-4 mr-2" />
            Personal Info
          </TabsTrigger>
          <TabsTrigger value="professional">
            <BookOpen className="h-4 w-4 mr-2" />
            Professional
          </TabsTrigger>
          <TabsTrigger value="credentials">
            <Shield className="h-4 w-4 mr-2" />
            Credentials
          </TabsTrigger>
        </TabsList>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <TabsContent value="personal" className="space-y-6">
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
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter state" {...field} value={field.value || ""} />
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
                            <Input placeholder="Enter LGA" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="professional" className="space-y-6">
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
                          <FormDescription>This unique ID will be used for login credentials</FormDescription>
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
            </TabsContent>

            <TabsContent value="credentials" className="space-y-6">
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
                              Use the current year ({currentYear}) as default password
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
                            {currentYear}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          Teacher will use the current year as their initial password. 
                          They will be prompted to change it on first login.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <div className="flex justify-between gap-4 pt-6 border-t">
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/teachers")}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-w-32">
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
            </div>
          </form>
        </Form>
      </Tabs>
    </div>
  )
}