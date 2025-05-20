"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { assignSubjectsToTeacher } from "@/app/actions/teacher-assignment"

interface Subject {
  id: string
  name: string
  code: string
  isAssigned: boolean
  assignmentId?: string
}

interface AssignSubjectsToTeacherFormProps {
  teacherId: string
  teacherName: string
  subjects: Subject[]
}

export function AssignSubjectsToTeacherForm({ teacherId, teacherName, subjects }: AssignSubjectsToTeacherFormProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    subjects.filter((s) => s.isAssigned).map((s) => s.id),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Filter subjects based on search query
  const filteredSubjects = subjects.filter(
    (subject) =>
      subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.code.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Handle subject selection
  const handleSubjectSelection = (subjectId: string) => {
    setSelectedSubjects((prev) => {
      if (prev.includes(subjectId)) {
        return prev.filter((id) => id !== subjectId)
      } else {
        return [...prev, subjectId]
      }
    })
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const result = await assignSubjectsToTeacher({
        teacherId,
        subjectIds: selectedSubjects,
      })

      if (result.success) {
        toast.success("Subjects Assigned", {
          description: "The subjects have been successfully assigned to the teacher.",
        })
        router.push(`/dashboard/admin/teachers/${teacherId}`)
      } else {
        toast.error("Assignment Failed", {
          description: result.error || "Failed to assign subjects. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error assigning subjects:", error)
      toast.error("Assignment Failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Assign Subjects to {teacherName}</CardTitle>
          <CardDescription>Select the subjects this teacher will teach</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="search-subjects">Search Subjects</Label>
            <Input
              id="search-subjects"
              placeholder="Search by subject name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSubjects.map((subject) => (
              <div key={subject.id} className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50">
                <Checkbox
                  id={`subject-${subject.id}`}
                  checked={selectedSubjects.includes(subject.id)}
                  onCheckedChange={() => handleSubjectSelection(subject.id)}
                  className="mt-1"
                />
                <div>
                  <Label htmlFor={`subject-${subject.id}`} className="text-base font-medium cursor-pointer">
                    {subject.name}
                  </Label>
                  <p className="text-sm text-muted-foreground">Code: {subject.code}</p>
                </div>
              </div>
            ))}
          </div>

          {filteredSubjects.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No subjects found matching your search criteria.</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => router.push(`/dashboard/admin/teachers/${teacherId}`)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Assignments
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
