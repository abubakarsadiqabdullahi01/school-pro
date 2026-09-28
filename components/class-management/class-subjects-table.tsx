"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * A subject the class teaches, and the terms it teaches it in.
 *
 * One row per subject, not one per class term. The table used to list the raw
 * `ClassSubject` rows, so a class taking Mathematics in three terms showed "MTH
 * Mathematics" three times over with nothing to say why — 24 rows for 8 subjects.
 */
export interface ClassSubjectRow {
  subjectId: string
  name: string
  code: string
  terms: { id: string; label: string; isCurrent: boolean }[]
}

interface ClassSubjectsTableProps {
  subjects: ClassSubjectRow[]
  /** Every term the class runs, for the filter — including ones with no subjects yet. */
  termOptions: { id: string; label: string }[]
}

const PAGE_SIZES = [10, 25, 50]

export function ClassSubjectsTable({ subjects, termOptions }: ClassSubjectsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [termFilter, setTermFilter] = useState("ALL")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])

  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return subjects.filter((subject) => {
      if (termFilter !== "ALL" && !subject.terms.some((term) => term.id === termFilter)) {
        return false
      }
      if (!needle) return true
      return (
        subject.name.toLowerCase().includes(needle) || subject.code.toLowerCase().includes(needle)
      )
    })
  }, [subjects, searchQuery, termFilter])

  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const visible = filtered.slice(startIndex, startIndex + pageSize)

  const isFiltered = searchQuery.trim() !== "" || termFilter !== "ALL"

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by subject or code..."
            className="w-full pl-8"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setPage(1)
            }}
          />
        </div>

        {termOptions.length > 1 && (
          <Select
            value={termFilter}
            onValueChange={(value) => {
              setTermFilter(value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="All terms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All terms</SelectItem>
              {termOptions.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery("")
              setTermFilter("ALL")
              setPage(1)
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Taught in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    {isFiltered ? "No subjects match those filters." : "No subjects assigned to this class."}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((subject) => (
                  <TableRow key={subject.subjectId}>
                    <TableCell className="font-medium">{subject.code}</TableCell>
                    <TableCell>{subject.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {subject.terms.map((term) => (
                          <Badge key={term.id} variant={term.isCurrent ? "default" : "outline"}>
                            {term.label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalItems > 0 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium">{startIndex + 1}</span>–
              <span className="font-medium">{Math.min(startIndex + pageSize, totalItems)}</span> of{" "}
              <span className="font-medium">{totalItems}</span>
              {isFiltered && ` (filtered from ${subjects.length})`}
            </p>

            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value))
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
