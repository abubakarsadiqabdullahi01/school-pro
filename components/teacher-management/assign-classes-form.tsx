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
import { Badge } from "@/components/ui/badge"
import { assignClassesToTeacher } from "@/app/actions/teacher-assignment"

interface ClassTerm {
  id: string
  className: string
  level: string
  termName: string
  sessionName: string
  isCurrent: boolean
  isAssigned: boolean
}

interface AssignClassesFormProps {
  teacherId: string
  teacherName: string
  classTerms: ClassTerm[]
}

export function AssignClassesForm({ teacherId, teacherName, classTerms }: AssignClassesFormProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedClassTerms, setSelectedClassTerms] = useState<string[]>(
    classTerms.filter((ct) => ct.isAssigned).map((ct) => ct.id),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Filter class terms based on search query
  const filteredClassTerms = classTerms.filter(
    (ct) =>
      ct.className.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ct.termName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ct.sessionName.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Group class terms by current status
  const currentClassTerms = filteredClassTerms.filter((ct) => ct.isCurrent)
  const pastClassTerms = filteredClassTerms.filter((ct) => !ct.isCurrent)

  // Handle class term selection
  const handleClassTermSelection = (classTermId: string) => {
    setSelectedClassTerms((prev) => {
      if (prev.includes(classTermId)) {
        return prev.filter((id) => id !== classTermId)
      } else {
        return [...prev, classTermId]
      }
    })
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const result = await assignClassesToTeacher({
        teacherId,
        classTermIds: selectedClassTerms,
      })

      if (result.success) {
        toast.success("Classes Assigned", {
          description: "The classes have been successfully assigned to the teacher.",
        })
        router.push(`/dashboard/admin/teachers/${teacherId}`)
      } else {
        toast.error("Assignment Failed", {
          description: result.error || "Failed to assign classes. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error assigning classes:", error)
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
          <CardTitle>Assign Classes to {teacherName}</CardTitle>
          <CardDescription>Select the classes this teacher will handle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="search-classes">Search Classes</Label>
            <Input
              id="search-classes"
              placeholder="Search by class name, term, or session..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="space-y-6">
            {currentClassTerms.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Current Term Classes</h3>
                <div className="space-y-2">
                  {currentClassTerms.map((classTerm) => (
                    <div
                      key={classTerm.id}
                      className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50"
                    >
                      <div className="flex items-center space-x-4">
                        <Checkbox
                          id={`class-${classTerm.id}`}
                          checked={selectedClassTerms.includes(classTerm.id)}
                          onCheckedChange={() => handleClassTermSelection(classTerm.id)}
                        />
                        <div>
                          <Label htmlFor={`class-${classTerm.id}`} className="text-base font-medium cursor-pointer">
                            {classTerm.className}
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            {classTerm.termName} - {classTerm.sessionName}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">{classTerm.level}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pastClassTerms.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Past Term Classes</h3>
                <div className="space-y-2">
                  {pastClassTerms.map((classTerm) => (
                    <div
                      key={classTerm.id}
                      className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50"
                    >
                      <div className="flex items-center space-x-4">
                        <Checkbox
                          id={`class-${classTerm.id}`}
                          checked={selectedClassTerms.includes(classTerm.id)}
                          onCheckedChange={() => handleClassTermSelection(classTerm.id)}
                        />
                        <div>
                          <Label htmlFor={`class-${classTerm.id}`} className="text-base font-medium cursor-pointer">
                            {classTerm.className}
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            {classTerm.termName} - {classTerm.sessionName}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">{classTerm.level}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
