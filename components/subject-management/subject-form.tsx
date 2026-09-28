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
import { canUseSubjectCode, canUseSubjectName } from "@/lib/subject-rules"

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
  /** Names and codes already in the school, so a clash is caught while typing. */
  existing?: { name: string; code: string }[]
  subjectData?: {
    id: string
    name: string
    code: string
  }
}

export function SubjectForm({ schoolId, existing = [], subjectData }: SubjectFormProps) {
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

  // Both checked as they are typed. The server enforces the same rules; this is so nobody
  // fills the form in only to be told the code was taken.
  const typedName = form.watch("name") ?? ""
  const typedCode = form.watch("code") ?? ""
  const nameVerdict = canUseSubjectName(
    typedName,
    existing.map((item) => item.name),
    subjectData?.name,
  )
  const codeVerdict = canUseSubjectCode(
    typedCode,
    existing.map((item) => item.code),
    subjectData?.code,
  )
  const blocked = !nameVerdict.allowed || !codeVerdict.allowed

  async function onSubmit(data: SubjectFormValues) {
    if (!nameVerdict.allowed) {
      form.setError("name", { message: nameVerdict.reason })
      return
    }
    if (!codeVerdict.allowed) {
      form.setError("code", { message: codeVerdict.reason })
      return
    }

    setIsLoading(true)

    try {
      if (isEditMode && subjectData) {
        await updateSubject({
          id: subjectData.id,
          ...data,
        })
        toast.success("Subject updated successfully")
      } else {
        await createSubject({
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
                    <Input
                      placeholder="e.g., Mathematics, English Language, Physics"
                      aria-invalid={!nameVerdict.allowed}
                      {...field}
                    />
                  </FormControl>
                  {nameVerdict.allowed ? (
                    <FormDescription>Must be unique within the school.</FormDescription>
                  ) : (
                    <p className="text-sm font-medium text-destructive">{nameVerdict.reason}</p>
                  )}
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
                    <Input
                      placeholder="e.g., MTH, ENG, PHY"
                      aria-invalid={!codeVerdict.allowed}
                      {...field}
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    />
                  </FormControl>
                  {codeVerdict.allowed ? (
                    <FormDescription>
                      Uppercase letters and numbers only — this is what appears on the report card.
                    </FormDescription>
                  ) : (
                    <p className="text-sm font-medium text-destructive">{codeVerdict.reason}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/subjects")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || blocked}>
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
