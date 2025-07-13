"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  Edit,
  Phone,
  MapPin,
  Calendar,
  User,
  GraduationCap,
  FileText,
  CreditCard,
  MoreHorizontal,
  UserCheck,
  UserX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getStudent, toggleStudentStatus } from "@/app/actions/student-management"
import { toast } from "sonner"
import { FormSkeleton } from "@/components/ui/loading-skeleton"

interface StudentDetailsProps {
  studentId: string
}

interface StudentData {
  id: string
  userId: string
  admissionNo: string
  firstName: string
  lastName: string
  fullName: string
  dateOfBirth: string
  gender: string
  state: string
  lga: string
  address: string
  phone: string
  year: number | null
  isActive: boolean
  currentClass: {
    id: string
    name: string
    termId: string
    termName: string
    sessionName: string
  } | null
  parents: Array<{
    id: string
    name: string
    relationship: string
    phone: string
  }>
  academicHistory: Array<{
    id: string
    className: string
    termName: string
    sessionName: string
    startDate: Date
    endDate: Date
  }>
  assessments: Array<{
    id: string
    subject: string
    ca1: number | null
    ca2: number | null
    ca3: number | null
    exam: number | null
    totalScore: string
    term: string
    session: string
    isAbsent: boolean
    isExempt: boolean
    isPublished: boolean
    createdAt: string
  }>
  payments: Array<{
    id: string
    amount: number
    status: string
    paymentDate: string
    receiptNo: string | null
  }>
  createdAt: Date
}

export default function StudentDetails({ studentId }: StudentDetailsProps) {
  const [student, setStudent] = useState<StudentData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isToggling, setIsToggling] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const fetchStudent = async () => {
      setIsLoading(true)
      try {
        const result = await getStudent(studentId)
        if (result.success && result.data) {
          setStudent(result.data as StudentData)
        } else {
          toast.error("Error", {
            description: result.error || "Failed to fetch student details",
          })
          router.push("/dashboard/admin/students")
        }
      } catch (error) {
        console.error("Error fetching student:", error)
        toast.error("Error", {
          description: "Failed to fetch student details. Please try again.",
        })
        router.push("/dashboard/admin/students")
      } finally {
        setIsLoading(false)
      }
    }

    fetchStudent()
  }, [studentId, router])

  const handleToggleStatus = async () => {
    if (!student) return

    setIsToggling(true)
    try {
      const result = await toggleStudentStatus(studentId)
      if (result.success) {
        setStudent((prev) => (prev ? { ...prev, isActive: result.data.isActive } : null))
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
      setIsToggling(false)
    }
  }

  if (isLoading) {
    return <FormSkeleton />
  }

  if (!student) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Student not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{student.fullName}</h1>
            <p className="text-muted-foreground">
              Admission No: {student.admissionNo} • {student.isActive ? "Active" : "Inactive"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href={`/dashboard/admin/students/${student.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Student
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/admin/students/${student.id}/academic-records`}>
                  <FileText className="h-4 w-4 mr-2" />
                  Academic Records
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleToggleStatus}
                disabled={isToggling}
                className={student.isActive ? "text-destructive" : "text-green-600"}
              >
                {student.isActive ? (
                  <>
                    <UserX className="h-4 w-4 mr-2" />
                    Deactivate Student
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Activate Student
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">First Name</label>
                  <p className="text-sm">{student.firstName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Name</label>
                  <p className="text-sm">{student.lastName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                  <p className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {student.dateOfBirth || "Not specified"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Gender</label>
                  <p className="text-sm">{student.gender}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p className="text-sm flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {student.phone || "Not specified"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">State</label>
                  <p className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {student.state}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">LGA</label>
                  <p className="text-sm">{student.lga}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Address</label>
                  <p className="text-sm">{student.address}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Academic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Academic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Current Class</label>
                  <p className="text-sm">{student.currentClass?.name || "Not assigned"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Current Term</label>
                  <p className="text-sm">{student.currentClass?.termName || "Not assigned"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Session</label>
                  <p className="text-sm">{student.currentClass?.sessionName || "Not assigned"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Admission Year</label>
                  <p className="text-sm">{student.year || "Not specified"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Assessments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Assessments
              </CardTitle>
              <CardDescription>Latest 5 assessment records</CardDescription>
            </CardHeader>
            <CardContent>
              {student.assessments.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>CA1</TableHead>
                        <TableHead>CA2</TableHead>
                        <TableHead>CA3</TableHead>
                        <TableHead>Exam</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Term</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {student.assessments.slice(0, 5).map((assessment) => (
                        <TableRow key={assessment.id}>
                          <TableCell className="font-medium">{assessment.subject}</TableCell>
                          <TableCell>{assessment.ca1 || "-"}</TableCell>
                          <TableCell>{assessment.ca2 || "-"}</TableCell>
                          <TableCell>{assessment.ca3 || "-"}</TableCell>
                          <TableCell>{assessment.exam || "-"}</TableCell>
                          <TableCell className="font-medium">{assessment.totalScore}</TableCell>
                          <TableCell>{assessment.term}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                assessment.isAbsent
                                  ? "destructive"
                                  : assessment.isExempt
                                    ? "secondary"
                                    : !assessment.isPublished
                                      ? "outline"
                                      : "default"
                              }
                            >
                              {assessment.isAbsent
                                ? "Absent"
                                : assessment.isExempt
                                  ? "Exempt"
                                  : !assessment.isPublished
                                    ? "Unpublished"
                                    : "Published"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No assessments found</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={student.isActive ? "default" : "destructive"} className="mb-4">
                {student.isActive ? "Active" : "Inactive"}
              </Badge>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Registered:</span>
                  <p>{new Date(student.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Admission No:</span>
                  <p className="font-mono">{student.admissionNo}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parents/Guardians */}
          <Card>
            <CardHeader>
              <CardTitle>Parents/Guardians</CardTitle>
            </CardHeader>
            <CardContent>
              {student.parents.length > 0 ? (
                <div className="space-y-3">
                  {student.parents.map((parent) => (
                    <div key={parent.id} className="p-3 border rounded-lg">
                      <p className="font-medium">{parent.name}</p>
                      <p className="text-sm text-muted-foreground">{parent.relationship}</p>
                      {parent.phone && (
                        <p className="text-sm flex items-center gap-1 mt-1">
                          <Phone className="h-3 w-3" />
                          {parent.phone}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No parents/guardians assigned</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Recent Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {student.payments.length > 0 ? (
                <div className="space-y-3">
                  {student.payments.slice(0, 3).map((payment) => (
                    <div key={payment.id} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">₦{payment.amount.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">{payment.paymentDate}</p>
                        </div>
                        <Badge
                          variant={
                            payment.status === "COMPLETED"
                              ? "default"
                              : payment.status === "PENDING"
                                ? "secondary"
                                : payment.status === "FAILED"
                                  ? "destructive"
                                  : "outline"
                          }
                        >
                          {payment.status}
                        </Badge>
                      </div>
                      {payment.receiptNo && (
                        <p className="text-xs text-muted-foreground mt-1">Receipt: {payment.receiptNo}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No payments found</p>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start bg-transparent">
                <Link href={`/dashboard/admin/students/${student.id}/edit`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Student
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start bg-transparent">
                <Link href={`/dashboard/admin/students/${student.id}/academic-records`}>
                  <FileText className="h-4 w-4 mr-2" />
                  Academic Records
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}
