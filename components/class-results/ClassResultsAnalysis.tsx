"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

interface ClassResultsAnalysisProps {
  results: Array<{
    studentId: string
    studentName: string
    admissionNo: string
    gender: string
    subjects: Record<string, { score: number | null; grade: string | null }>
    totalScore: number
    averageScore: number
    grade: string
    position: number
  }>
  subjects: Array<{
    id: string
    name: string
    code: string
  }>
  className: string
  termName: string
  sessionName: string
  summaryStats: any
}

export function ClassResultsAnalysis({
  results,
  subjects,
  className,
  termName,
  sessionName,
  summaryStats,
}: ClassResultsAnalysisProps) {
  // Calculate gender performance comparison
  const genderAnalysis = useMemo(() => {
    const maleStudents = results.filter((r) => r.gender === "MALE")
    const femaleStudents = results.filter((r) => r.gender === "FEMALE")

    const maleAvg =
      maleStudents.length > 0 ? maleStudents.reduce((sum, r) => sum + r.averageScore, 0) / maleStudents.length : 0
    const femaleAvg =
      femaleStudents.length > 0 ? femaleStudents.reduce((sum, r) => sum + r.averageScore, 0) / femaleStudents.length : 0

    const malePassCount = maleStudents.filter((r) => r.averageScore >= 40).length
    const femalePassCount = femaleStudents.filter((r) => r.averageScore >= 40).length

    const malePassRate = maleStudents.length > 0 ? (malePassCount / maleStudents.length) * 100 : 0
    const femalePassRate = femaleStudents.length > 0 ? (femalePassCount / femaleStudents.length) * 100 : 0

    return {
      male: {
        count: maleStudents.length,
        average: maleAvg,
        passRate: malePassRate,
        topPosition: maleStudents.length > 0 ? Math.min(...maleStudents.map((s) => s.position)) : 0,
      },
      female: {
        count: femaleStudents.length,
        average: femaleAvg,
        passRate: femalePassRate,
        topPosition: femaleStudents.length > 0 ? Math.min(...femaleStudents.map((s) => s.position)) : 0,
      },
    }
  }, [results])

  // Calculate subject performance details
  const subjectAnalysis = useMemo(() => {
    return subjects.map((subject) => {
      const scores = results
        .map((r) => r.subjects[subject.id]?.score)
        .filter((score): score is number => score !== null && score !== undefined)

      const grades = results
        .map((r) => r.subjects[subject.id]?.grade)
        .filter((grade): grade is string => grade !== null && grade !== undefined)

      const gradeDistribution = grades.reduce(
        (acc, grade) => {
          acc[grade] = (acc[grade] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      return {
        ...subject,
        totalStudents: scores.length,
        average: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        highest: scores.length > 0 ? Math.max(...scores) : 0,
        lowest: scores.length > 0 ? Math.min(...scores) : 0,
        passCount: scores.filter((s) => s >= 40).length,
        passRate: scores.length > 0 ? (scores.filter((s) => s >= 40).length / scores.length) * 100 : 0,
        gradeDistribution,
      }
    })
  }, [results, subjects])

  const getGradeColor = (grade: string) => {
    const firstChar = grade.charAt(0).toUpperCase()
    switch (firstChar) {
      case "A":
        return "bg-green-100 text-green-800"
      case "B":
        return "bg-blue-100 text-blue-800"
      case "C":
        return "bg-yellow-100 text-yellow-800"
      case "D":
      case "E":
        return "bg-orange-100 text-orange-800"
      case "F":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="subject-analysis" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="subject-analysis">Subject Analysis</TabsTrigger>
          <TabsTrigger value="gender-analysis">Gender Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="subject-analysis" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {subjectAnalysis.map((subject) => (
              <Card key={subject.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    {subject.name} ({subject.code})
                  </CardTitle>
                  <CardDescription>Performance analysis for {subject.totalStudents} students</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Average Score</p>
                      <p className="text-2xl font-bold">{subject.average.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Pass Rate</p>
                      <p className="text-2xl font-bold">{subject.passRate.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Highest Score</p>
                      <p className="text-xl font-bold">{subject.highest.toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Lowest Score</p>
                      <p className="text-xl font-bold">{subject.lowest.toFixed(0)}%</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Performance Distribution</p>
                    <Progress value={subject.passRate} className="h-2 mb-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Failed: {subject.totalStudents - subject.passCount}</span>
                      <span>Passed: {subject.passCount}</span>
                    </div>
                  </div>

                  {Object.keys(subject.gradeDistribution).length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">Grade Distribution</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(subject.gradeDistribution)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([grade, count]) => (
                            <Badge key={grade} className={`text-xs ${getGradeColor(grade)}`}>
                              {grade}: {count}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="gender-analysis" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Male Students Performance</CardTitle>
                <CardDescription>Analysis of {genderAnalysis.male.count} male students</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Count</p>
                    <p className="text-2xl font-bold">{genderAnalysis.male.count}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Average</p>
                    <p className="text-2xl font-bold">{genderAnalysis.male.average.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Pass Rate</p>
                    <p className="text-2xl font-bold">{genderAnalysis.male.passRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Top Position</p>
                    <p className="text-2xl font-bold">
                      {genderAnalysis.male.topPosition > 0 ? `${genderAnalysis.male.topPosition}` : "N/A"}
                    </p>
                  </div>
                </div>
                <Progress value={genderAnalysis.male.passRate} className="h-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Female Students Performance</CardTitle>
                <CardDescription>Analysis of {genderAnalysis.female.count} female students</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Count</p>
                    <p className="text-2xl font-bold">{genderAnalysis.female.count}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Average</p>
                    <p className="text-2xl font-bold">{genderAnalysis.female.average.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Pass Rate</p>
                    <p className="text-2xl font-bold">{genderAnalysis.female.passRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Top Position</p>
                    <p className="text-2xl font-bold">
                      {genderAnalysis.female.topPosition > 0 ? `${genderAnalysis.female.topPosition}` : "N/A"}
                    </p>
                  </div>
                </div>
                <Progress value={genderAnalysis.female.passRate} className="h-2" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Gender Performance Comparison</CardTitle>
              <CardDescription>Comparative analysis between male and female students</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Metric</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-600">Male</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-pink-600">Female</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="font-medium">Average Score</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">{genderAnalysis.male.average.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-pink-600">{genderAnalysis.female.average.toFixed(1)}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="font-medium">Pass Rate</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">{genderAnalysis.male.passRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-pink-600">{genderAnalysis.female.passRate.toFixed(1)}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="font-medium">Best Position</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">
                      {genderAnalysis.male.topPosition > 0 ? `${genderAnalysis.male.topPosition}` : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-pink-600">
                      {genderAnalysis.female.topPosition > 0 ? `${genderAnalysis.female.topPosition}` : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
