"use client"

import { useState } from "react"
import { ChevronDown, Download, Edit, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { deleteSubject } from "@/app/actions/subject-management"

interface ClassInfo {
  id: string
  className: string
  classLevel: string
  termName: string
}

interface TeacherInfo {
  id: string
  name: string
  teacherId: string
}

interface Subject {
  id: string
  name: string
  code: string
  schoolId: string
  schoolName: string
  schoolCode: string
  classes: ClassInfo[]
  teachers: TeacherInfo[]
}

interface AllSubjectsTableProps {
  subjects: Subject[]
}

export function AllSubjectsTable({ subjects }: AllSubjectsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  // Filter subjects based on search query
  const filteredSubjects = subjects.filter(
    (subject) =>
      subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.schoolCode.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Handle edit subject
  const handleEditSubject = (subjectId: string) => {
    router.push(`/dashboard/admin/subjects/edit/${subjectId}`)
  }

  // Handle view subject
  const handleViewSubject = (subjectId: string) => {
    router.push(`/dashboard/admin/subjects/${subjectId}`)
  }

  // Handle add subject
  const handleAddSubject = () => {
    router.push("/dashboard/admin/subjects/create")
  }

  // Handle delete subject
  const handleDeleteSubject = async () => {
    if (!subjectToDelete) return

    try {
      setIsDeleting(true)
      await deleteSubject(subjectToDelete.id)
      toast.success("Subject deleted successfully")
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

  // Format class display
  const formatClassesDisplay = (classes: ClassInfo[]) => {
    if (classes.length === 0) return <Badge variant="outline">No classes</Badge>
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className="flex gap-1">
              <Badge variant="secondary">{classes.length} classes</Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[300px]">
            <div className="grid gap-2">
              {classes.map((cls) => (
                <div key={cls.id} className="flex flex-col">
                  <div className="font-medium">{cls.className}</div>
                  <div className="flex gap-2 text-sm text-muted-foreground">
                    <span>{cls.classLevel}</span>
                    <span>•</span>
                    <span>{cls.termName} term</span>
                  </div>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Format teachers display
  const formatTeachersDisplay = (teachers: TeacherInfo[]) => {
    if (teachers.length === 0) return <Badge variant="outline">No teachers</Badge>
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className="flex gap-1">
              <Badge variant="secondary">{teachers.length} teachers</Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[300px]">
            <div className="grid gap-2">
              {teachers.map((teacher) => (
                <div key={teacher.id} className="font-medium">
                  {teacher.name}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search subjects by name, code, or school..."
            className="w-full pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={handleAddSubject}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Subject
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    Subject Name
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </div>
                </TableHead>
                <TableHead className="whitespace-nowrap">Subject Code</TableHead>
                <TableHead className="whitespace-nowrap">Assigned Classes</TableHead>
                <TableHead className="whitespace-nowrap">Assigned Teachers</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    {searchQuery ? (
                      <div className="flex flex-col items-center gap-2">
                        <p>No subjects match your search.</p>
                        <Button variant="ghost" onClick={() => setSearchQuery("")}>
                          Clear search
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <p>No subjects found in this school.</p>
                        <Button onClick={handleAddSubject}>
                          <Plus className="mr-2 h-4 w-4" />
                          Create your first subject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSubjects.map((subject) => (
                  <TableRow key={subject.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{subject.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {subject.code}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{subject.code}</Badge>
                    </TableCell>
                    <TableCell>
                      {formatClassesDisplay(subject.classes)}
                    </TableCell>
                    <TableCell>
                      {formatTeachersDisplay(subject.teachers)}
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
                          <DropdownMenuLabel>Actions for {subject.name}</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleViewSubject(subject.id)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditSubject(subject.id)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit subject
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setSubjectToDelete(subject)
                              setDeleteDialogOpen(true)
                            }}
                            disabled={subject.classes.length > 0 || subject.teachers.length > 0}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete subject
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Subject Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              {subjectToDelete ? (
                <>
                  You are about to delete the subject <span className="font-semibold">{subjectToDelete.name}</span>.
                  
                  {(subjectToDelete.classes.length > 0 || subjectToDelete.teachers.length > 0) ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-destructive font-medium">
                        This subject cannot be deleted because it's currently in use.
                      </p>
                      
                      {subjectToDelete.classes.length > 0 && (
                        <div className="text-sm">
                          <p>Assigned to {subjectToDelete.classes.length} classes:</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {subjectToDelete.classes.slice(0, 3).map(cls => (
                              <li key={cls.id}>
                                {cls.className} ({cls.classLevel}) - {cls.termName}
                              </li>
                            ))}
                            {subjectToDelete.classes.length > 3 && (
                              <li>...and {subjectToDelete.classes.length - 3} more</li>
                            )}
                          </ul>
                        </div>
                      )}

                      {subjectToDelete.teachers.length > 0 && (
                        <div className="text-sm">
                          <p>Assigned to {subjectToDelete.teachers.length} teachers:</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {subjectToDelete.teachers.slice(0, 3).map(teacher => (
                              <li key={teacher.id}>{teacher.name}</li>
                            ))}
                            {subjectToDelete.teachers.length > 3 && (
                              <li>...and {subjectToDelete.teachers.length - 3} more</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p>This action cannot be undone.</p>
                    </div>
                  )}
                </>
              ) : (
                <span className="text-destructive">No subject selected for deletion.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting || (subjectToDelete?.classes?.length ?? 0) > 0 || (subjectToDelete?.teachers?.length ?? 0) > 0}
            >
              {isDeleting ? "Deleting..." : "Delete Subject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}