"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, Download, Filter, MoreHorizontal, Search, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"

interface Student {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string
  gender: string
  className: string
  classId: string | null
  termName: string | null
  sessionName: string | null
  parentsCount: number
  photoUrl: string | null
}

interface Class {
  id: string
  name: string
}

interface AllStudentsTableProps {
  students: Student[]
  classes: Class[]
}

export function AllStudentsTable({ students, classes }: AllStudentsTableProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState("")
  const [classFilter, setClassFilter] = useState<string | null>(null)

  // Get initials for avatar fallback
  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  // Filter students based on search term and class filter
  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      searchTerm === "" ||
      student.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesClass = classFilter === null || student.classId === classFilter

    return matchesSearch && matchesClass
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 md:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search students..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1">
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filter</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuLabel>Filter by Class</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setClassFilter(null)}>All Classes</DropdownMenuItem>
              {classes.map((cls) => (
                <DropdownMenuItem key={cls.id} onClick={() => setClassFilter(cls.id)}>
                  {cls.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/admin/students/add">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Student
            </Link>
          </Button>
        </div>
      </div>

      {classFilter && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            Class: {classes.find((c) => c.id === classFilter)?.name}
            <button onClick={() => setClassFilter(null)} className="ml-1 rounded-full p-0.5 hover:bg-accent">
              <span className="sr-only">Remove filter</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </Badge>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Admission No.</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Parents</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No students found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          {student.photoUrl ? (
                            <AvatarImage
                              src={student.photoUrl || "/placeholder.svg"}
                              alt={`${student.firstName} ${student.lastName}`}
                            />
                          ) : null}
                          <AvatarFallback>{getInitials(student.firstName, student.lastName)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {student.firstName} {student.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {student.sessionName ? `${student.termName} - ${student.sessionName}` : "No session"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{student.admissionNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{student.gender}</Badge>
                    </TableCell>
                    <TableCell>{student.className}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{student.parentsCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/students/${student.id}`)}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/students/edit/${student.id}`)}>
                            Edit Student
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/dashboard/admin/students/${student.id}/add-parent`)}
                          >
                            Add Parent
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => router.push(`/dashboard/admin/students/${student.id}/payments`)}
                          >
                            View Payments
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/dashboard/admin/students/${student.id}/assessments`)}
                          >
                            View Assessments
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
