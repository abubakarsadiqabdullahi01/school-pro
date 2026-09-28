"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Search } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { assignTeachersToSubject } from "@/app/actions/subject-management"

// Define the form schema with validation
const assignTeachersFormSchema = z.object({
  teacherIds: z.array(z.string()),
})

type AssignTeachersFormValues = z.infer<typeof assignTeachersFormSchema>

interface Teacher {
  id: string
  staffId: string
  firstName: string
  lastName: string
  fullName: string
}

interface AssignTeachersFormProps {
  subjectId: string
  subjectName: string
  /** The term being edited — a teacher assignment belongs to one term, not to the subject. */
  termLabel: string
  teachers: Teacher[]
  assignedTeacherIds: string[]
  /** Scores this teacher has already entered for this subject this term, by teacher id. */
  scoresByTeacher?: Record<string, number>
}

export function AssignTeachersForm({
  subjectId,
  subjectName,
  termLabel,
  teachers,
  assignedTeacherIds,
  scoresByTeacher = {},
}: AssignTeachersFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const form = useForm<AssignTeachersFormValues>({
    resolver: zodResolver(assignTeachersFormSchema),
    defaultValues: {
      teacherIds: assignedTeacherIds,
    },
  })

  // Filter teachers based on search query
  const filteredTeachers = teachers.filter(
    (teacher) =>
      teacher.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.staffId.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  async function onSubmit(data: AssignTeachersFormValues) {
    setIsLoading(true)

    try {
      await assignTeachersToSubject({
        subjectId,
        teacherIds: data.teacherIds,
      })
      toast.success(`Teachers updated for ${termLabel}`)

      // Redirect after successful submission
      router.push(`/dashboard/admin/subjects/${subjectId}`)
      router.refresh()
    } catch (error: any) {
      console.error("Failed to assign teachers:", error)
      toast.error(error.message || "Failed to assign teachers")
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who teaches {subjectName}?</CardTitle>
        <CardDescription>
          For <span className="font-medium text-foreground">{termLabel}</span> only. Other terms keep the
          teachers they already have.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search teachers..."
                className="w-full pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <p className="text-sm text-muted-foreground">
              {form.watch("teacherIds").length} of {teachers.length} teachers selected
            </p>

            <div className="border rounded-md">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Teacher</h3>
                  <h3 className="text-sm font-medium">Staff ID</h3>
                </div>
              </div>
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {filteredTeachers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">No teachers found</div>
                ) : (
                  filteredTeachers.map((teacher) => {
                    const scores = scoresByTeacher[teacher.id] ?? 0
                    const selected = form.watch("teacherIds").includes(teacher.id)
                    return (
                      <div key={teacher.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <Checkbox
                              id={`teacher-${teacher.id}`}
                              className="mt-0.5"
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const currentTeachers = form.getValues("teacherIds")
                                if (checked) {
                                  form.setValue("teacherIds", [...currentTeachers, teacher.id])
                                } else {
                                  form.setValue(
                                    "teacherIds",
                                    currentTeachers.filter((id) => id !== teacher.id),
                                  )
                                }
                              }}
                            />
                            <div className="min-w-0">
                              <label htmlFor={`teacher-${teacher.id}`} className="text-sm font-medium leading-none">
                                {teacher.fullName}
                              </label>
                              {scores > 0 && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {scores} {scores === 1 ? "score" : "scores"} entered this term
                                  {!selected && " — removing them takes away their entry sheet"}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 text-sm text-muted-foreground">{teacher.staffId}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/dashboard/admin/subjects/${subjectId}`)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
