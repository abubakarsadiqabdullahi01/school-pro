"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { createSchool, updateSchool } from "@/app/actions/user-management"
import { schoolFormSchema } from "@/lib/validations/school"

type SchoolFormValues = z.infer<typeof schoolFormSchema>

interface SchoolFormProps {
  school?: {
    id: string
    name: string
    code: string
    address: string
    phone: string
    email: string
    website?: string | null
    logoUrl?: string | null
    isActive: boolean
  }
}

export function SchoolForm({ school }: SchoolFormProps = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const isEditMode = !!school

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolFormSchema),
    defaultValues: {
      name: school?.name || "",
      code: school?.code || "",
      address: school?.address || "",
      phone: school?.phone || "",
      email: school?.email || "",
      website: school?.website || "",
      logoUrl: school?.logoUrl || "",
      isActive: school?.isActive ?? true,
    },
  })

  async function onSubmit(data: SchoolFormValues) {
    if (isEditMode) {
      setIsLoading(true)
      try {
        await updateSchool({
          id: school.id,
          ...data,
        })
        toast.success("School updated successfully")
        await router.push("/dashboard/super-admin/schools")
      } catch (error: any) {
        toast.error("Failed to update school")
        console.error(error)
      } finally {
        setIsLoading(false)
      }
    } else {
      setIsLoading(true)
      try {
        await createSchool(data)
        toast.success("School created successfully")
        await router.push("/dashboard/super-admin/schools")
      } catch (error: any) {
        toast.error("Failed to create school")
        console.error(error)
      } finally {
        setIsLoading(false)
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit School" : "School Information"}</CardTitle>
        <CardDescription>
          {isEditMode ? "Update the school details" : "Enter the details for the new school"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
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
                    <FormDescription>A unique code for the school (e.g., LINCOLN, SJH)</FormDescription>
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
                    <Input placeholder="Enter school address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-6 md:grid-cols-2">
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
                      <Input placeholder="Enter email address" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter website URL (optional)" {...field} value={field.value || ""} />
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
                    <FormLabel>Logo URL</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter logo URL (optional)" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Active School</FormLabel>
                    <FormDescription>If checked, the school will be active in the system</FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/super-admin/schools")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode ? "Updating..." : "Creating..."}
                </>
              ) : isEditMode ? (
                "Update School"
              ) : (
                "Create School"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}

