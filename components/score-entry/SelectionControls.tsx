"use client"

import { memo } from "react"
import { Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ClassLevel } from "@prisma/client"

interface SelectionControlsProps {
  form: {
    termId: string
    level: string
    classId: string
    subjectId: string
  }
  terms: Array<{
    id: string
    name: string
    isCurrent: boolean
    session: { id: string; name: string }
  }>
  classLevels: ClassLevel[]
  classes: Array<{
    id: string
    name: string
    teacherName: string | null
  }>
  subjects: Array<{
    id: string
    name: string
    code: string
  }>
  isLoadingClasses: boolean
  isLoadingSubjects: boolean
  onTermChange: (value: string) => void
  onLevelChange: (value: string) => void
  onClassChange: (value: string) => void
  onSubjectChange: (value: string) => void
}

export const SelectionControls = memo(function SelectionControls({
  form,
  terms,
  classLevels,
  classes,
  subjects,
  isLoadingClasses,
  isLoadingSubjects,
  onTermChange,
  onLevelChange,
  onClassChange,
  onSubjectChange,
}: SelectionControlsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-4">
      <div className="space-y-2">
        <Label htmlFor="term" className="text-sm font-medium">
          Academic Term
        </Label>
        <Select value={form.termId} onValueChange={onTermChange}>
          <SelectTrigger id="term">
            <SelectValue placeholder="Select a term" />
          </SelectTrigger>
          <SelectContent>
            {terms.map((term) => (
              <SelectItem key={term.id} value={term.id}>
                {term.session.name} - {term.name}
                {term.isCurrent && " (Current)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="level" className="text-sm font-medium">
          Class Level
        </Label>
        <Select value={form.level} onValueChange={onLevelChange} disabled={!form.termId}>
          <SelectTrigger id="level">
            <SelectValue placeholder="Select a level" />
          </SelectTrigger>
          <SelectContent>
            {classLevels.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="class" className="text-sm font-medium">
          Class
        </Label>
        <Select
          value={form.classId}
          onValueChange={onClassChange}
          disabled={!form.termId || !form.level || isLoadingClasses}
        >
          <SelectTrigger id="class">
            {isLoadingClasses ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SelectValue placeholder="Select a class" />
            )}
          </SelectTrigger>
          <SelectContent>
            {classes.map((cls) => (
              <SelectItem key={cls.id} value={cls.id}>
                {cls.name}
                {cls.teacherName && ` (${cls.teacherName})`}
              </SelectItem>
            ))}
            {classes.length === 0 && (
              <SelectItem value="none" disabled>
                No classes available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject" className="text-sm font-medium">
          Subject
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
                {subject.name} ({subject.code})
              </SelectItem>
            ))}
            {subjects.length === 0 && (
              <SelectItem value="none" disabled>
                No subjects available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
})
