"use client"

import { useState } from "react"
import { ChevronDown, BookOpen, Search, Check, X } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
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
import { assignClassToTerm, removeClassFromTerm } from "@/app/actions/class-term-management"
import { ClassLevel } from "@prisma/client"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

interface Class {
  id: string
  name: string
  level: ClassLevel
  isAssignedToCurrentTerm: boolean
  classTermId: string | null
}

interface CurrentTerm {
  id: string
  name: string
  sessionName: string
}

interface ClassTermsTableProps {
  classes: Class[]
  currentTerm: CurrentTerm
}

export function ClassTermsTable({ classes, currentTerm }: ClassTermsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [classToRemove, setClassToRemove] = useState<Class | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const router = useRouter()

  // Filter classes based on search query
  const filteredClasses = classes.filter(
    (cls) =>
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.level.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Pagination logic
  const totalItems = filteredClasses.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedClasses = filteredClasses.slice(startIndex, endIndex)

  // Reset to first page when search query changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Format class level for display
  const formatClassLevel = (level: ClassLevel) => {
    switch (level) {
      case ClassLevel.PRIMARY:
        return "Primary"
      case ClassLevel.JSS:
        return "Junior Secondary"
      case ClassLevel.SSS:
        return "Senior Secondary"
      default:
        return level
    }
  }

  // Handle assign class to term
  const handleAssignClassToTerm = async (classId: string) => {
    try {
      setIsProcessing(classId)
      const result = await assignClassToTerm({
        classId,
        termId: currentTerm.id,
      })

      if (result.success) {
        toast.success("Class assigned to term successfully")
        router.refresh()
      }
    } catch (error: unknown) {
      console.error("Failed to assign class to term:", error)
      toast.error((error as Error).message || "Failed to assign class to term")
    } finally {
      setIsProcessing(null)
    }
  }

  // Handle remove class from term
  const handleRemoveClassFromTerm = async () => {
    if (!classToRemove || !classToRemove.classTermId) return

    try {
      setIsProcessing(classToRemove.id)
      await removeClassFromTerm(classToRemove.classTermId)
      toast.success("Class removed from term successfully")
      router.refresh()
    } catch (error: unknown) {
      console.error("Failed to remove class from term:", error)
      toast.error((error as Error).message || "Failed to remove class from term")
    } finally {
      setIsProcessing(null)
      setConfirmDialogOpen(false)
      setClassToRemove(null)
    }
  }

  // Handle manage subjects
  const handleManageSubjects = (classTermId: string) => {
    router.push(`/dashboard/admin/class-terms/${classTermId}/subjects`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search classes..."
            className="w-full pl-8"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <div>
          <Badge variant="outline" className="text-sm">
            Current Term: {currentTerm.name} ({currentTerm.sessionName})
          </Badge>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    Class Name
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead className="whitespace-nowrap">Level</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedClasses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No classes found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedClasses.map((cls) => (
                  <TableRow key={cls.id}>
                    <TableCell className="font-medium">{cls.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatClassLevel(cls.level)}</Badge>
                    </TableCell>
                    <TableCell>
                      {cls.isAssignedToCurrentTerm ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          <Check className="mr-1 h-3 w-3" />
                          Assigned
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-600">
                          <X className="mr-1 h-3 w-3" />
                          Not Assigned
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {cls.isAssignedToCurrentTerm ? (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleManageSubjects(cls.classTermId!)}>
                              <BookOpen className="mr-2 h-4 w-4" />
                              Manage Subjects
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setClassToRemove(cls)
                                setConfirmDialogOpen(true)
                              }}
                              disabled={isProcessing === cls.id}
                            >
                              {isProcessing === cls.id ? "Processing..." : "Remove from Term"}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAssignClassToTerm(cls.id)}
                            disabled={isProcessing === cls.id}
                          >
                            {isProcessing === cls.id ? "Processing..." : "Assign to Term"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (() => {
          const getPageNumbers = () => {
            if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

            const pages: (number | "ellipsis")[] = [1]
            const left = Math.max(2, currentPage - 1)
            const right = Math.min(totalPages - 1, currentPage + 1)

            if (left > 2) pages.push("ellipsis")

            for (let p = left; p <= right; p++) pages.push(p)

            if (right < totalPages - 1) pages.push("ellipsis")

            pages.push(totalPages)
            return pages
          }

          const pages = getPageNumbers()

          return (
            <div className="flex flex-col-reverse md:flex-row items-center md:justify-between gap-3 px-4 py-4">
              <div className="text-sm text-muted-foreground">
          Showing <span className="font-medium">{startIndex + 1}</span> to{" "}
          <span className="font-medium">{Math.min(endIndex, totalItems)}</span> of{" "}
          <span className="font-medium">{totalItems}</span> classes
              </div>

              <nav aria-label="Pagination" className="flex justify-center w-full md:w-auto">
          <Pagination>
            <PaginationContent className="flex items-center gap-1 rounded-md bg-transparent">
              <PaginationItem>
                <PaginationPrevious
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
            aria-label="Previous page"
                />
              </PaginationItem>

              {/* Page buttons */}
              {pages.map((p, idx) =>
                p === "ellipsis" ? (
            <PaginationItem key={`e-${idx}`}>
              <PaginationEllipsis />
            </PaginationItem>
                ) : (
            <PaginationItem key={p}>
              <PaginationLink
                onClick={() => handlePageChange(p)}
                isActive={currentPage === p}
                className={`cursor-pointer px-3 py-1 rounded-md ${currentPage === p ? "bg-primary text-primary-foreground" : "hover:bg-muted/40"}`}
                aria-current={currentPage === p ? "page" : undefined}
                aria-label={`Go to page ${p}`}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
                ),
              )}

              <PaginationItem>
                <PaginationNext
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
            aria-label="Next page"
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
              </nav>
            </div>
          )
        })()}
      </Card>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the class <span className="font-semibold">{classToRemove?.name}</span> from the current
              term{" "}
              <span className="font-semibold">
                {currentTerm.name} ({currentTerm.sessionName})
              </span>
              .
              <span className="block mt-2 text-destructive">
                Warning: This will also remove all subject assignments for this class in this term.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveClassFromTerm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isProcessing === classToRemove?.id}
            >
              {isProcessing === classToRemove?.id ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
