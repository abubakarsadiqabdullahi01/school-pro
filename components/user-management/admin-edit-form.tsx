"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, ArrowLeft, User, School, Shield, CalendarIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { updateAdmin } from "@/app/actions/user-management"

const adminEditSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  dateOfBirth: z.date().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  state: z.string().optional(),
  lga: z.string().optional(),
  address: z.string().optional(),
  schoolId: z.string().optional(),
  permissions: z.array(z.string()).min(1, "At least one permission is required"),
})

type AdminEditFormValues = z.infer<typeof adminEditSchema>

const availablePermissions = [
  { id: "MANAGE_STUDENTS", label: "Manage Students" },
  { id: "MANAGE_TEACHERS", label: "Manage Teachers" },
  { id: "MANAGE_CLASSES", label: "Manage Classes" },
  { id: "MANAGE_SUBJECTS", label: "Manage Subjects" },
  { id: "MANAGE_ASSESSMENTS", label: "Manage Assessments" },
  { id: "MANAGE_PAYMENTS", label: "Manage Payments" },
  { id: "VIEW_REPORTS", label: "View Reports" },
  { id: "MANAGE_SESSIONS", label: "Manage Sessions" },
  { id: "MANAGE_SETTINGS", label: "Manage System Settings" },
]

const nigerianStates = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
]

interface AdminEditFormProps {
  admin: {
    id: string
    permissions: string
    user: {
      id: string
      firstName: string
      lastName: string
      dateOfBirth: Date | null
      phone: string | null
      gender: string | null
      state: string | null
      lga: string | null
      address: string | null
      credentials: { value: string }[]
    }
    school: {
      id: string
      name: string
      code: string
    } | null
  }
  schools: {
    id: string
    name: string
    code: string
  }[]
}

// Helper function to safely parse permissions
const parsePermissions = (permissions: string): string[] => {
  try {
    const parsed = JSON.parse(permissions)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Helper function to convert null values to empty strings
const sanitizeValue = (value: string | null | undefined): string => {
  return value ?? ""
}

export function AdminEditForm({ admin, schools }: AdminEditFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const router = useRouter()

  // Ensure component is mounted before rendering form to prevent hydration issues
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const form = useForm<AdminEditFormValues>({
    resolver: zodResolver(adminEditSchema),
    defaultValues: {
      firstName: sanitizeValue(admin.user.firstName),
      lastName: sanitizeValue(admin.user.lastName),
      email: admin.user.credentials[0]?.value || "",
      phone: sanitizeValue(admin.user.phone),
      dateOfBirth: admin.user.dateOfBirth ? new Date(admin.user.dateOfBirth) : undefined,
      gender: (admin.user.gender as "MALE" | "FEMALE" | "OTHER") || "UNKNOWN",
      state: sanitizeValue(admin.user.state),
      lga: sanitizeValue(admin.user.lga),
      address: sanitizeValue(admin.user.address),
      schoolId: admin.school?.id || "NO_SCHOOL",
      permissions: parsePermissions(admin.permissions),
    },
  })

  async function onSubmit(data: AdminEditFormValues) {
    setIsLoading(true)
    try {
      const result = await updateAdmin(admin.id, {
        ...data,
        dateOfBirth: data.dateOfBirth || null,
        phone: data.phone || null,
        gender: data.gender || null,
        state: data.state || null,
        lga: data.lga || null,
        address: data.address || null,
        schoolId: data.schoolId || null,
      })

      if (result.success) {
        toast.success("Administrator updated successfully")
        router.push(`/dashboard/super-admin/users/admins/${admin.id}`)
        router.refresh()
      } else {
        toast.error(result.error || "Failed to update administrator")
      }
    } catch (error: any) {
      console.error("Failed to update admin:", error)
      toast.error(error.message || "Failed to update administrator")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    router.push(`/dashboard/super-admin/users/admins/${admin.id}`)
  }

  // Show loading state until component is mounted to prevent hydration mismatch
  if (!isMounted) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading form...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <CardTitle className="text-2xl">Edit Administrator</CardTitle>
            <CardDescription className="text-base">Update administrator information and permissions</CardDescription>
          </div>
        </div>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-8">
            {/* Personal Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5" />
                <h3 className="text-lg font-semibold">Personal Information</h3>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter first name" {...field} value={field.value || ""} />
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
                        <Input placeholder="Enter last name" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Enter email address" {...field} value={field.value || ""} />
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
                        <Input placeholder="Enter phone number" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date of Birth</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground",
                              )}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "UNKNOWN"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="UNKNOWN">Select Gender</SelectItem>
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

              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "NO_STATE"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="NO_STATE">Select State</SelectItem>
                          {nigerianStates.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
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

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter full address"
                        className="resize-none"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* School Assignment Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <School className="h-5 w-5" />
                <h3 className="text-lg font-semibold">School Assignment</h3>
              </div>

              <FormField
                control={form.control}
                name="schoolId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned School</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "NO_SCHOOL"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a school" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NO_SCHOOL">No School Assignment</SelectItem>
                        {schools.map((school) => (
                          <SelectItem key={school.id} value={school.id}>
                            {school.name} ({school.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Select the school this administrator will manage</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Permissions Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <h3 className="text-lg font-semibold">Permissions</h3>
              </div>

              <FormField
                control={form.control}
                name="permissions"
                render={() => (
                  <FormItem>
                    <FormLabel>Administrator Permissions *</FormLabel>
                    <FormDescription>Select the permissions this administrator should have</FormDescription>
                    <div className="grid gap-3 md:grid-cols-2">
                      {availablePermissions.map((permission) => (
                        <FormField
                          key={permission.id}
                          control={form.control}
                          name="permissions"
                          render={({ field }) => {
                            return (
                              <FormItem key={permission.id} className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(permission.id) || false}
                                    onCheckedChange={(checked) => {
                                      const currentValue = field.value || []
                                      return checked
                                        ? field.onChange([...currentValue, permission.id])
                                        : field.onChange(currentValue.filter((value) => value !== permission.id))
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">{permission.label}</FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-between bg-muted/50 rounded-b-lg">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-[120px]">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Administrator"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
