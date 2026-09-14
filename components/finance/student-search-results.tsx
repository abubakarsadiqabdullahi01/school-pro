"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatNaira } from "@/lib/money"

export type FinanceStudentSearchRow = {
  id: string
  admissionNo: string
  name: string
  currentClass: string | null
  outstanding: string
}

export function StudentSearchResults({
  students,
  onSelect,
}: {
  students: FinanceStudentSearchRow[]
  onSelect: (student: FinanceStudentSearchRow) => void
}) {
  const pageSize = 6
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(students.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const visibleStudents = useMemo(
    () => students.slice((safePage - 1) * pageSize, safePage * pageSize),
    [students, safePage],
  )

  if (students.length === 0) {
    return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No matching students yet.</p>
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {visibleStudents.map((student) => (
          <button
            key={student.id}
            type="button"
            onClick={() => onSelect(student)}
            className="w-full rounded-md border p-3 text-left hover:bg-muted"
          >
            <div className="font-medium">{student.name}</div>
            <div className="text-sm text-muted-foreground">
              {student.admissionNo} · {student.currentClass ?? "No class"} · Owes {formatNaira(student.outstanding)}
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, students.length)} of {students.length}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
