"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Download, Filter, Loader2, MoreHorizontal, Search, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deleteParent } from "@/app/actions/parent-management"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

interface Parent {
  id: string
  userId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  occupation: string
  gender: "MALE" | "FEMALE" | "OTHER" | null
  state: string
  lga: string
  address: string
  studentCount: number
  createdAt: Date
}

interface ParentsTableProps {
  parents: Parent[]
}

export function ParentsTable({ parents }: ParentsTableProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [genderFilter, setGenderFilter] = useState("all")
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [parentToDelete, setParentToDelete] = useState<Parent | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Filter parents based on search query and gender filter
  const filteredParents = parents.filter((parent) => {
    const matchesSearch =
      parent.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.occupation.toLowerCase().includes(searchQuery.toLowerCase())

    const pg = parent.gender ? String(parent.gender).toUpperCase() : null

    const matchesGender =
      genderFilter === "all" ||
      (genderFilter === "MALE" && pg === "MALE") ||
      (genderFilter === "FEMALE" && pg === "FEMALE") ||
      (genderFilter === "OTHER" && pg === "OTHER") ||
      (genderFilter === "UNSPECIFIED" && pg === null)

    return matchesSearch && matchesGender
  })

  // Pagination logic
  const totalItems = filteredParents.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedParents = filteredParents.slice(startIndex, endIndex)

  // Reset to first page when search query or filter changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  const handleGenderFilterChange = (value: string) => {
    setGenderFilter(value)
    setCurrentPage(1)
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  // Handle parent deletion
  const handleDeleteClick = (parent: Parent) => {
    if (parent.studentCount > 0) {
      toast.error("Cannot Delete Parent", {
        description: "This parent has linked students. Please unlink all students first.",
      })
      return
    }

    setParentToDelete(parent)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!parentToDelete) return

    setIsDeleting(true)
    try {
      const result = await deleteParent(parentToDelete.id)

      if (result.success) {
        toast.success("Parent Deleted", {
          description: "The parent has been successfully deleted.",
        })
        setIsDeleteDialogOpen(false)
        router.refresh()
      } else {
        toast.error("Delete Failed", {
          description: (result as { success: boolean; error?: string }).error || "Failed to delete parent. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error deleting parent:", error)
      toast.error("Delete Failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Parents</CardTitle>
            <CardDescription>Manage parents and their linked students</CardDescription>
          </div>
          <Button asChild>
            <Link href="/dashboard/admin/parents/create">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Parent
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={genderFilter} onValueChange={handleGenderFilterChange}>
                <SelectTrigger className="w-[180px]">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <span>Filter by Gender</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                  <SelectItem value="UNSPECIFIED">Unspecified</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact Information</TableHead>
                  <TableHead>Occupation</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Registration Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedParents.length > 0 ? (
                  paginatedParents.map((parent) => (
                    <TableRow key={parent.id}>
                      <TableCell className="font-medium">
                        {parent.firstName} {parent.lastName}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {parent.email && <span className="text-xs text-muted-foreground">{parent.email}</span>}
                          {parent.phone && <span className="text-sm">{parent.phone}</span>}
                        </div>
                      </TableCell>
                      <TableCell>{parent.occupation || "Not specified"}</TableCell>
                      <TableCell>
                        {(() => {
                          const g = parent.gender ? String(parent.gender).toUpperCase() : null
                          if (!g) return <Badge variant="outline">Not specified</Badge>
                          const variant = g === "MALE" ? "default" : g === "FEMALE" ? "secondary" : "outline"
                          const label = g === "MALE" ? "Male" : g === "FEMALE" ? "Female" : "Other"
                          return (
                            <Badge variant={variant}>
                              {label}
                            </Badge>
                          )
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={parent.studentCount > 0 ? "default" : "outline"}>
                          {parent.studentCount} student{parent.studentCount !== 1 ? "s" : ""}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(parent.createdAt), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/admin/parents/${parent.id}`}>View Details</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/admin/parents/${parent.id}/edit`}>Edit Parent</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteClick(parent)}
                              disabled={parent.studentCount > 0}
                            >
                              Delete Parent
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      {searchQuery || genderFilter !== "all"
                        ? "No parents found matching your filters."
                        : "No parents found in the system."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

            {/* Pagination */}
            {totalPages > 1 && (
            <div className="flex flex-col-reverse md:flex-row items-center justify-between px-2 py-4 gap-3">
              <div className="w-full md:w-auto text-sm text-muted-foreground text-center md:text-left">
              Showing <span className="font-medium">{startIndex + 1}</span> to{" "}
              <span className="font-medium">{Math.min(endIndex, totalItems)}</span> of{" "}
              <span className="font-medium">{totalItems}</span> parents
              </div>

              <div className="w-full md:w-auto flex items-center justify-center">
              <Pagination>
                <PaginationContent>
                {/* First */}
                <PaginationItem>
                  <PaginationLink
                  onClick={() => handlePageChange(1)}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  aria-disabled={currentPage === 1}
                  title="Go to first page"
                  >
                  «
                  </PaginationLink>
                </PaginationItem>

                {/* Previous */}
                <PaginationItem>
                  <PaginationPrevious
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  title="Previous page"
                  />
                </PaginationItem>

                {/* Page numbers (responsive window) */}
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let pageNumber: number
                  if (totalPages <= 7) {
                  pageNumber = i + 1
                  } else {
                  const windowSize = 5
                  const left = Math.max(1, Math.min(currentPage - Math.floor(windowSize / 2), totalPages - windowSize + 1))
                  pageNumber = left + i
                  }
                  if (pageNumber < 1 || pageNumber > totalPages) return null

                  return (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink
                    onClick={() => handlePageChange(pageNumber)}
                    isActive={currentPage === pageNumber}
                    className="cursor-pointer"
                    aria-current={currentPage === pageNumber ? "page" : undefined}
                    title={`Go to page ${pageNumber}`}
                    >
                    {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                  )
                })}

                {/* Ellipsis + Last when needed */}
                {totalPages > 7 && currentPage < totalPages - 3 && (
                  <>
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink
                    onClick={() => handlePageChange(totalPages)}
                    className="cursor-pointer"
                    title={`Go to page ${totalPages}`}
                    >
                    {totalPages}
                    </PaginationLink>
                  </PaginationItem>
                  </>
                )}

                {/* Next */}
                <PaginationItem>
                  <PaginationNext
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  title="Next page"
                  />
                </PaginationItem>

                {/* Last */}
                <PaginationItem>
                  <PaginationLink
                  onClick={() => handlePageChange(totalPages)}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  aria-disabled={currentPage === totalPages}
                  title="Go to last page"
                  >
                  »
                  </PaginationLink>
                </PaginationItem>
                </PaginationContent>
              </Pagination>
              </div>

              <div className="w-full md:w-auto text-sm text-muted-foreground text-center md:text-right">
              Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
              </div>
            </div>
            )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Parent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this parent? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {parentToDelete && (
            <div className="py-4">
              <p className="font-medium">
                {parentToDelete.firstName} {parentToDelete.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{parentToDelete.email}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting} className="gap-1">
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
