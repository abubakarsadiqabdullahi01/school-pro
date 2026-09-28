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
import { assignSubjectsToClassTerm } from "@/app/actions/class-term-management"
import { Badge } from "@/components/ui/badge"
import { canRemoveSubjectFromClassTerm } from "@/lib/class-term-rules"

// Define the form schema with validation
const classTermSubjectsFormSchema = z.object({
  subjectIds: z.array(z.string()),
})

type ClassTermSubjectsFormValues = z.infer<typeof classTermSubjectsFormSchema>

interface Subject {
  id: string
  name: string
  code: string
}

interface ClassTermSubjectsFormProps {
  classTermId: string
  className: string
  termName: string
  subjects: Subject[]
  assignedSubjectIds: string[]
  /** Scores already recorded for this class this term, keyed by subject id. */
  scoresBySubject?: Record<string, number>
}

export function ClassTermSubjectsForm({
  classTermId,
  className,
  termName,
  subjects,
  assignedSubjectIds,
  scoresBySubject = {},
}: ClassTermSubjectsFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const form = useForm<ClassTermSubjectsFormValues>({
    resolver: zodResolver(classTermSubjectsFormSchema),
    defaultValues: {
      subjectIds: assignedSubjectIds,
    },
  })

  // Filter subjects based on search query
  const filteredSubjects = subjects.filter(
    (subject) =>
      subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.code.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  /**
   * A subject that is on the class and has been marked cannot be taken off it.
   *
   * Only assigned subjects can be locked: a subject that is not on the class has nothing to
   * lose, even in the odd case where scores exist against it from an earlier arrangement.
   */
  const lockedReason = (subjectId: string): string | null => {
    if (!assignedSubjectIds.includes(subjectId)) return null
    const verdict = canRemoveSubjectFromClassTerm({ recordedScores: scoresBySubject[subjectId] ?? 0 })
    return verdict.allowed ? null : verdict.reason
  }

  const lockedCount = subjects.filter((subject) => lockedReason(subject.id) !== null).length

  async function onSubmit(data: ClassTermSubjectsFormValues) {
    setIsLoading(true)

    try {
      await assignSubjectsToClassTerm({
        classTermId,
        subjectIds: data.subjectIds,
      })
      toast.success("Subjects assigned successfully")

      // Redirect after successful submission
      router.push("/dashboard/admin/class-terms")
      router.refresh()
    } catch (error: any) {
      console.error("Failed to assign subjects:", error)
      toast.error(error.message || "Failed to assign subjects")
      setIsLoading(false)
    }
  }

  // Both act on what is currently listed, not on every subject in the school. Clicking
  // "Select All" after searching for "Math" used to tick all ten subjects, which is not
  // what the button appears to offer.
  const handleSelectAll = () => {
    const current = form.getValues("subjectIds")
    const toAdd = filteredSubjects.map((subject) => subject.id).filter((id) => !current.includes(id))
    form.setValue("subjectIds", [...current, ...toAdd])
  }

  const handleDeselectAll = () => {
    const visible = new Set(filteredSubjects.map((subject) => subject.id))
    form.setValue(
      "subjectIds",
      // A locked subject stays ticked: the server would refuse to drop it anyway.
      form.getValues("subjectIds").filter((id) => !visible.has(id) || lockedReason(id) !== null),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign Subjects to {className}</CardTitle>
        <CardDescription>Select the subjects that should be taught in this class for {termName}</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search subjects..."
                  className="w-full pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
                  Select all{searchQuery ? " shown" : ""}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleDeselectAll}>
                  Clear{searchQuery ? " shown" : ""}
                </Button>
              </div>
            </div>

            <div className="border rounded-md">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Subject</h3>
                  <h3 className="text-sm font-medium">Code</h3>
                </div>
              </div>
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {filteredSubjects.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">No subjects found</div>
                ) : (
                  filteredSubjects.map((subject) => {
                    const locked = lockedReason(subject.id)
                    return (
                      <div key={subject.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <Checkbox
                              id={`subject-${subject.id}`}
                              className="mt-0.5"
                              disabled={locked !== null}
                              checked={form.watch("subjectIds").includes(subject.id)}
                              onCheckedChange={(checked) => {
                                const currentSubjects = form.getValues("subjectIds")
                                if (checked) {
                                  form.setValue("subjectIds", [...currentSubjects, subject.id])
                                } else {
                                  form.setValue(
                                    "subjectIds",
                                    currentSubjects.filter((id) => id !== subject.id),
                                  )
                                }
                              }}
                            />
                            <div className="min-w-0">
                              <label
                                htmlFor={`subject-${subject.id}`}
                                className="text-sm font-medium leading-none"
                              >
                                {subject.name}
                              </label>
                              {locked && <p className="mt-1 text-xs text-muted-foreground">{locked}</p>}
                            </div>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            {subject.code}
                          </Badge>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {form.watch("subjectIds").length} of {subjects.length} subjects selected
              {lockedCount > 0 &&
                ` · ${lockedCount} locked by recorded scores`}
              {searchQuery && ` · showing ${filteredSubjects.length}`}
            </p>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/class-terms")}>
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
