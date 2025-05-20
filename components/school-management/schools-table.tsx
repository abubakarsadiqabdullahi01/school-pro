"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ChevronDown, Download, Edit, MoreHorizontal, Search, Trash2, Building } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"

interface School {
  id: string
  name: string
  code: string
  email: string
  phone: string
  students: number
  teachers: number
  admins: number
  status: string
  createdAt: Date
}

interface SchoolsTableProps {
  schools: School[]
}

export function SchoolsTable({ schools }: SchoolsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  // Filter schools based on search query
  const filteredSchools = schools.filter(
    (school) =>
      school.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      school.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      school.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Format date for display
  const formatDate = (date: Date) => {
    return format(new Date(date), "MMM d, yyyy")
  }

  // Get status badge
  const getStatusBadge = (status: string) => {
    if (status === "Active") {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-50">
          Active
        </Badge>
      )
    } else {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 hover:bg-red-50">
          Inactive
        </Badge>
      )
    }
  }

  // Handle edit school
  const handleEditSchool = (schoolId: string) => {
    router.push(`/dashboard/super-admin/schools/edit/${schoolId}`)
  }

  // Handle view school
  const handleViewSchool = (schoolId: string) => {
    router.push(`/dashboard/super-admin/schools/${schoolId}`)
  }

  // Handle add school
  const handleAddSchool = () => {
    router.push("/dashboard/super-admin/schools/add")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search schools..."
            className="w-full pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={handleAddSchool}>
            <Building className="mr-2 h-4 w-4" />
            Add School
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    Name
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead className="whitespace-nowrap">Code</TableHead>
                <TableHead className="whitespace-nowrap">Email</TableHead>
                <TableHead className="whitespace-nowrap">Phone</TableHead>
                <TableHead className="whitespace-nowrap">Students</TableHead>
                <TableHead className="whitespace-nowrap">Teachers</TableHead>
                <TableHead className="whitespace-nowrap">Admins</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSchools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    No schools found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSchools.map((school) => (
                  <TableRow key={school.id}>
                    <TableCell className="font-medium">{school.name}</TableCell>
                    <TableCell>{school.code}</TableCell>
                    <TableCell>{school.email}</TableCell>
                    <TableCell>{school.phone}</TableCell>
                    <TableCell>{school.students}</TableCell>
                    <TableCell>{school.teachers}</TableCell>
                    <TableCell>{school.admins}</TableCell>
                    <TableCell>{getStatusBadge(school.status)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleViewSchool(school.id)}>View details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditSchool(school.id)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}

