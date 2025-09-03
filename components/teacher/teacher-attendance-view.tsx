"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Users } from "lucide-react"
import { format } from "date-fns"
import { getTeacherClasses, getClassAttendance, markAttendance } from "@/app/actions/teacher-management"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface TeacherAttendanceViewProps {
  teacherId: string
  currentTerm: any
}

export function TeacherAttendanceView({ teacherId, currentTerm }: TeacherAttendanceViewProps) {
  const [selectedClass, setSelectedClass] = useState("")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [classes, setClasses] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load classes on component mount
  const loadClasses = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getTeacherClasses(currentTerm?.id)
      if (result.success) {
        setClasses(result.data)
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Failed to load classes")
    } finally {
      setLoading(false)
    }
  }, [currentTerm?.id])

  useEffect(() => {
    loadClasses()
  }, [loadClasses])

  // Load attendance when class or date changes
  const loadAttendance = useCallback(async () => {
    if (!selectedClass) return
    
    setLoading(true)
    try {
      const result = await getClassAttendance(selectedClass, format(selectedDate, "yyyy-MM-dd"))
      if (result.success) {
        setStudents(result.data)
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Failed to load attendance")
    } finally {
      setLoading(false)
    }
  }, [selectedClass, selectedDate])

  useEffect(() => {
    if (selectedClass) {
      loadAttendance()
    }
  }, [selectedClass, selectedDate, loadAttendance])

  // Handle attendance change
  const handleAttendanceChange = async (studentId: string, status: string) => {
    setSaving(true)
    try {
      const result = await markAttendance({
        studentId,
        date: format(selectedDate, "yyyy-MM-dd"),
        status,
      })

      if (result.success) {
        // Update local state
        setStudents((prev) =>
          prev.map((student) =>
            student.student.id === studentId
              ? {
                  ...student,
                  student: {
                    ...student.student,
                    attendances: [
                      {
                        id: result.data.id,
                        status,
                        date: selectedDate,
                      },
                    ],
                  },
                }
              : student
          )
        )

        toast.success("Attendance marked successfully")
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Failed to mark attendance")
    } finally {
      setSaving(false)
    }
  }

  const getAttendanceStatus = (student: any) => {
    const attendance = student.student.attendances?.[0]
    return attendance?.status || "NOT_MARKED"
  }

  // Calculate attendance statistics
  const getAttendanceStats = () => {
    const stats = {
      present: 0,
      absent: 0,
      late: 0,
      notMarked: 0,
      total: students.length
    }

    students.forEach((student) => {
      const status = getAttendanceStatus(student)
      switch (status) {
        case "PRESENT":
          stats.present++
          break
        case "ABSENT":
          stats.absent++
          break
        case "LATE":
          stats.late++
          break
        default:
          stats.notMarked++
      }
    })

    return stats
  }

  const selectedClassData = classes.find((c) => c.classTerm.id === selectedClass)
  const stats = getAttendanceStats()

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Filters</CardTitle>
          <CardDescription>Select class and date to mark attendance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Class</label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((classAssignment) => (
                    <SelectItem key={classAssignment.classTerm.id} value={classAssignment.classTerm.id}>
                      {classAssignment.classTerm.class.name} ({classAssignment.classTerm.students.length} students)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Stats */}
      {selectedClass && students.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Present</CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.present}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0}% of class
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Absent</CardTitle>
              <Users className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.absent}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? Math.round((stats.absent / stats.total) * 100) : 0}% of class
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Late</CardTitle>
              <Users className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.late}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? Math.round((stats.late / stats.total) * 100) : 0}% of class
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Not Marked</CardTitle>
              <Users className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{stats.notMarked}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? Math.round((stats.notMarked / stats.total) * 100) : 0}% of class
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Attendance Marking */}
      {selectedClass && selectedDate && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Mark Attendance</CardTitle>
                <CardDescription>
                  {selectedClassData?.classTerm.class.name} - {format(selectedDate, "PPP")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">Loading students...</p>
                </div>
              </div>
            ) : students.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No students found for this class</p>
                </div>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Admission No</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((studentClassTerm) => {
                      const status = getAttendanceStatus(studentClassTerm)

                      return (
                        <TableRow key={studentClassTerm.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                {studentClassTerm.student.user.avatarUrl && (
                                  <AvatarImage
                                    src={studentClassTerm.student.user.avatarUrl}
                                    alt={`${studentClassTerm.student.user.firstName} ${studentClassTerm.student.user.lastName}`}
                                  />
                                )}
                                <AvatarFallback>
                                  {(studentClassTerm.student.user.firstName?.[0] ?? "") +
                                    (studentClassTerm.student.user.lastName?.[0] ?? "")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">
                                  {studentClassTerm.student.user.firstName} {studentClassTerm.student.user.lastName}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{studentClassTerm.student.admissionNo}</TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                status === "PRESENT"
                                  ? "default"
                                  : status === "ABSENT"
                                    ? "destructive"
                                    : status === "LATE"
                                      ? "secondary"
                                      : "outline"
                              }
                            >
                              {status === "NOT_MARKED" ? "Not Marked" : status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-1 justify-center">
                              <Button
                                size="sm"
                                variant={status === "PRESENT" ? "default" : "outline"}
                                onClick={() => handleAttendanceChange(studentClassTerm.student.id, "PRESENT")}
                                disabled={saving}
                              >
                                Present
                              </Button>
                              <Button
                                size="sm"
                                variant={status === "ABSENT" ? "destructive" : "outline"}
                                onClick={() => handleAttendanceChange(studentClassTerm.student.id, "ABSENT")}
                                disabled={saving}
                              >
                                Absent
                              </Button>
                              <Button
                                size="sm"
                                variant={status === "LATE" ? "secondary" : "outline"}
                                onClick={() => handleAttendanceChange(studentClassTerm.student.id, "LATE")}
                                disabled={saving}
                              >
                                Late
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}