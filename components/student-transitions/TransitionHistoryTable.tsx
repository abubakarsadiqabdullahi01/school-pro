"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight, Filter, Search } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TransitionRecord {
  id: string
  studentName: string
  admissionNo: string
  fromClass: string
  fromTerm: string
  toClass: string
  toTerm: string
  transitionType: string
  transitionDate: Date
  notes: string
  createdBy: string
}

interface TransitionHistoryTableProps {
  transitions: TransitionRecord[]
  isLoading: boolean
}

const PAGE_SIZES = [10, 25, 50, 100] as const
const ALL = "ALL"

/**
 * Matches the `take` in getTransitionHistory.
 *
 * Filtering and paging happen here, over whatever the server sent, so hitting this ceiling
 * means older transitions exist and are not on screen. Saying so is the point: a total that
 * is silently a cap is worse than no total at all.
 */
const FETCH_LIMIT = 500

export const TransitionHistoryTable = memo(function TransitionHistoryTable({
  transitions,
  isLoading,
}: TransitionHistoryTableProps) {
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>(ALL)
  const [termFilter, setTermFilter] = useState<string>(ALL)
  const [classFilter, setClassFilter] = useState<string>(ALL)
  const [pageSize, setPageSize] = useState<number>(25)
  const [page, setPage] = useState(0)

  const getTransitionTypeColor = (type: string) => {
    switch (type) {
      case "PROMOTION":
        return "bg-green-500/10 text-green-700 dark:text-green-400"
      case "SAME_CLASS":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400"
      case "DEMOTION":
        return "bg-red-500/10 text-red-700 dark:text-red-400"
      case "LATERAL":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
      default:
        return "bg-muted text-foreground"
    }
  }

  // Filter options come from the rows actually present, not a hardcoded list, so a school
  // that has never recorded a withdrawal is not offered "Withdrawal" as a choice that
  // returns nothing.
  const { types, terms, classes } = useMemo(() => {
    const t = new Set<string>()
    const tm = new Set<string>()
    const c = new Set<string>()
    for (const row of transitions) {
      t.add(row.transitionType)
      if (row.toTerm) tm.add(row.toTerm)
      if (row.toClass) c.add(row.toClass)
    }
    return {
      types: [...t].sort(),
      terms: [...tm].sort(),
      classes: [...c].sort(),
    }
  }, [transitions])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return transitions.filter((row) => {
      if (typeFilter !== ALL && row.transitionType !== typeFilter) return false
      if (termFilter !== ALL && row.toTerm !== termFilter) return false
      if (classFilter !== ALL && row.toClass !== classFilter) return false
      if (!needle) return true
      // Name and admission number are what somebody actually looks a student up by; notes
      // are included because that is where an override reason is recorded.
      return (
        row.studentName.toLowerCase().includes(needle) ||
        row.admissionNo.toLowerCase().includes(needle) ||
        row.notes?.toLowerCase().includes(needle)
      )
    })
  }, [transitions, query, typeFilter, termFilter, classFilter])

  // Any change to the filters invalidates the current page.
  useEffect(() => {
    setPage(0)
  }, [query, typeFilter, termFilter, classFilter, pageSize])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  // A filter that shortens the list can leave the cursor past the end.
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const hasFilters = query.trim() !== "" || typeFilter !== ALL || termFilter !== ALL || classFilter !== ALL
  const clearFilters = () => {
    setQuery("")
    setTypeFilter(ALL)
    setTermFilter(ALL)
    setClassFilter(ALL)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!transitions.length) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">No transition history found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, admission number or note..."
            className="h-9 pl-8"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {types.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={termFilter} onValueChange={setTermFilter}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue placeholder="All terms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All terms</SelectItem>
              {terms.map((term) => (
                <SelectItem key={term} value={term}>
                  {term}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All classes</SelectItem>
              {classes.map((klass) => (
                <SelectItem key={klass} value={klass}>
                  {klass}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center">
          <p className="text-muted-foreground">No transitions match those filters.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table className="min-w-full bg-card">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-bold text-foreground">Student</TableHead>
                  <TableHead className="font-bold text-foreground">Admission No.</TableHead>
                  <TableHead className="font-bold text-foreground">From</TableHead>
                  <TableHead className="font-bold text-foreground">To</TableHead>
                  <TableHead className="font-bold text-foreground">Type</TableHead>
                  <TableHead className="font-bold text-foreground">Date</TableHead>
                  <TableHead className="font-bold text-foreground">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((transition) => (
                  <TableRow key={transition.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{transition.studentName}</TableCell>
                    <TableCell className="font-mono">{transition.admissionNo}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{transition.fromClass}</div>
                        <div className="text-muted-foreground">{transition.fromTerm}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{transition.toClass}</div>
                        <div className="text-muted-foreground">{transition.toTerm}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getTransitionTypeColor(transition.transitionType)}>
                        {transition.transitionType.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(transition.transitionDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">{transition.notes || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground tabular-nums">
                Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)} of{" "}
                {filtered.length}
                {filtered.length !== transitions.length && ` (filtered from ${transitions.length})`}
              </p>
              {transitions.length >= FETCH_LIMIT && (
                <p className="text-xs text-muted-foreground">
                  Showing the {FETCH_LIMIT} most recent transitions. Older ones are not listed.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
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

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <span className="px-2 text-sm tabular-nums">
                  {safePage + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
})
