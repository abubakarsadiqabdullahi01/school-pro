"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Download, Filter, Loader2, MoreHorizontal, Search, UserPlus } from "lucide-react"
import { toast } from "sonner"
import Image from "next/image"

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { deleteTeacher } from "@/app/actions/teacher-management"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface ClassInfo {
  id: string
  className: string
  classLevel: string
  termName: string
  sessionName: string
}

interface SubjectInfo {
  id: string
  name: string
  code: string
}

interface Teacher {
  id: string
  userId: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone: string
  avatarUrl: string
  staffId: string
  department: string
  qualification: string
  gender: "MALE" | "FEMALE" | "OTHER" | null
  dateOfBirth: Date | null
  state: string
  lga: string
  address: string
  school: {
    id: string
    name: string
    code: string
  }
  classes: ClassInfo[]
  subjects: SubjectInfo[]
  assessmentsCount: number
  createdAt: Date
}

interface TeachersTableProps {
  teachers: Teacher[]
}

export function TeachersTable({ teachers }: TeachersTableProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [genderFilter, setGenderFilter] = useState("all")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Get unique departments for filter
  const departments = Array.from(
    new Set(teachers.map(t => t.department).filter(Boolean))
  );

  // Filter teachers based on search query and filters
  const filteredTeachers = teachers.filter((teacher) => {
    const matchesSearch =
      teacher.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.staffId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.department.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesGender =
      genderFilter === "all" ||
      (genderFilter === "MALE" && teacher.gender === "MALE") ||
      (genderFilter === "FEMALE" && teacher.gender === "FEMALE") ||
      (genderFilter === "OTHER" && teacher.gender === "OTHER") ||
      (genderFilter === "UNSPECIFIED" && teacher.gender === null)

    const matchesDepartment =
      departmentFilter === "all" ||
      teacher.department === departmentFilter

    return matchesSearch && matchesGender && matchesDepartment
  })

  // Format classes display with tooltip
  const formatClassesDisplay = (classes: ClassInfo[]) => {
    if (classes.length === 0) return <Badge variant="outline">No classes</Badge>
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="default">{classes.length} class{classes.length !== 1 ? "es" : ""}</Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-[300px]">
            <div className="grid gap-2">
              {classes.map((cls) => (
                <div key={cls.id} className="flex flex-col">
                  <div className="font-medium">{cls.className}</div>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>{cls.classLevel}</span>
                    <span>•</span>
                    <span>{cls.termName} term</span>
                    <span>•</span>
                    <span>{cls.sessionName}</span>
                  </div>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Format subjects display with tooltip
  const formatSubjectsDisplay = (subjects: SubjectInfo[]) => {
    if (subjects.length === 0) return <Badge variant="outline">No subjects</Badge>
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="secondary">{subjects.length} subject{subjects.length !== 1 ? "s" : ""}</Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-[300px]">
            <div className="grid gap-2">
              {subjects.map((subject) => (
                <div key={subject.id} className="flex items-center gap-2">
                  <span className="font-medium">{subject.name}</span>
                  <Badge variant="outline">{subject.code}</Badge>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Handle teacher deletion
  const handleDeleteClick = (teacher: Teacher) => {
    setTeacherToDelete(teacher)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!teacherToDelete) return

    setIsDeleting(true)
    try {
      const result = await deleteTeacher(teacherToDelete.id)

      if (result.success) {
        toast.success("Teacher Deleted", {
          description: `${teacherToDelete.fullName} has been successfully removed.`,
        })
        setIsDeleteDialogOpen(false)
        router.refresh()
      } else {
        toast.error("Delete Failed", {
          description: result.error || "Failed to delete teacher. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error deleting teacher:", error)
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
            <CardTitle>Teachers</CardTitle>
            <CardDescription>Manage school teachers and their assignments</CardDescription>
          </div>
          <Button asChild>
            <Link href="/dashboard/admin/teachers/new">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Teacher
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, staff ID, department..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger className="w-[150px]">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <SelectValue placeholder="Gender" />
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

              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[180px]">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <SelectValue placeholder="Department" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
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
                  <TableHead>Teacher</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeachers.length > 0 ? (
                  filteredTeachers.map((teacher) => (
                    <TableRow key={teacher.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={teacher.avatarUrl} />
                            <AvatarFallback>
                              {teacher.firstName.charAt(0)}{teacher.lastName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span>{teacher.fullName}</span>
                            {teacher.gender && (
                              <span className="text-xs text-muted-foreground">
                                {teacher.gender === "MALE" ? "Male" : teacher.gender === "FEMALE" ? "Female" : "Other"}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{teacher.staffId}</Badge>
                      </TableCell>
                      <TableCell>
                        {teacher.department || (
                          <span className="text-muted-foreground">Not specified</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {teacher.email && (
                            <span className="text-sm truncate max-w-[180px]">{teacher.email}</span>
                          )}
                          {teacher.phone && (
                            <span className="text-xs text-muted-foreground">{teacher.phone}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatClassesDisplay(teacher.classes)}
                      </TableCell>
                      <TableCell>
                        {formatSubjectsDisplay(teacher.subjects)}
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
                            <DropdownMenuLabel>Actions for {teacher.firstName}</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/admin/teachers/${teacher.id}`}>
                                View Profile
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/admin/teachers/${teacher.id}/edit`}>
                                Edit Teacher
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteClick(teacher)}
                              disabled={teacher.classes.length > 0 || teacher.subjects.length > 0 || teacher.assessmentsCount > 0}
                            >
                              Delete Teacher
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      {searchQuery || genderFilter !== "all" || departmentFilter !== "all" ? (
                        <div className="flex flex-col items-center gap-2">
                          <p>No teachers match your search criteria.</p>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setSearchQuery("")
                              setGenderFilter("all")
                              setDepartmentFilter("all")
                            }}
                          >
                            Clear filters
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <p>No teachers found in this school.</p>
                          <Button asChild>
                            <Link href="/dashboard/admin/teachers/new">
                              <UserPlus className="mr-2 h-4 w-4" />
                              Add your first teacher
                            </Link>
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Teacher Deletion</DialogTitle>
            <DialogDescription>
              {teacherToDelete ? (
                <>
                  You are about to delete <span className="font-semibold">{teacherToDelete.fullName}</span>.
                  
                  {(teacherToDelete.classes.length > 0 || teacherToDelete.subjects.length > 0 || teacherToDelete.assessmentsCount > 0) ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-destructive font-medium">
                        This teacher cannot be deleted because they have active assignments.
                      </p>
                      
                      {teacherToDelete.classes.length > 0 && (
                        <div className="text-sm">
                          <p>Assigned to {teacherToDelete.classes.length} classes:</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {teacherToDelete.classes.slice(0, 3).map(cls => (
                              <li key={cls.id}>
                                {cls.className} ({cls.classLevel}) - {cls.termName}
                              </li>
                            ))}
                            {teacherToDelete.classes.length > 3 && (
                              <li>...and {teacherToDelete.classes.length - 3} more</li>
                            )}
                          </ul>
                        </div>
                      )}

                      {teacherToDelete.subjects.length > 0 && (
                        <div className="text-sm">
                          <p>Teaching {teacherToDelete.subjects.length} subjects:</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {teacherToDelete.subjects.slice(0, 3).map(subject => (
                              <li key={subject.id}>
                                {subject.name} ({subject.code})
                              </li>
                            ))}
                            {teacherToDelete.subjects.length > 3 && (
                              <li>...and {teacherToDelete.subjects.length - 3} more</li>
                            )}
                          </ul>
                        </div>
                      )}

                      {teacherToDelete.assessmentsCount > 0 && (
                        <div className="text-sm">
                          <p>Has {teacherToDelete.assessmentsCount} assessment records.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p>This action cannot be undone.</p>
                      <p className="text-muted-foreground">
                        All associated data will be permanently removed.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <span className="text-destructive">No teacher selected for deletion.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting || 
                (teacherToDelete?.classes.length || 0) > 0 || 
                (teacherToDelete?.subjects.length || 0) > 0 ||
                (teacherToDelete?.assessmentsCount || 0) > 0}
              className="gap-1"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isDeleting ? "Deleting..." : "Delete Teacher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}