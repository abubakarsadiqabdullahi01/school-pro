"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Eye, EyeOff, CalendarIcon, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { createAdmin } from "@/app/actions/user-management"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"

// Define the form schema with validation
const adminFormSchema = z.object({
  firstName: z.string().min(2, {
    message: "First name must be at least 2 characters.",
  }),
  lastName: z.string().min(2, {
    message: "Last name must be at least 2 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters.",
  }),
  phone: z.string().optional(),
  dateOfBirth: z.date().optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  schoolId: z.string().min(1, {
    message: "Please select a school.",
  }),
  permissions: z.array(z.string()).min(1, {
    message: "Please select at least one permission.",
  }),
  isActive: z.boolean().default(true),
})

type AdminFormValues = z.infer<typeof adminFormSchema>

// Define available permissions
const availablePermissions = [
  { id: "manage_students", label: "Manage Students" },
  { id: "manage_teachers", label: "Manage Teachers" },
  { id: "manage_classes", label: "Manage Classes" },
  { id: "manage_subjects", label: "Manage Subjects" },
  { id: "manage_attendance", label: "Manage Attendance" },
  { id: "manage_grades", label: "Manage Grades" },
  { id: "manage_fees", label: "Manage Fees" },
  { id: "view_reports", label: "View Reports" },
]

interface AdminCreationFormProps {
  schools: {
    id: string
    name: string
    code: string
  }[]
}

export function AdminCreationForm({ schools }: AdminCreationFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const form = useForm<AdminFormValues>({
    resolver: zodResolver(adminFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      phone: "",
      avatarUrl: "",
      schoolId: "",
      permissions: ["view_reports"],
      isActive: true,
    },
  })

  // Filter schools based on search query
  const filteredSchools = schools.filter(
    (school) =>
      school.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      school.code.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  async function onSubmit(data: AdminFormValues) {
    if (isLoading) return; // Prevent multiple submissions
    setIsLoading(true)

    try {
      await createAdmin({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth,
        avatarUrl: data.avatarUrl,
        schoolId: data.schoolId,
        permissions: data.permissions.join(","),
        isActive: data.isActive,
      })

      toast.success("Administrator created successfully")
      // Immediately start the navigation
      router.push("/dashboard/super-admin/users/admins")
      // Disable form inputs
      form.reset(data)
    } catch (error: any) {
      console.error("Failed to create administrator:", error)
      toast.error(error.message || "Failed to create administrator")
      setIsLoading(false) // Only reset loading state if there's an error
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Administrator Information</CardTitle>
        <CardDescription>Enter the details for the new administrator</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      First Name <span className="text-destructive">*</span>
                    </FormLabel>
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
                    <FormLabel>
                      Last Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Enter last name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Email Address <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Enter email address" type="email" {...field} />
                    </FormControl>
                    <FormDescription>This will be used as the login credential</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Password <span className="text-destructive">*</span>
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input placeholder="Enter password" type={showPassword ? "text" : "password"} {...field} />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                      </Button>
                    </div>
                    <FormDescription>Password must be at least 8 characters</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter phone number (optional)" {...field} value={field.value || ""} />
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
                            variant={"outline"}
                            className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date (optional)</span>}
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
            </div>

            <div className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="avatarUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avatar URL</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter avatar URL (optional)" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormDescription>URL to the administrator's profile picture</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="schoolId"
              render={({ field }) => (
                <FormItem className="w-full sm:w-[400px]">
                  <FormLabel>
                    School <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a school" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <div className="sticky top-0 p-2 bg-background z-10 border-b">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search schools..."
                            className="pl-8"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>
                      {filteredSchools.length === 0 ? (
                        <div className="text-center py-4 text-sm text-muted-foreground">No schools found</div>
                      ) : (
                        filteredSchools.map((school) => (
                          <SelectItem key={school.id} value={school.id}>
                            {school.name} ({school.code})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>The school this administrator will manage</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            </div>



            <FormField
              control={form.control}
              name="permissions"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel>
                      Permissions <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormDescription>Select the permissions for this administrator</FormDescription>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
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
                                  checked={field.value?.includes(permission.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, permission.id])
                                      : field.onChange(field.value?.filter((value) => value !== permission.id))
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

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Active Account</FormLabel>
                    <FormDescription>If checked, the administrator can log in immediately</FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/super-admin/users/admins")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Administrator"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}

