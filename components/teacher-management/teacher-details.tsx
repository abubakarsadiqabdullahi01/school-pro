"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { BookOpen, Calendar, Edit, Loader2, Mail, MapPin, Phone, School, Trash2, User } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deleteTeacher } from "@/app/actions/teacher-management"
import { unassignTeacherFromClass, unassignTeacherFromSubject } from "@/app/actions/teacher-assignment"

interface TeacherDetailsProps {
  teacher: {
    id: string
    userId: string
    firstName: string
    lastName: string
    fullName: string
    email: string
    phone: string
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
    classes: Array<{
      id: string
      classTermId: string
      className: string
      termName: string
      sessionName: string
    }>
    subjects: Array<{
      id: string
      subjectId: string
      name: string
      code: string
    }>
    createdAt: Date
  }
}

export function TeacherDetails({ teacher }: TeacherDetailsProps) {
  const router = useRouter()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUnassigningClass, setIsUnassigningClass] = useState<string | null>(null)
  const [isUnassigningSubject, setIsUnassigningSubject] = useState<string | null>(null)

  // Handle teacher deletion
  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteTeacher(teacher.id)

      if (result.success) {
        toast.success("Teacher Deleted", {
          description: "The teacher has been successfully deleted.",
        })
        setIsDeleteDialogOpen(false)
        router.push("/dashboard/admin/teachers")
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

  // Handle unassigning a class
  const handleUnassignClass = async (classId: string) => {
    setIsUnassigningClass(classId)
    try {
      const result = await unassignTeacherFromClass(classId)

      if (result.success) {
        toast.success("Class Unassigned", {
          description: "The class has been successfully unassigned from the teacher.",
        })
      } else {
        toast.error("Unassign Failed", {
          description: result.error || "Failed to unassign class. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error unassigning class:", error)
      toast.error("Unassign Failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsUnassigningClass(null)
    }
  }

  // Handle unassigning a subject
  const handleUnassignSubject = async (subjectId: string) => {
    setIsUnassigningSubject(subjectId)
    try {
      const result = await unassignTeacherFromSubject(subjectId)

      if (result.success) {
        toast.success("Subject Unassigned", {
          description: "The subject has been successfully unassigned from the teacher.",
        })
      } else {
        toast.error("Unassign Failed", {
          description: result.error || "Failed to unassign subject. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error unassigning subject:", error)
      toast.error("Unassign Failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsUnassigningSubject(null)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Teacher Information */}
          <Card className="md:w-1/3">
            <CardHeader>
              <CardTitle>Teacher Information</CardTitle>
              <CardDescription>Basic details about the teacher</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center mb-6">
                <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <User size={40} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Full Name</h3>
                <p className="text-lg font-medium">{teacher.fullName}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Staff ID</h3>
                <p>{teacher.staffId}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Department</h3>
                <p>{teacher.department || "Not specified"}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Qualification</h3>
                <p>{teacher.qualification || "Not specified"}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Gender</h3>
                <p>
                  {teacher.gender === "MALE"
                    ? "Male"
                    : teacher.gender === "FEMALE"
                      ? "Female"
                      : teacher.gender === "OTHER"
                        ? "Other"
                        : "Not specified"}
                </p>
              </div>

              {teacher.dateOfBirth && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Date of Birth</h3>
                  <p>{format(new Date(teacher.dateOfBirth), "MMMM d, yyyy")}</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Joined Date</h3>
                <p>{format(new Date(teacher.createdAt), "MMMM d, yyyy")}</p>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Contact Information</h3>

                {teacher.email && (
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{teacher.email}</span>
                  </div>
                )}

                {teacher.phone && (
                  <div className="flex items-center gap-2 mb-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{teacher.phone}</span>
                  </div>
                )}

                {teacher.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p>{teacher.address}</p>
                      {(teacher.state || teacher.lga) && (
                        <p className="text-sm text-muted-foreground">
                          {teacher.lga && `${teacher.lga}, `}
                          {teacher.state}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Classes and Subjects */}
          <div className="md:w-2/3">
            <Tabs defaultValue="classes">
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="classes" className="flex-1">
                  <Calendar className="h-4 w-4 mr-2" />
                  Classes ({teacher.classes.length})
                </TabsTrigger>
                <TabsTrigger value="subjects" className="flex-1">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Subjects ({teacher.subjects.length})
                </TabsTrigger>
                <TabsTrigger value="school" className="flex-1">
                  <School className="h-4 w-4 mr-2" />
                  School Information
                </TabsTrigger>
              </TabsList>

              <TabsContent value="classes">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Assigned Classes</CardTitle>
                      <CardDescription>Classes this teacher is handling</CardDescription>
                    </div>
                    <Button variant="outline" asChild>
                      <Link href={`/dashboard/admin/teachers/${teacher.id}/assign-class`}>Assign Class</Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {teacher.classes.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Class</TableHead>
                            <TableHead>Term</TableHead>
                            <TableHead>Session</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {teacher.classes.map((cls) => (
                            <TableRow key={cls.id}>
                              <TableCell className="font-medium">{cls.className}</TableCell>
                              <TableCell>{cls.termName}</TableCell>
                              <TableCell>{cls.sessionName}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUnassignClass(cls.id)}
                                  disabled={isUnassigningClass === cls.id}
                                >
                                  {isUnassigningClass === cls.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Unassign"
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-4">No classes assigned to this teacher yet.</p>
                        <Button variant="outline" asChild>
                          <Link href={`/dashboard/admin/teachers/${teacher.id}/assign-class`}>Assign Class</Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="subjects">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Assigned Subjects</CardTitle>
                      <CardDescription>Subjects this teacher is teaching</CardDescription>
                    </div>
                    <Button variant="outline" asChild>
                      <Link href={`/dashboard/admin/teachers/${teacher.id}/assign-subject`}>Assign Subject</Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {teacher.subjects.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Subject</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {teacher.subjects.map((subject) => (
                            <TableRow key={subject.id}>
                              <TableCell className="font-medium">{subject.name}</TableCell>
                              <TableCell>{subject.code}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUnassignSubject(subject.id)}
                                  disabled={isUnassigningSubject === subject.id}
                                >
                                  {isUnassigningSubject === subject.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Unassign"
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground mb-4">No subjects assigned to this teacher yet.</p>
                        <Button variant="outline" asChild>
                          <Link href={`/dashboard/admin/teachers/${teacher.id}/assign-subject`}>Assign Subject</Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="school">
                <Card>
                  <CardHeader>
                    <CardTitle>School Information</CardTitle>
                    <CardDescription>School where this teacher is teaching</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">School Name</h3>
                        <p>{teacher.school.name}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">School Code</h3>
                        <p>{teacher.school.code}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button asChild>
            <Link href={`/dashboard/admin/teachers/${teacher.id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Teacher
            </Link>
          </Button>

          <Button variant="destructive" onClick={handleDeleteClick}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Teacher
          </Button>

          <Button variant="outline" asChild className="sm:ml-auto">
            <Link href="/dashboard/admin/teachers">Back to Teachers</Link>
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Teacher</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this teacher? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="font-medium">{teacher.fullName}</p>
            <p className="text-sm text-muted-foreground">Staff ID: {teacher.staffId}</p>
            {teacher.email && <p className="text-sm text-muted-foreground">{teacher.email}</p>}
          </div>
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
