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
import { createSubject, updateSubject } from "@/app/actions/subject-management"

// Define the form schema with validation
const subjectFormSchema = z.object({
  name: z.string().min(2, {
    message: "Subject name must be at least 2 characters.",
  }),
  code: z
    .string()
    .min(2, {
      message: "Subject code must be at least 2 characters.",
    })
    .max(10, {
      message: "Subject code must not exceed 10 characters.",
    })
    .refine((value) => /^[A-Z0-9]+$/.test(value), {
      message: "Subject code must contain only uppercase letters and numbers.",
    }),
})

type SubjectFormValues = z.infer<typeof subjectFormSchema>

interface SubjectFormProps {
  schoolId: string
  subjectData?: {
    id: string
    name: string
    code: string
  }
}

export function SubjectForm({ schoolId, subjectData }: SubjectFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const isEditMode = !!subjectData

  const form = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: {
      name: subjectData?.name || "",
      code: subjectData?.code || "",
    },
  })

  async function onSubmit(data: SubjectFormValues) {
    setIsLoading(true)

    try {
      if (isEditMode && subjectData) {
        await updateSubject({
          id: subjectData.id,
          ...data,
        })
        toast.success("Subject updated successfully")
      } else {
        const result = await createSubject({
          ...data,
          schoolId,
        })
        toast.success("Subject created successfully")
      }

      // Redirect after successful submission
      router.push("/dashboard/admin/subjects")
      router.refresh()
    } catch (error: any) {
      console.error("Failed to save subject:", error)
      toast.error(error.message || "Failed to save subject")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit Subject" : "Subject Information"}</CardTitle>
        <CardDescription>
          {isEditMode ? "Update the subject details" : "Enter the details for the new subject"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Subject Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Mathematics, English, Physics, etc." {...field} />
                  </FormControl>
                  <FormDescription>Enter a descriptive name for the subject</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Subject Code <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., MATH, ENG, PHY, etc." {...field} />
                  </FormControl>
                  <FormDescription>
                    Enter a unique code for the subject (uppercase letters and numbers only)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/subjects")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode ? "Updating..." : "Creating..."}
                </>
              ) : isEditMode ? (
                "Update Subject"
              ) : (
                "Create Subject"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
