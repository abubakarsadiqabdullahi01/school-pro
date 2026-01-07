"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Download, MoreHorizontal, Search, UserPlus, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { getStudents, toggleStudentStatus, deleteStudent } from "@/app/actions/student-management"
import { toast } from "sonner"
import { TableSkeleton } from "@/components/ui/loading-skeleton"

interface Student {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  fullName: string
  class: string
  gender: string
  state: string
  lga: string
  address: string
  year: number | null
  parentName?: string
  registrationDate: string
  isActive: boolean
}

interface ClassOption {
  id: string
  name: string
}

interface PaginationData {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function StudentList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [classFilter, setClassFilter] = useState<string>("all")
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned" | "not_assigned">("all")
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [pagination, setPagination] = useState<PaginationData>({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(true)
  const [togglingStudents, setTogglingStudents] = useState<Set<string>>(new Set())
  const [deletingStudents, setDeletingStudents] = useState<Set<string>>(new Set())

  // ✅ FIXED: Using useRef for debounce timer to avoid ESLint warning
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced search handler
  const handleSearchChange = (value: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      setSearchQuery(value)
    }, 300)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Fetch students when filters or page change
  useEffect(() => {
    const fetchStudents = async () => {
      setIsLoading(true)
      try {
        const result = await getStudents({
          classId: classFilter !== "all" ? classFilter : undefined,
          assignmentStatus: assignmentFilter,
          search: searchQuery,
          page: pagination.page,
          pageSize: pagination.pageSize,
        })
        if (result.success && result.data) {
          setStudents(result.data.students)
          setClasses(result.data.classes)
          setPagination(result.data.pagination)
        } else {
          toast.error("Error", {
            description: result.error || "Failed to fetch students",
          })
        }
      } catch (error) {
        console.error("Error fetching students:", error)
        toast.error("Error", {
          description: "Failed to fetch students. Please try again.",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchStudents()
  }, [classFilter, assignmentFilter, searchQuery, pagination.page, pagination.pageSize])

  // Handle student status toggle
  const handleToggleStudentStatus = async (studentId: string) => {
    setTogglingStudents((prev) => new Set(prev).add(studentId))

    try {
      const result = await toggleStudentStatus(studentId)
      if (result.success && result.data) {
        // Update the student in the local state
        setStudents((prev) =>
          prev.map((student) => (student.id === studentId ? { ...student, isActive: result.data.isActive } : student)),
        )

        toast.success("Success", {
          description: result.data.message,
        })
      } else {
        toast.error("Error", {
          description: result.error || "Failed to update student status",
        })
      }
    } catch (error) {
      console.error("Error toggling student status:", error)
      toast.error("Error", {
        description: "Failed to update student status. Please try again.",
      })
    } finally {
      setTogglingStudents((prev) => {
        const newSet = new Set(prev)
        newSet.delete(studentId)
        return newSet
      })
    }
  }

  // Handle student deletion
  const handleDeleteStudent = async (studentId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this student? This action cannot be undone if the student has no academic records."
      )
    ) {
      return
    }

    setDeletingStudents((prev) => new Set(prev).add(studentId))

    try {
      const result = await deleteStudent(studentId)

      if (result.success) {
        // Remove from local state
        setStudents((prev) => prev.filter((s) => s.id !== studentId))

        toast.success("Success", {
          description: result.message,
        })

        if (result.isArchived) {
          toast.info("Note", {
            description: "Student was archived instead of deleted due to existing records",
          })
        }

        // Update pagination total
        setPagination((prev) => ({
          ...prev,
          total: prev.total - 1,
          totalPages: Math.ceil((prev.total - 1) / prev.pageSize),
        }))
      } else {
        toast.error("Error", {
          description: result.error || "Failed to delete student",
        })
      }
    } catch (error) {
      console.error("Error deleting student:", error)
      toast.error("Error", {
        description: "Failed to delete student. Please try again.",
      })
    } finally {
      setDeletingStudents((prev) => {
        const newSet = new Set(prev)
        newSet.delete(studentId)
        return newSet
      })
    }
  }

  // Simplified pagination component
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null

    return (
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="text-sm text-muted-foreground">
          Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
          {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} entries
        </div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  if (pagination.page > 1) {
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                }}
                className={pagination.page === 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>

            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              let pageNum
              if (pagination.totalPages <= 5) {
                pageNum = i + 1
              } else if (pagination.page <= 3) {
                pageNum = i + 1
              } else if (pagination.page >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i
              } else {
                pageNum = pagination.page - 2 + i
              }

              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setPagination((prev) => ({ ...prev, page: pageNum }))
                    }}
                    isActive={pagination.page === pageNum}
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              )
            })}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  if (pagination.page < pagination.totalPages) {
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                }}
                className={pagination.page === pagination.totalPages ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        <div className="flex items-center space-x-2">
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) => {
              setPagination({
                page: 1,
                pageSize: Number(value),
                total: pagination.total,
                totalPages: Math.ceil(pagination.total / Number(value)),
              })
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-6"
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Students</CardTitle>
            <CardDescription>Manage all students in the system</CardDescription>
          </div>
          <Button asChild>
            <Link href="/dashboard/admin/students/create">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Student
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or admission number..."
                className="pl-8"
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={assignmentFilter}
                onValueChange={(value) => setAssignmentFilter(value as "all" | "assigned" | "not_assigned")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Students</SelectItem>
                  <SelectItem value="assigned">Assigned to Class</SelectItem>
                  <SelectItem value="not_assigned">Not Assigned</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
          {isLoading ? (
            <div>
              <TableSkeleton />
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Admission No.</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>LGA</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Parent/Guardian</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.length > 0 ? (
                      students.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.admissionNo}</TableCell>
                          <TableCell>
                            {student.firstName} {student.lastName}
                          </TableCell>
                          <TableCell>{student.class}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                student.gender === "MALE"
                                  ? "default"
                                  : student.gender === "FEMALE"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {student.gender}
                            </Badge>
                          </TableCell>
                          <TableCell>{student.lga}</TableCell>
                          <TableCell>{student.year || "N/A"}</TableCell>
                          <TableCell>{student.parentName || "Not Assigned"}</TableCell>
                          <TableCell>
                            <Badge variant={student.isActive ? "default" : "destructive"}>
                              {student.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
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
                                  <Link href={`/dashboard/admin/students/${student.id}`}>View Details</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/admin/students/${student.id}/edit`}>Edit Student</Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/admin/students/${student.id}/academic-records`}>
                                    View Academic Records
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleToggleStudentStatus(student.id)}
                                  disabled={togglingStudents.has(student.id)}
                                  className={student.isActive ? "text-destructive" : "text-green-600"}
                                >
                                  {togglingStudents.has(student.id)
                                    ? "Updating..."
                                    : student.isActive
                                      ? "Deactivate Student"
                                      : "Activate Student"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDeleteStudent(student.id)}
                                  disabled={deletingStudents.has(student.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  {deletingStudents.has(student.id) ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Deleting...
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Student
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center">
                          {searchQuery || classFilter !== "all" || assignmentFilter !== "all"
                            ? "No students found matching your filters."
                            : "No students found in the system."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {renderPagination()}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
