"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

interface Class {
  id: string
  classId: string
  className: string
  level: string
  termId: string
  termName: string
  isCurrent: boolean
}

interface SubjectClassesTableProps {
  classes: Class[]
  subjectId: string
}

export function SubjectClassesTable({ classes, subjectId }: SubjectClassesTableProps) {
  const [searchQuery, setSearchQuery] = useState("")

  // Filter classes based on search query
  const filteredClasses = classes.filter(
    (cls) =>
      cls.className.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.level.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.termName.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Format class level for display
  const formatClassLevel = (level: string) => {
    switch (level) {
      case "PRIMARY":
        return "Primary"
      case "JUNIOR_SECONDARY":
        return "Junior Secondary"
      case "SENIOR_SECONDARY":
        return "Senior Secondary"
      default:
        return level
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search classes..."
            className="w-full pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class Name</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClasses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No classes found for this subject.
                  </TableCell>
                </TableRow>
              ) : (
                filteredClasses.map((cls) => (
                  <TableRow key={cls.id}>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/admin/classes/${cls.classId}`} className="hover:underline">
                        {cls.className}
                      </Link>
                    </TableCell>
                    <TableCell>{formatClassLevel(cls.level)}</TableCell>
                    <TableCell>{cls.termName}</TableCell>
                    <TableCell>
                      {cls.isCurrent ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Current</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
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
