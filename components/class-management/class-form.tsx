"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { ClassLevel } from "@prisma/client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClass, updateClass } from "@/app/actions/class-management"
import { canChangeClassLevel, canUseClassName } from "@/lib/class-rules"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Lock } from "lucide-react"

// Define the form schema with validation
const classFormSchema = z.object({
  name: z.string().min(2, {
    message: "Class name must be at least 2 characters.",
  }),
  level: z.nativeEnum(ClassLevel, {
    required_error: "Please select a class section.",
  }),
})

type ClassFormValues = z.infer<typeof classFormSchema>

interface ClassFormProps {
  schoolId: string
  /** Every class name already in the school, so a duplicate is caught while typing. */
  existingNames?: string[]
  /** Scores already recorded for this class; the section is fixed once there are any. */
  recordedScores?: number
  classData?: {
    id: string
    name: string
    level: ClassLevel
  }
}

export function ClassForm({
  schoolId,
  existingNames = [],
  recordedScores = 0,
  classData,
}: ClassFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const isEditMode = !!classData

  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      name: classData?.name || "",
      level: classData?.level || undefined,
    },
  })

  // Checked as the name is typed rather than on submit. The server enforces the same rule;
  // this is so nobody fills the form in to be told the name was taken.
  const typedName = form.watch("name") ?? ""
  const nameVerdict = canUseClassName(typedName, existingNames, classData?.name)

  // The section decides how results are graded, so it is fixed once the class has been
  // marked. Only relevant when editing — a new class has nothing recorded against it.
  const levelVerdict = isEditMode ? canChangeClassLevel({ recordedScores }) : { allowed: true as const }

  async function onSubmit(data: ClassFormValues) {
    if (!nameVerdict.allowed) {
      form.setError("name", { message: nameVerdict.reason })
      return
    }

    setIsLoading(true)

    try {
      if (isEditMode && classData) {
        await updateClass({
          id: classData.id,
          ...data,
        })
        toast.success("Class updated successfully")
      } else {
        await createClass({
          ...data,
          schoolId,
        })
        toast.success("Class created successfully")
      }

      // Redirect after successful submission
      router.push("/dashboard/admin/classes")
      router.refresh()
    } catch (error: any) {
      console.error("Failed to save class:", error)
      toast.error(error.message || "Failed to save class")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit Class" : "Class Information"}</CardTitle>
        <CardDescription>
          {isEditMode ? "Update the class details" : "Enter the details for the new class"}
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
                    Class Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Primary 1, JSS 1A, SSS 2B"
                      aria-invalid={!nameVerdict.allowed}
                      {...field}
                    />
                  </FormControl>
                  {nameVerdict.allowed ? (
                    <FormDescription>
                      Must be unique within the school — this is the name that appears on every report card.
                    </FormDescription>
                  ) : (
                    <p className="text-sm font-medium text-destructive">{nameVerdict.reason}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Class Section <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={!levelVerdict.allowed}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a class section" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PRIMARY">Primary</SelectItem>
                      <SelectItem value="JSS">Junior Secondary</SelectItem>
                      <SelectItem value="SSS">Senior Secondary</SelectItem>
                    </SelectContent>
                  </Select>
                  {levelVerdict.allowed ? (
                    <FormDescription>
                      Decides how results are graded and how promotion is evaluated.
                    </FormDescription>
                  ) : (
                    <Alert className="mt-2 py-2">
                      <Lock className="h-4 w-4" />
                      <AlertDescription className="text-sm">{levelVerdict.reason}</AlertDescription>
                    </Alert>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/classes")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !nameVerdict.allowed}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode ? "Updating..." : "Creating..."}
                </>
              ) : isEditMode ? (
                "Update Class"
              ) : (
                "Create Class"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
