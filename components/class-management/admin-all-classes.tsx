"use client"

import { useMemo, useState } from "react"
import { Download, Edit, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
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
import { toast } from "sonner"
import { deleteClass } from "@/app/actions/class-management"
import { canDeleteClass } from "@/lib/class-rules"
import { rowOpenHandler } from "@/lib/row-open"
import type { ClassLevel } from "@prisma/client"

interface Class {
  id: string
  name: string
  level: ClassLevel
  schoolName: string
  schoolCode: string
  subjectsCount: number
  termsCount: number
  /** Every enrolment this class has ever carried, across all its terms — drives the delete rule. */
  enrolments: number
  /** Fees billed against this class's terms; a charge outlives the enrolment. */
  billedCharges: number
  /** Students on this class's roll for the current term — what the Students column shows. */
  currentRoll: number
}

interface AllClassesTableProps {
  classes: Class[]
}

const LEVEL_LABELS: Record<ClassLevel, string> = {
  PRIMARY: "Primary",
  JSS: "Junior Secondary",
  SSS: "Senior Secondary",
}

const PAGE_SIZES = [10, 25, 50, 100]

/**
 * Whether this class may be deleted.
 *
 * `recordedScores` is 0 rather than fetched: a score belongs to an enrolment and is deleted
 * with it, so scores only exist where there are enrolments — and any enrolment already
 * blocks the delete. The verdict is the one the server will reach; only its sentence is
 * shorter, because the server can also count the results.
 */
function removalVerdict(cls: Class) {
  return canDeleteClass({
    enrolments: cls.enrolments,
    recordedScores: 0,
    billedCharges: cls.billedCharges,
  })
}

export function AllClassesTable({ classes }: AllClassesTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [levelFilter, setLevelFilter] = useState<ClassLevel | "ALL">("ALL")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [classToDelete, setClassToDelete] = useState<Class | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const router = useRouter()

  const filteredClasses = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return classes.filter((cls) => {
      if (levelFilter !== "ALL" && cls.level !== levelFilter) return false
      if (!needle) return true
      // The level is searched by its label, not its enum value — nobody types "SSS" looking
      // for Senior Secondary after reading "Senior Secondary" in the column.
      return (
        cls.name.toLowerCase().includes(needle) ||
        LEVEL_LABELS[cls.level].toLowerCase().includes(needle) ||
        cls.level.toLowerCase().includes(needle)
      )
    })
  }, [classes, searchQuery, levelFilter])

  const totalItems = filteredClasses.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const page = Math.min(currentPage, totalPages)
  const startIndex = (page - 1) * pageSize
  const paginatedClasses = filteredClasses.slice(startIndex, startIndex + pageSize)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  const handleLevelChange = (value: string) => {
    setLevelFilter(value as ClassLevel | "ALL")
    setCurrentPage(1)
  }

  const handleViewClass = (classId: string) => router.push(`/dashboard/admin/classes/${classId}`)
  const handleEditClass = (classId: string) => router.push(`/dashboard/admin/classes/edit/${classId}`)

  const handleDeleteClass = async () => {
    if (!classToDelete) return

    try {
      setIsDeleting(true)
      await deleteClass(classToDelete.id)
      toast.success(`${classToDelete.name} deleted`)
      router.refresh()
    } catch (error) {
      console.error("Failed to delete class:", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete class")
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setClassToDelete(null)
    }
  }

  const isFiltered = searchQuery.trim() !== "" || levelFilter !== "ALL"

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by class or section..."
              className="w-full pl-8"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <Select value={levelFilter} onValueChange={handleLevelChange}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="All sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All sections</SelectItem>
              {(Object.keys(LEVEL_LABELS) as ClassLevel[]).map((level) => (
                <SelectItem key={level} value={level}>
                  {LEVEL_LABELS[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("")
                setLevelFilter("ALL")
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
          <Button onClick={() => router.push("/dashboard/admin/classes/create")}>
            <Plus className="mr-2 h-4 w-4" />
            Add Class
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Class Name</TableHead>
                <TableHead className="whitespace-nowrap">Section</TableHead>
                <TableHead className="whitespace-nowrap text-right">Students</TableHead>
                <TableHead className="whitespace-nowrap text-right">Subjects</TableHead>
                <TableHead className="whitespace-nowrap text-right">Terms</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedClasses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    {isFiltered ? "No classes match those filters." : "No classes yet."}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedClasses.map((cls) => {
                  const verdict = removalVerdict(cls)
                  return (
                    <TableRow
                      key={cls.id}
                      className="cursor-pointer"
                      onClick={rowOpenHandler(() => handleViewClass(cls.id))}
                    >
                      <TableCell className="font-medium">{cls.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{LEVEL_LABELS[cls.level]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{cls.currentRoll}</TableCell>
                      <TableCell className="text-right">{cls.subjectsCount}</TableCell>
                      <TableCell className="text-right">{cls.termsCount}</TableCell>
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
                            <DropdownMenuItem onClick={() => handleViewClass(cls.id)}>
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditClass(cls.id)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {verdict.allowed ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setClassToDelete(cls)
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
              {isFiltered && ` (filtered from ${classes.length})`}
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

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(page - 1)}
                disabled={page === 1}
              >
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
            <AlertDialogTitle>Delete {classToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the class from{" "}
              <span className="font-semibold">{classToDelete?.schoolName}</span> along with its{" "}
              {classToDelete?.termsCount} class {classToDelete?.termsCount === 1 ? "term" : "terms"} and the
              subjects assigned to them. No student is enrolled in it, so no results are affected. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClass}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete class"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
