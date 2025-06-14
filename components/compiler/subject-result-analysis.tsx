"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, Download, FileCheck, FileText, Loader2, MessageSquare, Send, ThumbsUp } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getAssessmentsForSubject, approveSubjectResults, addSubjectResultComment } from "@/app/actions/compiler"

interface SubjectResultAnalysisProps {
  classTermId: string
  subjectId: string
  subjectName: string
  subjectCode: string
  className: string
  termName: string
  sessionName: string
  teacherName: string | null
  schoolName: string
  schoolCode: string
  onGenerateReport: () => void
}

export function SubjectResultAnalysis({
  classTermId,
  subjectId,
  subjectName,
  subjectCode,
  className,
  termName,
  sessionName,
  teacherName,
  schoolName,
  schoolCode,
  onGenerateReport,
}: SubjectResultAnalysisProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [comment, setComment] = useState("")
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)

  // Fetch assessments for the selected subject
  const {
    data: assessments,
    isLoading: isLoadingAssessments,
    refetch: refetchAssessments,
  } = useQuery({
    queryKey: ["assessments", classTermId, subjectId],
    queryFn: async () => {
      if (!classTermId || !subjectId) return []
      const result = await getAssessmentsForSubject(classTermId, subjectId)
      return result.success ? result.data : []
    },
    enabled: !!classTermId && !!subjectId,
  })

  // Calculate statistics
  const stats = useMemo(() => {
    if (!assessments || assessments.length === 0) {
      return {
        totalStudents: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passRate: 0,
        gradeDistribution: {
          A: 0,
          B: 0,
          C: 0,
          D: 0,
          E: 0,
          F: 0,
        },
        caAverage: 0,
        examAverage: 0,
        isApproved: false,
        comments: [],
      }
    }

    let totalScore = 0
    let highestScore = 0
    let lowestScore = 100
    let passCount = 0
    let totalCA = 0
    let totalExam = 0
    const gradeDistribution = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      F: 0,
    }

    assessments.forEach((assessment) => {
      const score = assessment.totalScore || 0

      // Total score stats
      totalScore += score
      highestScore = Math.max(highestScore, score)
      lowestScore = Math.min(lowestScore, score)

      // Pass/fail stats
      if (score >= 40) passCount++

      // Grade distribution
      if (score >= 70) gradeDistribution.A++
      else if (score >= 60) gradeDistribution.B++
      else if (score >= 50) gradeDistribution.C++
      else if (score >= 45) gradeDistribution.D++
      else if (score >= 40) gradeDistribution.E++
      else gradeDistribution.F++

      // CA and Exam averages
      totalCA += assessment.caScore || 0
      totalExam += assessment.examScore || 0
    })

    const totalStudents = assessments.length
    const averageScore = totalStudents > 0 ? totalScore / totalStudents : 0
    const passRate = totalStudents > 0 ? (passCount / totalStudents) * 100 : 0
    const caAverage = totalStudents > 0 ? totalCA / totalStudents : 0
    const examAverage = totalStudents > 0 ? totalExam / totalStudents : 0

    // Check if results are approved
    const isApproved = assessments.some((a) => a.isApproved)

    // Get comments
    const comments = assessments.filter((a) => a.comments && a.comments.length > 0).flatMap((a) => a.comments)

    return {
      totalStudents,
      averageScore: Number.parseFloat(averageScore.toFixed(2)),
      highestScore,
      lowestScore: lowestScore === 100 ? 0 : lowestScore,
      passRate: Number.parseFloat(passRate.toFixed(2)),
      gradeDistribution,
      caAverage: Number.parseFloat(caAverage.toFixed(2)),
      examAverage: Number.parseFloat(examAverage.toFixed(2)),
      isApproved,
      comments,
    }
  }, [assessments])

  // Handle approve results
  const handleApproveResults = async () => {
    if (!classTermId || !subjectId) {
      toast.error("Missing required information")
      return
    }

    setIsApproving(true)

    try {
      const result = await approveSubjectResults(classTermId, subjectId)

      if (result.success) {
        toast.success("Results approved successfully")
        refetchAssessments()
      } else {
        throw new Error(result.error || "Failed to approve results")
      }
    } catch (error) {
      console.error("Error approving results:", error)
      toast.error("Failed to approve results", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsApproving(false)
    }
  }

  // Handle add comment
  const handleAddComment = async () => {
    if (!classTermId || !subjectId || !comment.trim()) {
      toast.error("Please enter a comment")
      return
    }

    setIsSubmittingComment(true)

    try {
      const result = await addSubjectResultComment(classTermId, subjectId, comment)

      if (result.success) {
        toast.success("Comment added successfully")
        setComment("")
        refetchAssessments()
      } else {
        throw new Error(result.error || "Failed to add comment")
      }
    } catch (error) {
      console.error("Error adding comment:", error)
      toast.error("Failed to add comment", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsSubmittingComment(false)
    }
  }

  if (isLoadingAssessments) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!assessments || assessments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No assessment data available</h3>
        <p className="text-muted-foreground mt-2">
          Please enter assessment scores for students before viewing analysis.
        </p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageScore}/100</div>
            <Progress value={stats.averageScore} className="h-2 mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.passRate}%</div>
            <Progress
              value={stats.passRate}
              className={`h-2 mt-2 ${stats.passRate < 50 ? "bg-red-100" : "bg-green-100"}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Highest Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.highestScore}/100</div>
            <div className="text-xs text-muted-foreground mt-2">
              {stats.highestScore >= 70 ? "Excellent Performance" : "Good Performance"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lowest Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lowestScore}/100</div>
            <div className="text-xs text-muted-foreground mt-2">
              {stats.lowestScore < 40 ? "Needs Improvement" : "Satisfactory"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="grades">Grade Distribution</TabsTrigger>
          <TabsTrigger value="approval">Approval & Comments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Overview</CardTitle>
              <CardDescription>
                Summary of student performance in {subjectName} ({subjectCode})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">CA vs Exam Performance</div>
                  <div className="flex items-center justify-between">
                    <span>CA Average (30%)</span>
                    <span className="font-medium">{stats.caAverage}/30</span>
                  </div>
                  <Progress value={(stats.caAverage / 30) * 100} className="h-2" />

                  <div className="flex items-center justify-between mt-4">
                    <span>Exam Average (70%)</span>
                    <span className="font-medium">{stats.examAverage}/70</span>
                  </div>
                  <Progress value={(stats.examAverage / 70) * 100} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Class Statistics</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Total Students</span>
                      <span className="font-medium">{stats.totalStudents}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Students Passed</span>
                      <span className="font-medium">
                        {Math.round((stats.passRate / 100) * stats.totalStudents)} ({stats.passRate}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Students Failed</span>
                      <span className="font-medium">
                        {stats.totalStudents - Math.round((stats.passRate / 100) * stats.totalStudents)} (
                        {(100 - stats.passRate).toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={onGenerateReport}>
                <FileText className="mr-2 h-4 w-4" />
                Generate Report
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Download className="mr-2 h-4 w-4" />
                Export Analysis
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="grades" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Grade Distribution</CardTitle>
              <CardDescription>
                Breakdown of grades for {subjectName} ({subjectCode})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Badge className="bg-green-100 text-green-800 mr-2">A</Badge>
                    Excellent (70-100%)
                  </span>
                  <span className="font-medium">{stats.gradeDistribution.A} students</span>
                </div>
                <Progress
                  value={(stats.gradeDistribution.A / stats.totalStudents) * 100}
                  className="h-2 bg-green-100"
                />

                <div className="flex items-center justify-between mt-4">
                  <span className="flex items-center">
                    <Badge className="bg-blue-100 text-blue-800 mr-2">B</Badge>
                    Very Good (60-69%)
                  </span>
                  <span className="font-medium">{stats.gradeDistribution.B} students</span>
                </div>
                <Progress value={(stats.gradeDistribution.B / stats.totalStudents) * 100} className="h-2 bg-blue-100" />

                <div className="flex items-center justify-between mt-4">
                  <span className="flex items-center">
                    <Badge className="bg-yellow-100 text-yellow-800 mr-2">C</Badge>
                    Good (50-59%)
                  </span>
                  <span className="font-medium">{stats.gradeDistribution.C} students</span>
                </div>
                <Progress
                  value={(stats.gradeDistribution.C / stats.totalStudents) * 100}
                  className="h-2 bg-yellow-100"
                />

                <div className="flex items-center justify-between mt-4">
                  <span className="flex items-center">
                    <Badge className="bg-orange-100 text-orange-800 mr-2">D</Badge>
                    Fair (45-49%)
                  </span>
                  <span className="font-medium">{stats.gradeDistribution.D} students</span>
                </div>
                <Progress
                  value={(stats.gradeDistribution.D / stats.totalStudents) * 100}
                  className="h-2 bg-orange-100"
                />

                <div className="flex items-center justify-between mt-4">
                  <span className="flex items-center">
                    <Badge className="bg-orange-100 text-orange-800 mr-2">E</Badge>
                    Pass (40-44%)
                  </span>
                  <span className="font-medium">{stats.gradeDistribution.E} students</span>
                </div>
                <Progress
                  value={(stats.gradeDistribution.E / stats.totalStudents) * 100}
                  className="h-2 bg-orange-100"
                />

                <div className="flex items-center justify-between mt-4">
                  <span className="flex items-center">
                    <Badge className="bg-red-100 text-red-800 mr-2">F</Badge>
                    Fail (0-39%)
                  </span>
                  <span className="font-medium">{stats.gradeDistribution.F} students</span>
                </div>
                <Progress value={(stats.gradeDistribution.F / stats.totalStudents) * 100} className="h-2 bg-red-100" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approval" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Result Approval</CardTitle>
              <CardDescription>
                Approve results and add comments for {subjectName} ({subjectCode})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div className="flex items-center">
                  {stats.isApproved ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
                  ) : (
                    <FileCheck className="h-5 w-5 text-amber-500 mr-2" />
                  )}
                  <div>
                    <div className="font-medium">
                      {stats.isApproved ? "Results Approved" : "Results Pending Approval"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {stats.isApproved
                        ? "These results have been approved and are ready for report generation."
                        : "These results need to be approved before generating reports."}
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleApproveResults}
                  disabled={isApproving || stats.isApproved}
                  variant={stats.isApproved ? "outline" : "default"}
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Approving...
                    </>
                  ) : stats.isApproved ? (
                    <>
                      <ThumbsUp className="mr-2 h-4 w-4" />
                      Approved
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve Results
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Comments</h3>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Add Comment
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Comment</DialogTitle>
                        <DialogDescription>
                          Add a comment about the class performance in {subjectName}.
                        </DialogDescription>
                      </DialogHeader>
                      <Textarea
                        placeholder="Enter your comment here..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="min-h-[100px]"
                      />
                      <DialogFooter>
                        <Button onClick={handleAddComment} disabled={isSubmittingComment || !comment.trim()}>
                          {isSubmittingComment ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-4 w-4" />
                              Submit Comment
                            </>
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                {stats.comments && stats.comments.length > 0 ? (
                  <div className="space-y-4">
                    {stats.comments.map((comment, index) => (
                      <div key={index} className="p-4 border rounded-md bg-muted/50">
                        <p className="text-sm">{comment}</p>
                        <div className="text-xs text-muted-foreground mt-2">
                          Added on {new Date().toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center border rounded-md bg-muted/50">
                    <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No comments yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
