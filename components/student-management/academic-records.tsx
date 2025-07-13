"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, BookOpen, Calendar, FileText, TrendingUp, Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getStudent } from "@/app/actions/student-management"
import { toast } from "sonner"
import { FormSkeleton } from "@/components/ui/loading-skeleton"

interface AcademicRecordsProps {
  studentId: string
}

interface StudentData {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  fullName: string
  currentClass: {
    id: string
    name: string
    termName: string
    sessionName: string
  } | null
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
}

export default function AcademicRecords({ studentId }: AcademicRecordsProps) {
  const [student, setStudent] = useState<StudentData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
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
            description: result.error || "Failed to fetch student academic records",
          })
          router.push("/dashboard/admin/students")
        }
      } catch (error) {
        console.error("Error fetching student:", error)
        toast.error("Error", {
          description: "Failed to fetch academic records. Please try again.",
        })
        router.push("/dashboard/admin/students")
      } finally {
        setIsLoading(false)
      }
    }

    fetchStudent()
  }, [studentId, router])

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

  // Group assessments by term and session
  const groupedAssessments = student.assessments.reduce(
    (acc, assessment) => {
      const key = `${assessment.session} - ${assessment.term}`
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(assessment)
      return acc
    },
    {} as Record<string, typeof student.assessments>,
  )

  // Calculate statistics
  const publishedAssessments = student.assessments.filter((a) => a.isPublished && !a.isAbsent && !a.isExempt)
  const totalAssessments = publishedAssessments.length
  const averageScore =
    totalAssessments > 0
      ? publishedAssessments.reduce((sum, a) => sum + Number.parseFloat(a.totalScore), 0) / totalAssessments
      : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Academic Records</h1>
          <p className="text-muted-foreground">
            {student.fullName} • {student.admissionNo}
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Class</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{student.currentClass?.name || "N/A"}</div>
            <p className="text-xs text-muted-foreground">
              {student.currentClass?.sessionName} - {student.currentClass?.termName}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assessments</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{student.assessments.length}</div>
            <p className="text-xs text-muted-foreground">{publishedAssessments.length} published</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averageScore.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">From {totalAssessments} assessments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Academic Terms</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{student.academicHistory.length}</div>
            <p className="text-xs text-muted-foreground">Terms completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="assessments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="history">Academic History</TabsTrigger>
          <TabsTrigger value="performance">Performance Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="assessments" className="space-y-4">
          {Object.keys(groupedAssessments).length > 0 ? (
            Object.entries(groupedAssessments).map(([termSession, assessments]) => (
              <Card key={termSession}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    {termSession}
                  </CardTitle>
                  <CardDescription>
                    {assessments.length} assessment{assessments.length !== 1 ? "s" : ""} recorded
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-center">CA1</TableHead>
                          <TableHead className="text-center">CA2</TableHead>
                          <TableHead className="text-center">CA3</TableHead>
                          <TableHead className="text-center">Exam</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assessments.map((assessment) => (
                          <TableRow key={assessment.id}>
                            <TableCell className="font-medium">{assessment.subject}</TableCell>
                            <TableCell className="text-center">{assessment.ca1 || "-"}</TableCell>
                            <TableCell className="text-center">{assessment.ca2 || "-"}</TableCell>
                            <TableCell className="text-center">{assessment.ca3 || "-"}</TableCell>
                            <TableCell className="text-center">{assessment.exam || "-"}</TableCell>
                            <TableCell className="text-center font-medium">{assessment.totalScore}</TableCell>
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
                            <TableCell>{assessment.createdAt}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <div className="text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No assessments found</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Academic History
              </CardTitle>
              <CardDescription>Complete academic journey and class assignments</CardDescription>
            </CardHeader>
            <CardContent>
              {student.academicHistory.length > 0 ? (
                <div className="space-y-4">
                  {student.academicHistory.map((record, index) => (
                    <div key={record.id} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">{index + 1}</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{record.className}</h4>
                        <p className="text-sm text-muted-foreground">
                          {record.sessionName} - {record.termName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(record.startDate).toLocaleDateString()} -{" "}
                          {new Date(record.endDate).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="outline">{record.termName}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No academic history found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Performance Analysis
              </CardTitle>
              <CardDescription>Statistical overview of academic performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Assessment Summary</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Assessments:</span>
                      <span className="text-sm font-medium">{student.assessments.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Published:</span>
                      <span className="text-sm font-medium">{publishedAssessments.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Absent:</span>
                      <span className="text-sm font-medium">
                        {student.assessments.filter((a) => a.isAbsent).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Exempt:</span>
                      <span className="text-sm font-medium">
                        {student.assessments.filter((a) => a.isExempt).length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Score Statistics</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Average Score:</span>
                      <span className="text-sm font-medium">{averageScore.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Highest Score:</span>
                      <span className="text-sm font-medium">
                        {publishedAssessments.length > 0
                          ? Math.max(...publishedAssessments.map((a) => Number.parseFloat(a.totalScore))).toFixed(1) +
                            "%"
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Lowest Score:</span>
                      <span className="text-sm font-medium">
                        {publishedAssessments.length > 0
                          ? Math.min(...publishedAssessments.map((a) => Number.parseFloat(a.totalScore))).toFixed(1) +
                            "%"
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {publishedAssessments.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-4">Subject Performance</h4>
                  <div className="space-y-2">
                    {Object.entries(
                      publishedAssessments.reduce(
                        (acc, assessment) => {
                          if (!acc[assessment.subject]) {
                            acc[assessment.subject] = []
                          }
                          acc[assessment.subject].push(Number.parseFloat(assessment.totalScore))
                          return acc
                        },
                        {} as Record<string, number[]>,
                      ),
                    ).map(([subject, scores]) => {
                      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length
                      return (
                        <div key={subject} className="flex justify-between items-center p-2 border rounded">
                          <span className="text-sm font-medium">{subject}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {scores.length} assessment{scores.length !== 1 ? "s" : ""}
                            </span>
                            <Badge variant="outline">{average.toFixed(1)}%</Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
