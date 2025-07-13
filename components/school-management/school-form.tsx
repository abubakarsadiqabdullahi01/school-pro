"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { createSchool, updateSchool } from "@/app/actions/school-management"
import { Loader2 } from 'lucide-react'

const schoolFormSchema = z.object({
  name: z.string().min(2, "School name must be at least 2 characters"),
  code: z.string().min(2, "School code must be at least 2 characters").max(10, "School code must be at most 10 characters"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  phone: z.string().min(10, "Phone number must be at least 10 characters"),
  email: z.string().email("Invalid email address"),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  logoUrl: z.string().url("Invalid logo URL").optional().or(z.literal("")),
  admissionPrefix: z.string().min(2, "Admission prefix must be at least 2 characters").max(5, "Admission prefix must be at most 5 characters").optional(),
  admissionFormat: z.string().optional(),
  admissionSequenceStart: z.number().min(1, "Admission sequence start must be at least 1").optional(),
})

type SchoolFormValues = z.infer<typeof schoolFormSchema>

interface SchoolFormProps {
  schoolData?: {
    id: string
    name: string
    code: string
    address: string
    phone: string
    email: string
    website?: string | null
    logoUrl?: string | null
    admissionPrefix: string
    admissionFormat: string
    admissionSequenceStart: number
  }
}

export function SchoolForm({ schoolData }: SchoolFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!schoolData

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolFormSchema),
    defaultValues: {
      name: schoolData?.name || "",
      code: schoolData?.code || "",
      address: schoolData?.address || "",
      phone: schoolData?.phone || "",
      email: schoolData?.email || "",
      website: schoolData?.website || "",
      logoUrl: schoolData?.logoUrl || "",
      admissionPrefix: schoolData?.admissionPrefix || "STD",
      admissionFormat: schoolData?.admissionFormat || "{PREFIX}-{YEAR}-{NUMBER}",
      admissionSequenceStart: schoolData?.admissionSequenceStart || 1,
    },
  })

  async function onSubmit(data: SchoolFormValues) {
    setIsSubmitting(true)
    try {
      const result = isEditing 
        ? await updateSchool(schoolData.id, {
            ...data,
            website: data.website || undefined,
            logoUrl: data.logoUrl || undefined,
            admissionPrefix: data.admissionPrefix || "STD",
            admissionFormat: data.admissionFormat || "{PREFIX}-{YEAR}-{NUMBER}",
            admissionSequenceStart: data.admissionSequenceStart || 1,
          })
        : await createSchool({
            ...data,
            website: data.website || undefined,
            logoUrl: data.logoUrl || undefined,
            admissionPrefix: data.admissionPrefix || "STD",
            admissionFormat: data.admissionFormat || "{PREFIX}-{YEAR}-{NUMBER}",
            admissionSequenceStart: data.admissionSequenceStart || 1,
          })

      if (result.success) {
        toast.success(isEditing ? "School updated successfully" : "School created successfully")
        router.push("/dashboard/super-admin/schools")
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>{isEditing ? "Edit School" : "Create New School"}</CardTitle>
        <CardDescription>
          {isEditing ? "Update the school information below" : "Fill in the details to create a new school"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>School Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter school name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>School Code</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter school code" {...field} />
                    </FormControl>
                    <FormDescription>
                      A unique identifier for the school (e.g., "NHS", "LINCOLN")
                    </FormDescription>
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
                    <Textarea placeholder="Enter school address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter phone number" {...field} />
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
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter email address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="logoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logo URL (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/logo.png" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Admission Number Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="admissionPrefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admission Prefix</FormLabel>
                      <FormControl>
                        <Input placeholder="STD" {...field} />
                      </FormControl>
                      <FormDescription>
                        Prefix for admission numbers (e.g., "STD", "NHS")
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="admissionFormat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admission Format</FormLabel>
                      <FormControl>
                        <Input placeholder="{PREFIX}-{YEAR}-{NUMBER}" {...field} />
                      </FormControl>
                      <FormDescription>
                        Format template for admission numbers
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="admissionSequenceStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Starting Number</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="1" 
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormDescription>
                        Starting number for admission sequence
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Update School" : "Create School"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
