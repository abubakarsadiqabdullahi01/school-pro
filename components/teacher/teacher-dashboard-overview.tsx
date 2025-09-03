"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, BookOpen, GraduationCap, Calendar } from "lucide-react"
import Link from "next/link"

interface TeacherDashboardOverviewProps {
  teacher: any
  currentTerm: any
  assignedClasses: any[]
  teacherSubjects: any[]
}

export function TeacherDashboardOverview({
  teacher,
  currentTerm,
  assignedClasses,
  teacherSubjects,
}: TeacherDashboardOverviewProps) {
  const totalStudents = assignedClasses.reduce(
    (total, classAssignment) => total + classAssignment.classTerm.students.length,
    0,
  )

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned Classes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignedClasses.length}</div>
            <p className="text-xs text-muted-foreground">Form teacher responsibilities</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <p className="text-xs text-muted-foreground">Under your supervision</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Teaching Subjects</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teacherSubjects.length}</div>
            <p className="text-xs text-muted-foreground">Subjects you teach</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Term</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentTerm ? currentTerm.name : "None"}</div>
            <p className="text-xs text-muted-foreground">{currentTerm ? currentTerm.session.name : "No active term"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My Classes</CardTitle>
            <CardDescription>Manage your assigned classes and students</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {assignedClasses.length > 0 ? (
              <div className="space-y-2">
                {assignedClasses.slice(0, 3).map((classAssignment) => (
                  <div key={classAssignment.id} className="flex items-center justify-between p-2 border rounded-lg">
                    <div>
                      <p className="font-medium">{classAssignment.classTerm.class.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {classAssignment.classTerm.students.length} students
                      </p>
                    </div>
                    <Badge variant="secondary">{classAssignment.classTerm.class.level}</Badge>
                  </div>
                ))}
                {assignedClasses.length > 3 && (
                  <p className="text-sm text-muted-foreground">+{assignedClasses.length - 3} more classes</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No classes assigned</p>
            )}
            <Button asChild className="w-full">
              <Link href="/dashboard/teacher/my-classes">View All Classes</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Teaching Subjects</CardTitle>
            <CardDescription>Subjects you are assigned to teach</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {teacherSubjects.length > 0 ? (
              <div className="space-y-2">
                {teacherSubjects.slice(0, 4).map((teacherSubject) => (
                  <div key={teacherSubject.id} className="flex items-center justify-between p-2 border rounded-lg">
                    <div>
                      <p className="font-medium">{teacherSubject.subject.name}</p>
                      <p className="text-sm text-muted-foreground">Code: {teacherSubject.subject.code}</p>
                    </div>
                  </div>
                ))}
                {teacherSubjects.length > 4 && (
                  <p className="text-sm text-muted-foreground">+{teacherSubjects.length - 4} more subjects</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No subjects assigned</p>
            )}
            <Button asChild className="w-full">
              <Link href="/dashboard/teacher/subjects">View All Subjects</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Access Buttons */}
      <div className="grid gap-4 md:grid-cols-3">
        <Button asChild size="lg" className="h-20">
          <Link href="/dashboard/teacher/compiler" className="flex flex-col items-center gap-2">
            <BookOpen className="h-6 w-6" />
            <span>Manage Assessments</span>
          </Link>
        </Button>

        <Button asChild size="lg" variant="outline" className="h-20 bg-transparent">
          <Link href="/dashboard/teacher/attendance" className="flex flex-col items-center gap-2">
            <Users className="h-6 w-6" />
            <span>Mark Attendance</span>
          </Link>
        </Button>

        <Button asChild size="lg" variant="outline" className="h-20 bg-transparent">
          <Link href="/dashboard/teacher/my-classes" className="flex flex-col items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            <span>View Students</span>
          </Link>
        </Button>
      </div>
    </div>
  )
}
