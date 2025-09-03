// components/teacher-management/teacher-details.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { BookOpen, Calendar, Edit, Eye, EyeOff, Key, Loader2, Mail, MapPin, Phone, RefreshCw, School, Shield, Trash2, User } from "lucide-react"
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
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { deleteTeacher, resetTeacherPassword } from "@/app/actions/teacher-management"
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
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [isUnassigningClass, setIsUnassigningClass] = useState<string | null>(null)
  const [isUnassigningSubject, setIsUnassigningSubject] = useState<string | null>(null)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [newPassword, setNewPassword] = useState("")

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

  // Handle password reset
    const handlePasswordReset = async () => {
      setIsResettingPassword(true)
      try {
        const result = await resetTeacherPassword(teacher.id)
  
        if (result.success && result.data?.newPassword) {
          setNewPassword(result.data.newPassword)
          toast.success("Password Reset", {
            description: "Teacher password has been successfully reset.",
          })
        } else {
          toast.error("Reset Failed", {
            description: result.error || "Failed to reset password. Please try again.",
          })
        }
      } catch (error) {
        console.error("Error resetting password:", error)
        toast.error("Reset Failed", {
          description: "An unexpected error occurred. Please try again.",
        })
      } finally {
        setIsResettingPassword(false)
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
        router.refresh()
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
        router.refresh()
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header with action buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{teacher.fullName}</h2>
            <p className="text-muted-foreground">
              Staff ID: {teacher.staffId} • {teacher.school.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/dashboard/admin/teachers/${teacher.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>

            <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Key className="mr-2 h-4 w-4" />
                  Reset Password
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset Teacher Password</DialogTitle>
                  <DialogDescription>
                    Reset the password for {teacher.fullName}. A new temporary password will be generated.
                  </DialogDescription>
                </DialogHeader>
                
                {newPassword ? (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-muted p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">New Temporary Password:</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(newPassword)}
                        >
                          Copy
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="font-mono text-sm">
                          {showNewPassword ? newPassword : '•'.repeat(10)}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>Please provide this password to the teacher securely.</p>
                      <p>They will be required to change it on their first login.</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-4">
                    <p>Are you sure you want to reset the password for {teacher.fullName}?</p>
                  </div>
                )}
                
                <DialogFooter>
                  {newPassword ? (
                    <Button onClick={() => setIsResetPasswordDialogOpen(false)}>
                      Done
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setIsResetPasswordDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handlePasswordReset}
                        disabled={isResettingPassword}
                      >
                        {isResettingPassword ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Reset Password
                      </Button>
                    </>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="destructive" onClick={handleDeleteClick}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Teacher Information Sidebar */}
          <div className="md:w-1/3 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Teacher Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center mb-4">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <User size={32} />
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Staff ID</span>
                    <span className="font-medium">{teacher.staffId}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Department</span>
                    <span>{teacher.department || "Not specified"}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Qualification</span>
                    <span>{teacher.qualification || "Not specified"}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Gender</span>
                    <span>
                      {teacher.gender === "MALE"
                        ? "Male"
                        : teacher.gender === "FEMALE"
                          ? "Female"
                          : teacher.gender === "OTHER"
                            ? "Other"
                            : "Not specified"}
                    </span>
                  </div>
                  
                  {teacher.dateOfBirth && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Date of Birth</span>
                      <span>{format(new Date(teacher.dateOfBirth), "MMM d, yyyy")}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Joined Date</span>
                    <span>{format(new Date(teacher.createdAt), "MMM d, yyyy")}</span>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-3">Contact Information</h4>
                  <div className="space-y-3">
                    {teacher.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm">{teacher.email}</span>
                      </div>
                    )}

                    {teacher.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm">{teacher.phone}</span>
                      </div>
                    )}

                    {teacher.address && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p>{teacher.address}</p>
                          {(teacher.state || teacher.lga) && (
                            <p className="text-muted-foreground">
                              {teacher.lga && `${teacher.lga}, `}
                              {teacher.state}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Teaching Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{teacher.classes.length}</div>
                    <div className="text-xs text-muted-foreground">Classes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{teacher.subjects.length}</div>
                    <div className="text-xs text-muted-foreground">Subjects</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
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
                  School
                </TabsTrigger>
              </TabsList>

              <TabsContent value="classes">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Assigned Classes</CardTitle>
                      <CardDescription>Classes this teacher is currently handling</CardDescription>
                    </div>
                    <Button variant="outline" asChild>
                      <Link href={`/dashboard/admin/teachers/${teacher.id}/assign-class`}>
                        Assign Class
                      </Link>
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
                        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                          <Calendar className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground mb-4">No classes assigned to this teacher yet.</p>
                        <Button variant="outline" asChild>
                          <Link href={`/dashboard/admin/teachers/${teacher.id}/assign-class`}>
                            Assign Class
                          </Link>
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
                      <CardDescription>Subjects this teacher is currently teaching</CardDescription>
                    </div>
                    <Button variant="outline" asChild>
                      <Link href={`/dashboard/admin/teachers/${teacher.id}/assign-subject`}>
                        Assign Subject
                      </Link>
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
                        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                          <BookOpen className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground mb-4">No subjects assigned to this teacher yet.</p>
                        <Button variant="outline" asChild>
                          <Link href={`/dashboard/admin/teachers/${teacher.id}/assign-subject`}>
                            Assign Subject
                          </Link>
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
                    <CardDescription>School where this teacher is employed</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">School Name</span>
                        <span>{teacher.school.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">School Code</span>
                        <span>{teacher.school.code}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the teacher account
              and remove all associated data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <p className="font-medium">{teacher.fullName}</p>
            <p className="text-sm text-muted-foreground">Staff ID: {teacher.staffId}</p>
            {teacher.email && <p className="text-sm text-muted-foreground">{teacher.email}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}