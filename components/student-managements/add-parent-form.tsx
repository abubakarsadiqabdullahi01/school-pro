"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AddParentFormProps {
  studentId: string
  studentName: string
  schoolId: string
}

// Form schema for new parent
const newParentSchema = z
  .object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    phone: z
      .string()
      .min(10, "Phone number must be at least 10 characters")
      .regex(/^\+?[0-9]{10,15}$/, "Invalid phone number format"),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
    occupation: z.string().optional(),
    relationship: z.string().min(1, "Relationship is required"),
    createLogin: z.boolean().default(false),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.createLogin) {
        return data.password && data.password.length >= 8
      }
      return true
    },
    {
      message: "Password must be at least 8 characters",
      path: ["password"],
    },
  )
  .refine(
    (data) => {
      if (data.createLogin && data.password && data.confirmPassword) {
        return data.password === data.confirmPassword
      }
      return true
    },
    {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    },
  )

// Form schema for existing parent
const existingParentSchema = z.object({
  parentId: z.string().min(1, "Parent is required"),
  relationship: z.string().min(1, "Relationship is required"),
})

export function AddParentForm({ studentId, studentName, schoolId }: AddParentFormProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("new")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [existingParents, setExistingParents] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")

  // Initialize form for new parent
  const newParentForm = useForm<z.infer<typeof newParentSchema>>({
    resolver: zodResolver(newParentSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      occupation: "",
      relationship: "",
      createLogin: false,
      password: "",
      confirmPassword: "",
    },
  })

  // Initialize form for existing parent
  const existingParentForm = useForm<z.infer<typeof existingParentSchema>>({
    resolver: zodResolver(existingParentSchema),
    defaultValues: {
      parentId: "",
      relationship: "",
    },
  })

  // Watch createLogin to conditionally show password fields
  const createLogin = newParentForm.watch("createLogin")

  // Handle search for existing parents
  const handleSearch = async () => {
    if (searchTerm.length < 3) {
      toast({
        title: "Search term too short",
        description: "Please enter at least 3 characters to search",
        variant: "destructive",
      })
      return
    }

    try {
      // Here you would call your API to search for parents
      // For now, we'll just simulate a search result
      setExistingParents([
        {
          id: "parent-1",
          firstName: "John",
          lastName: "Doe",
          phone: "+1234567890",
          email: "john.doe@example.com",
        },
        {
          id: "parent-2",
          firstName: "Jane",
          lastName: "Smith",
          phone: "+0987654321",
          email: "jane.smith@example.com",
        },
      ])
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to search for parents. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handle form submission for new parent
  const handleNewParentSubmit = async (values: z.infer<typeof newParentSchema>) => {
    try {
      setIsSubmitting(true)

      // Here you would call your API to add a new parent
      // For now, we'll just simulate a successful submission
      await new Promise((resolve) => setTimeout(resolve, 1000))

      toast({
        title: "Parent added",
        description: `${values.firstName} ${values.lastName} has been added as a ${values.relationship} to ${studentName}.`,
      })

      router.push(`/dashboard/admin/students/${studentId}`)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add parent. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle form submission for existing parent
  const handleExistingParentSubmit = async (values: z.infer<typeof existingParentSchema>) => {
    try {
      setIsSubmitting(true)

      // Here you would call your API to link an existing parent
      // For now, we'll just simulate a successful submission
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const parent = existingParents.find((p) => p.id === values.parentId)

      toast({
        title: "Parent linked",
        description: `${parent.firstName} ${parent.lastName} has been linked as a ${values.relationship} to ${studentName}.`,
      })

      router.push(`/dashboard/admin/students/${studentId}`)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to link parent. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new">Add New Parent</TabsTrigger>
            <TabsTrigger value="existing">Link Existing Parent</TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-6">
            <Form {...newParentForm}>
              <form onSubmit={newParentForm.handleSubmit(handleNewParentSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* First name */}
                  <FormField
                    control={newParentForm.control}
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

                  {/* Last name */}
                  <FormField
                    control={newParentForm.control}
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

                  {/* Phone */}
                  <FormField
                    control={newParentForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter phone number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Email */}
                  <FormField
                    control={newParentForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter email address" type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Occupation */}
                  <FormField
                    control={newParentForm.control}
                    name="occupation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Occupation (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter occupation" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Relationship */}
                  <FormField
                    control={newParentForm.control}
                    name="relationship"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Relationship *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select relationship" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Father">Father</SelectItem>
                            <SelectItem value="Mother">Mother</SelectItem>
                            <SelectItem value="Guardian">Guardian</SelectItem>
                            <SelectItem value="Uncle">Uncle</SelectItem>
                            <SelectItem value="Aunt">Aunt</SelectItem>
                            <SelectItem value="Grandparent">Grandparent</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Create login checkbox */}
                <FormField
                  control={newParentForm.control}
                  name="createLogin"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Create login credentials for this parent</FormLabel>
                        <FormDescription>This will allow the parent to log in to the system</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {/* Conditional password fields */}
                {createLogin && (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField
                      control={newParentForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password *</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Enter password" {...field} />
                          </FormControl>
                          <FormDescription>Must be at least 8 characters</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newParentForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password *</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Confirm password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/admin/students/${studentId}`)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Adding..." : "Add Parent"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="existing" className="mt-6">
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search by name, phone, or email"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
                <Button type="button" onClick={handleSearch}>
                  Search
                </Button>
              </div>

              {existingParents.length > 0 && (
                <Form {...existingParentForm}>
                  <form onSubmit={existingParentForm.handleSubmit(handleExistingParentSubmit)} className="space-y-6">
                    <FormField
                      control={existingParentForm.control}
                      name="parentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Parent *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select parent" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {existingParents.map((parent) => (
                                <SelectItem key={parent.id} value={parent.id}>
                                  {parent.firstName} {parent.lastName} ({parent.phone})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={existingParentForm.control}
                      name="relationship"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Relationship *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select relationship" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Father">Father</SelectItem>
                              <SelectItem value="Mother">Mother</SelectItem>
                              <SelectItem value="Guardian">Guardian</SelectItem>
                              <SelectItem value="Uncle">Uncle</SelectItem>
                              <SelectItem value="Aunt">Aunt</SelectItem>
                              <SelectItem value="Grandparent">Grandparent</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/admin/students/${studentId}`)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Linking..." : "Link Parent"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}

              {searchTerm.length > 0 && existingParents.length === 0 && (
                <div className="rounded-md border border-dashed p-6 text-center">
                  <p className="text-muted-foreground">
                    No parents found. Try a different search term or add a new parent.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
