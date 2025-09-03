"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Users, BookOpen, Eye, Calendar } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface TeacherClassesViewProps {
  assignedClasses: any[]
  currentTerm: any
  teacherId: string
}

export function TeacherClassesView({ assignedClasses, currentTerm, teacherId }: TeacherClassesViewProps) {
  const [selectedClass, setSelectedClass] = useState<any>(null)

  return (
    <div className="space-y-6">
      {assignedClasses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Classes Assigned</h3>
            <p className="text-muted-foreground text-center">
              You are not currently assigned as a form teacher to any classes for this term.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {assignedClasses.map((classAssignment) => (
            <Card key={classAssignment.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{classAssignment.classTerm.class.name}</CardTitle>
                  <Badge variant="secondary">{classAssignment.classTerm.class.level}</Badge>
                </div>
                <CardDescription>Form Teacher - {classAssignment.classTerm.term.name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{classAssignment.classTerm.students.length} students</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <BookOpen className="h-4 w-4" />
                    <span>{classAssignment.classTerm.classSubjects.length} subjects</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Recent Students</h4>
                  <div className="flex -space-x-2">
                    {classAssignment.classTerm.students.slice(0, 5).map((studentClassTerm: any) => (
                      <Avatar key={studentClassTerm.id} className="h-8 w-8 border-2 border-background">
                        {studentClassTerm.student.user.avatarUrl ? (
                          <AvatarImage src={studentClassTerm.student.user.avatarUrl} />
                        ) : (
                          <AvatarFallback className="text-xs">
                            {studentClassTerm.student.user.firstName?.[0]}
                            {studentClassTerm.student.user.lastName?.[0]}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    ))}
                    {classAssignment.classTerm.students.length > 5 && (
                      <div className="h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs font-medium">
                        +{classAssignment.classTerm.students.length - 5}
                      </div>
                    )}
                  </div>
                </div>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full bg-transparent"
                      onClick={() => setSelectedClass(classAssignment)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{selectedClass?.classTerm.class.name} - Class Details</DialogTitle>
                      <DialogDescription>Manage students and view class information</DialogDescription>
                    </DialogHeader>

                    {selectedClass && (
                      <Tabs defaultValue="students" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="students">Students</TabsTrigger>
                          <TabsTrigger value="subjects">Subjects</TabsTrigger>
                          <TabsTrigger value="transitions">Transitions</TabsTrigger>
                        </TabsList>

                        <TabsContent value="students" className="space-y-4">
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Student</TableHead>
                                  <TableHead>Admission No</TableHead>
                                  <TableHead>Gender</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selectedClass.classTerm.students.map((studentClassTerm: any) => (
                                  <TableRow key={studentClassTerm.id}>
                                    <TableCell>
                                      <div className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8">
                                          {studentClassTerm.student.user.avatarUrl ? (
                                            <AvatarImage src={studentClassTerm.student.user.avatarUrl} />
                                          ) : (
                                            <AvatarFallback className="text-xs">
                                              {(
                                                (studentClassTerm.student.user.firstName?.[0] ?? "") +
                                                (studentClassTerm.student.user.lastName?.[0] ?? "")
                                              ) || "?"}
                                            </AvatarFallback>
                                          )}
                                        </Avatar>
                                        <div>
                                          <p className="font-medium">
                                            {studentClassTerm.student.user.firstName}{" "}
                                            {studentClassTerm.student.user.lastName}
                                          </p>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>{studentClassTerm.student.admissionNo}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline">
                                        {studentClassTerm.student.user.gender || "Not specified"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="default">Active</Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TabsContent>

                        <TabsContent value="subjects" className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            {selectedClass.classTerm.classSubjects.map((classSubject: any) => (
                              <Card key={classSubject.id}>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-base">{classSubject.subject.name}</CardTitle>
                                  <CardDescription>Code: {classSubject.subject.code}</CardDescription>
                                </CardHeader>
                              </Card>
                            ))}
                          </div>
                        </TabsContent>

                        <TabsContent value="transitions" className="space-y-4">
                          <div className="text-center py-8">
                            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Student Transitions</h3>
                            <p className="text-muted-foreground">
                              View student promotion, transfer, and withdrawal history
                            </p>
                          </div>
                        </TabsContent>
                      </Tabs>
                    )}
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
