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
      {/* Term Selector */}
  <div className="space-y-2 min-w-0">
        <Label htmlFor="term" className="text-sm font-medium text-gray-700">
          Academic Term
        </Label>
        <Select value={form.termId} onValueChange={onTermChange}>
    <SelectTrigger id="term" className="w-full min-h-10 bg-white border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
            <SelectValue placeholder="Select a term" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md">
            {terms.map((term) => (
              <SelectItem 
                key={term.id} 
                value={term.id}
                className="px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 cursor-pointer transition-colors"
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
        <Label htmlFor="level" className="text-sm font-medium text-gray-700">
          Class Level
        </Label>
        <Select value={form.level} onValueChange={onLevelChange} disabled={!form.termId}>
          <SelectTrigger 
              id="level" 
              className="w-full min-h-10 bg-white border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
            <SelectValue placeholder="Select a level" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md">
            {classLevels.map((level) => (
              <SelectItem 
                key={level} 
                value={level}
                className="px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 cursor-pointer transition-colors"
              >
                <span className="truncate">{level}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Class Selector */}
  <div className="space-y-2 min-w-0">
        <Label htmlFor="class" className="text-sm font-medium text-gray-700">
          Class
        </Label>
        <Select
          value={form.classId}
          onValueChange={onClassChange}
          disabled={!form.termId || !form.level || isLoadingClasses}
        >
          <SelectTrigger 
            id="class"
            className="w-full min-h-10 bg-white border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            {isLoadingClasses ? (
              <div className="flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              </div>
            ) : (
              <SelectValue placeholder="Select a class" />
            )}
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md">
            {classes.map((cls) => (
              <SelectItem 
                key={cls.id} 
                value={cls.id}
                className="px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{cls.name}</span>
                  {cls.teacherName && (
                    <span className="text-xs text-gray-600 truncate mt-0.5">
                      {cls.teacherName}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
            {classes.length === 0 && (
              <SelectItem value="none" disabled className="px-3 py-2 text-gray-500 cursor-not-allowed">
                No classes available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Subject Selector */}
  <div className="space-y-2 min-w-0">
        <Label htmlFor="subject" className="text-sm font-medium text-gray-700">
          Subject
        </Label>
        <Select value={form.subjectId} onValueChange={onSubjectChange} disabled={!form.classId || isLoadingSubjects}>
          <SelectTrigger 
              id="subject"
              className="w-full min-h-10 bg-white border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
            {isLoadingSubjects ? (
              <div className="flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              </div>
            ) : (
              <SelectValue placeholder="Select a subject" />
            )}
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md">
            {subjects.map((subject) => (
              <SelectItem 
                key={subject.id} 
                value={subject.id}
                className="px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{subject.name}</span>
                  <span className="text-xs text-gray-600 truncate mt-0.5">
                    {subject.code}
                  </span>
                </div>
              </SelectItem>
            ))}
            {subjects.length === 0 && (
              <SelectItem value="none" disabled className="px-3 py-2 text-gray-500 cursor-not-allowed">
                No subjects available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
})