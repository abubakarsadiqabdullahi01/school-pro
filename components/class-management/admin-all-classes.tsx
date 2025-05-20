"use client"

import { useState } from "react"
import { ChevronDown, Download, Edit, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react"

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { deleteClass } from "@/app/actions/class-management"
import type { ClassLevel } from "@prisma/client"

interface Class {
  id: string
  name: string
  level: ClassLevel
  schoolId: string
  schoolName: string
  schoolCode: string
  subjectsCount: number
  termsCount: number
  feeStructuresCount: number
  terms: string
}

interface AllClassesTableProps {
  classes: Class[]
}

export function AllClassesTable({ classes }: AllClassesTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [classToDelete, setClassToDelete] = useState<Class | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  // Filter classes based on search query
  const filteredClasses = classes.filter(
    (cls) =>
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.level.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.schoolCode.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Handle edit class
  const handleEditClass = (classId: string) => {
    router.push(`/dashboard/admin/classes/edit/${classId}`)
  }

  // Handle view class
  const handleViewClass = (classId: string) => {
    router.push(`/dashboard/admin/classes/${classId}`)
  }

  // Handle add class
  const handleAddClass = () => {
    router.push("/dashboard/admin/classes/create")
  }

  // Handle delete class
  const handleDeleteClass = async () => {
    if (!classToDelete) return

    try {
      setIsDeleting(true)
      await deleteClass(classToDelete.id)
      toast.success("Class deleted successfully")
      router.refresh()
    } catch (error) {
      console.error("Failed to delete class:", error)
      toast.error("Failed to delete class")
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setClassToDelete(null)
    }
  }

  // Format class level for display
  const formatClassLevel = (level: ClassLevel) => {
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
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={handleAddClass}>
            <Plus className="mr-2 h-4 w-4" />
            Add Class
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
                    Class Name
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead className="whitespace-nowrap">Level</TableHead>
                <TableHead className="whitespace-nowrap">School</TableHead>
                <TableHead className="whitespace-nowrap">Subjects</TableHead>
                <TableHead className="whitespace-nowrap">Terms</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClasses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No classes found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredClasses.map((cls) => (
                  <TableRow key={cls.id}>
                    <TableCell className="font-medium">{cls.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatClassLevel(cls.level)}</Badge>
                    </TableCell>
                    <TableCell>
                      {cls.schoolName} <span className="text-xs text-muted-foreground">({cls.schoolCode})</span>
                    </TableCell>
                    <TableCell>{cls.subjectsCount} subject(s)</TableCell>
                    <TableCell>
                      {cls.terms === "Not Assigned Term" ? (
                        <Badge variant="outline" color="destructive">{cls.terms}</Badge>
                      ) : (
                        cls.terms
                      )}
                    </TableCell>
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
                          <DropdownMenuItem onClick={() => handleViewClass(cls.id)}>View details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditClass(cls.id)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setClassToDelete(cls)
                              setDeleteDialogOpen(true)
                            }}
                          >
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the class <span className="font-semibold">{classToDelete?.name}</span> from{" "}
              <span className="font-semibold">{classToDelete?.schoolName}</span>.
              <span className="block mt-2 text-destructive">
                Warning: Deleting this class will also delete all related data including subjects, fee structures, and
                other class-specific information.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClass}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
