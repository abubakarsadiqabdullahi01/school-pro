import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { BookOpen, Calendar, CheckCircle, FileText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { StatsCard } from "@/components/dashboard/stats-card"
import { formatDate } from "@/lib/format"
import { PUBLISHED_ONLY, averageScore } from "@/lib/results-visibility"

export default async function StudentDashboardPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "STUDENT") {
    redirect("/dashboard")
  }

  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    include: {
      school: { select: { name: true, code: true } },
      user: { select: { firstName: true, lastName: true } },
      classTerms: {
        orderBy: { createdAt: "desc" },
        include: {
          classTerm: {
            include: {
              class: { select: { id: true, name: true, level: true } },
              term: {
                include: {
                  session: { select: { id: true, name: true } },
                },
              },
              classSubjects: {
                include: {
                  subject: { select: { id: true, name: true, code: true } },
                },
              },
            },
          },
        },
      },
      assessments: {
        // Drafts are staff-only. Without this a student read their exam mark the moment a
        // teacher typed it, before the school released anything. See lib/results-visibility.
        where: PUBLISHED_ONLY,
        orderBy: { updatedAt: "desc" },
        include: {
          subject: { select: { name: true, code: true } },
          term: { select: { id: true, name: true, isCurrent: true } },
        },
      },
      attendances: {
        orderBy: { date: "desc" },
        take: 10,
      },
    },
  })

  if (!student) {
    redirect("/dashboard/access-error")
  }

  const currentEnrollment =
    student.classTerms.find((entry) => entry.classTerm.term.isCurrent) ?? student.classTerms[0]
  const currentSubjects = currentEnrollment?.classTerm.classSubjects ?? []
  const currentAssessments = student.assessments.filter((assessment) => assessment.term.isCurrent)
  const average = averageScore(currentAssessments)
  const attendanceTotal = student.attendances.length
  const presentCount = student.attendances.filter((attendance) => attendance.status === "PRESENT").length
  const attendanceRate = attendanceTotal > 0 ? Math.round((presentCount / attendanceTotal) * 100) : 0


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight">
          Welcome, {student.user.firstName} {student.user.lastName}
        </h2>
        <p className="text-muted-foreground">
          {student.school.name} ({student.school.code}) · {student.admissionNo}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Current Class" value={currentEnrollment?.classTerm.class.name ?? "Not assigned"} icon={<BookOpen className="h-4 w-4 text-muted-foreground" />} />
        <StatsCard title="Subjects" value={String(currentSubjects.length)} icon={<FileText className="h-4 w-4 text-muted-foreground" />} description="Current term" />
        <StatsCard title="Attendance" value={attendanceTotal ? `${attendanceRate}%` : "No records"} icon={<CheckCircle className="h-4 w-4 text-muted-foreground" />} />
        <StatsCard title="Average Score" value={average === null ? "Not released" : `${average}%`} icon={<Calendar className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Current Subjects</CardTitle>
            <CardDescription>Subjects attached to your current class and term.</CardDescription>
          </CardHeader>
          <CardContent>
            {currentSubjects.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {currentSubjects.map(({ subject }) => (
                  <div key={subject.id} className="rounded-md border p-3">
                    <div className="font-medium">{subject.name}</div>
                    <div className="text-sm text-muted-foreground">{subject.code}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No subjects have been assigned yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance Snapshot</CardTitle>
            <CardDescription>Latest attendance records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={attendanceRate} className="h-2" />
            <div className="space-y-3">
              {student.attendances.length > 0 ? (
                student.attendances.slice(0, 5).map((attendance) => (
                  <div key={attendance.id} className="flex items-center justify-between text-sm">
                    <span>{formatDate(attendance.date)}</span>
                    <Badge variant={attendance.status === "PRESENT" ? "default" : "secondary"}>{attendance.status}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No attendance records yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Results</CardTitle>
          <CardDescription>Scores recorded for your current term.</CardDescription>
        </CardHeader>
        <CardContent>
          {currentAssessments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">Subject</th>
                    <th className="py-2 font-medium">CA Total</th>
                    <th className="py-2 font-medium">Exam</th>
                    <th className="py-2 font-medium">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {currentAssessments.map((assessment) => (
                    <tr key={assessment.id} className="border-b last:border-0">
                      <td className="py-2">{assessment.subject.name}</td>
                      <td className="py-2">{(assessment.ca1 ?? 0) + (assessment.ca2 ?? 0) + (assessment.ca3 ?? 0)}</td>
                      <td className="py-2">{assessment.exam ?? "-"}</td>
                      <td className="py-2">{assessment.grade ?? "Pending"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Results for this term have not been released yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
