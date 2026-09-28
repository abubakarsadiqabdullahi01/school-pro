"use client"

import { useMemo, useState } from "react"
import { Download, Edit, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { deleteSubject } from "@/app/actions/subject-management"
import { canDeleteSubject } from "@/lib/subject-rules"
import { rowOpenHandler } from "@/lib/row-open"

interface Subject {
  id: string
  name: string
  code: string
  /** Distinct classes teaching it **this term**. */
  classes: { id: string; name: string; level: string }[]
  /** Distinct teachers assigned to it **this term**. */
  teachers: { id: string; name: string }[]
  /** Class-term links across every term — what the delete rule turns on. */
  classAssignments: number
  /** Scores recorded against it, ever. */
  recordedScores: number
}

interface AllSubjectsTableProps {
  subjects: Subject[]
  hasCurrentTerm: boolean
}

const PAGE_SIZES = [10, 25, 50, 100]

type Usage = "ALL" | "TAUGHT" | "IDLE"

const USAGE_LABELS: Record<Usage, string> = {
  ALL: "All subjects",
  TAUGHT: "Taught this term",
  IDLE: "Not taught this term",
}

/**
 * A count with the names behind it on hover.
 *
 * The number alone answers "how many", which is what the column is for; the tooltip answers
 * "which", without a second screen.
 */
function CountCell({ count, names, empty }: { count: number; names: string[]; empty: string }) {
  if (count === 0) {
    return <span className="text-muted-foreground">{empty}</span>
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help font-medium underline decoration-dotted underline-offset-4">
            {count}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px]">
          <div className="grid gap-1">
            {names.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function AllSubjectsTable({ subjects, hasCurrentTerm }: AllSubjectsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [usage, setUsage] = useState<Usage>("ALL")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const router = useRouter()

  const filteredSubjects = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return subjects.filter((subject) => {
      if (usage === "TAUGHT" && subject.classes.length === 0) return false
      if (usage === "IDLE" && subject.classes.length > 0) return false
      if (!needle) return true
      return (
        subject.name.toLowerCase().includes(needle) ||
        subject.code.toLowerCase().includes(needle) ||
        subject.classes.some((cls) => cls.name.toLowerCase().includes(needle)) ||
        subject.teachers.some((teacher) => teacher.name.toLowerCase().includes(needle))
      )
    })
  }, [subjects, searchQuery, usage])

  const totalItems = filteredSubjects.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const page = Math.min(currentPage, totalPages)
  const startIndex = (page - 1) * pageSize
  const visible = filteredSubjects.slice(startIndex, startIndex + pageSize)

  const handleViewSubject = (subjectId: string) => router.push(`/dashboard/admin/subjects/${subjectId}`)
  const handleEditSubject = (subjectId: string) => router.push(`/dashboard/admin/subjects/edit/${subjectId}`)

  const handleDeleteSubject = async () => {
    if (!subjectToDelete) return

    try {
      setIsDeleting(true)
      await deleteSubject(subjectToDelete.id)
      toast.success(`${subjectToDelete.name} deleted`)
      router.refresh()
    } catch (error: unknown) {
      console.error("Failed to delete subject:", error)
      toast.error((error as Error).message || "Failed to delete subject")
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setSubjectToDelete(null)
    }
  }

  const isFiltered = searchQuery.trim() !== "" || usage !== "ALL"

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by subject, code, class or teacher..."
              className="w-full pl-8"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setCurrentPage(1)
              }}
            />
          </div>

          {hasCurrentTerm && (
            <Select
              value={usage}
              onValueChange={(value) => {
                setUsage(value as Usage)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(USAGE_LABELS) as Usage[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {USAGE_LABELS[key]}
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
                setUsage("ALL")
                setCurrentPage(1)
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={() => router.push("/dashboard/admin/subjects/create")}>
            <Plus className="mr-2 h-4 w-4" />
            Add subject
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Subject</TableHead>
                <TableHead className="whitespace-nowrap">Code</TableHead>
                <TableHead className="whitespace-nowrap text-right">Classes this term</TableHead>
                <TableHead className="whitespace-nowrap text-right">Teachers this term</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    {isFiltered ? "No subjects match those filters." : "No subjects yet."}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((subject) => {
                  const verdict = canDeleteSubject({
                    classAssignments: subject.classAssignments,
                    recordedScores: subject.recordedScores,
                  })
                  return (
                    <TableRow
                      key={subject.id}
                      className="cursor-pointer"
                      onClick={rowOpenHandler(() => handleViewSubject(subject.id))}
                    >
                      <TableCell className="font-medium">{subject.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{subject.code}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <CountCell
                          count={subject.classes.length}
                          names={subject.classes.map((cls) => cls.name)}
                          empty="—"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <CountCell
                          count={subject.teachers.length}
                          names={subject.teachers.map((teacher) => teacher.name)}
                          empty="—"
                        />
                      </TableCell>
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleViewSubject(subject.id)}>
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditSubject(subject.id)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {verdict.allowed ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setSubjectToDelete(subject)
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem disabled>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                                <p className="max-w-64 px-2 pb-1.5 pl-8 text-xs leading-snug text-muted-foreground">
                                  {verdict.reason}
                                </p>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
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
                  setCurrentPage(1)
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

              <Button variant="outline" size="sm" onClick={() => setCurrentPage(page - 1)} disabled={page === 1}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(page + 1)}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {subjectToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              No class teaches this subject and no result has been recorded against it, so nothing else is
              affected. Any teacher assignment it still carries is removed with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete subject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
