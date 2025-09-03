"use client"

import { memo } from "react"
import { Loader2, BookOpen, Users, FileText } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TeacherSelectionControlsProps {
  form: {
    termId: string
    classId: string
    subjectId: string
  }
  terms: Array<{
    id: string
    name: string
    isCurrent: boolean
    session: { id: string; name: string }
  }>
  classTerms: Array<{
    id: string
    classId: string
    className: string
    classLevel: string
    termId: string
    termName: string
  }>
  subjects: Array<{
    id: string
    name: string
    code: string
  }>
  isLoadingTerms: boolean
  isLoadingClassTerms: boolean
  isLoadingSubjects: boolean
  onTermChange: (value: string) => void
  onClassChange: (value: string) => void
  onSubjectChange: (value: string) => void
}

export const TeacherSelectionControls = memo(function TeacherSelectionControls({
  form,
  terms,
  classTerms,
  subjects,
  isLoadingTerms,
  isLoadingClassTerms,
  isLoadingSubjects,
  onTermChange,
  onClassChange,
  onSubjectChange,
}: TeacherSelectionControlsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="term" className="text-sm font-medium flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Academic Term
        </Label>
        <Select value={form.termId} onValueChange={onTermChange} disabled={isLoadingTerms}>
          <SelectTrigger id="term">
            {isLoadingTerms ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SelectValue placeholder="Select a term" />
            )}
          </SelectTrigger>
          <SelectContent>
            {terms.map((term) => (
              <SelectItem key={term.id} value={term.id}>
                <div className="flex items-center justify-between w-full">
                  <span>
                    {term.session.name} - {term.name}
                  </span>
                  {term.isCurrent && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      Current
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
            {terms.length === 0 && !isLoadingTerms && (
              <SelectItem value="none" disabled>
                No terms assigned
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {terms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing {terms.length} term{terms.length !== 1 ? 's' : ''} where you have class assignments
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="class" className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Assigned Class
        </Label>
        <Select
          value={form.classId}
          onValueChange={onClassChange}
          disabled={!form.termId || isLoadingClassTerms}
        >
          <SelectTrigger id="class">
            {isLoadingClassTerms ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SelectValue placeholder="Select a class" />
            )}
          </SelectTrigger>
          <SelectContent>
            {classTerms.map((classTerm) => (
              <SelectItem key={classTerm.id} value={classTerm.id}>
                <div className="flex items-center justify-between w-full">
                  <span>{classTerm.className}</span>
                  <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {classTerm.classLevel}
                  </span>
                </div>
              </SelectItem>
            ))}
            {classTerms.length === 0 && !isLoadingClassTerms && form.termId && (
              <SelectItem value="none" disabled>
                No classes assigned for this term
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {classTerms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            You are assigned to {classTerms.length} class{classTerms.length !== 1 ? 'es' : ''} this term
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject" className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Teaching Subject
        </Label>
        <Select value={form.subjectId} onValueChange={onSubjectChange} disabled={!form.classId || isLoadingSubjects}>
          <SelectTrigger id="subject">
            {isLoadingSubjects ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SelectValue placeholder="Select a subject" />
            )}
          </SelectTrigger>
          <SelectContent>
            {subjects.map((subject) => (
              <SelectItem key={subject.id} value={subject.id}>
                <div className="flex items-center justify-between w-full">
                  <span>{subject.name}</span>
                  <span className="ml-2 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                    {subject.code}
                  </span>
                </div>
              </SelectItem>
            ))}
            {subjects.length === 0 && !isLoadingSubjects && form.classId && (
              <SelectItem value="none" disabled>
                No subjects assigned for this class
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {subjects.length > 0 && (
          <p className="text-xs text-muted-foreground">
            You teach {subjects.length} subject{subjects.length !== 1 ? 's' : ''} for this class
          </p>
        )}
      </div>
    </div>
  )
})