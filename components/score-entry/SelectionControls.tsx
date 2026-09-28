"use client"

import { memo } from "react"
import { Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
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
      {/* Term Selector */}
  <div className="space-y-2 min-w-0">
        <Label htmlFor="term" className="text-sm font-medium text-foreground">
          Academic Term
        </Label>
        <Select value={form.termId} onValueChange={onTermChange}>
    <SelectTrigger id="term" className="w-full min-h-10 bg-card border-border hover:border-border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
            <SelectValue placeholder="Select a term" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto bg-card border border-border shadow-lg rounded-md">
            {terms.map((term) => (
              <SelectItem 
                key={term.id} 
                value={term.id}
                className="px-3 py-2 hover:bg-muted/50 focus:bg-muted/50 cursor-pointer transition-colors"
              >
                <div className="flex flex-col">
                  <span className="font-medium truncate">
                    {term.session.name} - {term.name}
                  </span>
                  {term.isCurrent && (
                    <span className="text-xs text-blue-600 font-semibold mt-0.5">
                      Current Term
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Level Selector */}
  <div className="space-y-2 min-w-0">
        <Label htmlFor="level" className="text-sm font-medium text-foreground">
          Class Section
        </Label>
        <Select value={form.level} onValueChange={onLevelChange} disabled={!form.termId}>
          <SelectTrigger 
              id="level" 
              className="w-full min-h-10 bg-card border-border hover:border-border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-muted disabled:cursor-not-allowed"
            >
            <SelectValue placeholder="Select a section" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto bg-card border border-border shadow-lg rounded-md">
            {classLevels.map((level) => (
              <SelectItem 
                key={level} 
                value={level}
                className="px-3 py-2 hover:bg-muted/50 focus:bg-muted/50 cursor-pointer transition-colors"
              >
                <span className="truncate">{level}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Class Selector */}
  <div className="space-y-2 min-w-0">
        <Label htmlFor="class" className="text-sm font-medium text-foreground">
          Class
        </Label>
        <Select
          value={form.classId}
          onValueChange={onClassChange}
          disabled={!form.termId || !form.level || isLoadingClasses}
        >
          <SelectTrigger 
            id="class"
            className="w-full min-h-10 bg-card border-border hover:border-border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-muted disabled:cursor-not-allowed"
          >
            {isLoadingClasses ? (
              <div className="flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <SelectValue placeholder="Select a class" />
            )}
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto bg-card border border-border shadow-lg rounded-md">
            {classes.map((cls) => (
              <SelectItem 
                key={cls.id} 
                value={cls.id}
                className="px-3 py-2 hover:bg-muted/50 focus:bg-muted/50 cursor-pointer transition-colors"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{cls.name}</span>
                  {cls.teacherName && (
                    <span className="text-xs text-muted-foreground truncate mt-0.5">
                      {cls.teacherName}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
            {classes.length === 0 && (
              <SelectItem value="none" disabled className="px-3 py-2 text-muted-foreground cursor-not-allowed">
                No classes available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Subject Selector */}
  <div className="space-y-2 min-w-0">
        <Label htmlFor="subject" className="text-sm font-medium text-foreground">
          Subject
        </Label>
        {/* Searchable: a senior class offers seven or eight subjects and a junior one
            more, and typing three letters beats scrolling. The code is searched too, so
            "BSC" finds Basic Science. */}
        {isLoadingSubjects ? (
          <div className="flex h-10 items-center justify-center rounded-md border border-border bg-muted">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <SearchableSelect
            id="subject"
            options={subjects.map((subject) => ({
              value: subject.id,
              label: subject.name,
              hint: subject.code,
            }))}
            value={form.subjectId}
            onChange={onSubjectChange}
            disabled={!form.classId || subjects.length === 0}
            placeholder={subjects.length === 0 ? "No subjects available" : "Select a subject"}
            searchPlaceholder="Search subjects..."
            emptyMessage="No subject matches that."
          />
        )}
      </div>
    </div>
  )
})