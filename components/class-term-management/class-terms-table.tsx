"use client"

import { useState } from "react"
import { ChevronDown, BookOpen, Search, Check, X } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
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
import { assignClassToTerm, removeClassFromTerm } from "@/app/actions/class-term-management"
import { ClassLevel } from "@prisma/client"

interface Class {
  id: string
  name: string
  level: ClassLevel
  isAssignedToCurrentTerm: boolean
  classTermId: string | null
}

interface CurrentTerm {
  id: string
  name: string
  sessionName: string
}

interface ClassTermsTableProps {
  classes: Class[]
  currentTerm: CurrentTerm
}

export function ClassTermsTable({ classes, currentTerm }: ClassTermsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [classToRemove, setClassToRemove] = useState<Class | null>(null)
  const router = useRouter()

  // Filter classes based on search query
  const filteredClasses = classes.filter(
    (cls) =>
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.level.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Format class level for display
  const formatClassLevel = (level: ClassLevel) => {
    switch (level) {
      case ClassLevel.PRIMARY:
        return "Primary"
      case ClassLevel.JSS:
        return "Junior Secondary"
      case ClassLevel.SSS:
        return "Senior Secondary"
      default:
        return level
    }
  }

  // Handle assign class to term
  const handleAssignClassToTerm = async (classId: string) => {
    try {
      setIsProcessing(classId)
      const result = await assignClassToTerm({
        classId,
        termId: currentTerm.id,
      })

      if (result.success) {
        toast.success("Class assigned to term successfully")
        router.refresh()
      }
    } catch (error: unknown) {
      console.error("Failed to assign class to term:", error)
      toast.error((error as Error).message || "Failed to assign class to term")
    } finally {
      setIsProcessing(null)
    }
  }

  // Handle remove class from term
  const handleRemoveClassFromTerm = async () => {
    if (!classToRemove || !classToRemove.classTermId) return

    try {
      setIsProcessing(classToRemove.id)
      await removeClassFromTerm(classToRemove.classTermId)
      toast.success("Class removed from term successfully")
      router.refresh()
    } catch (error: unknown) {
      console.error("Failed to remove class from term:", error)
      toast.error((error as Error).message || "Failed to remove class from term")
    } finally {
      setIsProcessing(null)
      setConfirmDialogOpen(false)
      setClassToRemove(null)
    }
  }

  // Handle manage subjects
  const handleManageSubjects = (classTermId: string) => {
    router.push(`/dashboard/admin/class-terms/${classTermId}/subjects`)
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
        <div>
          <Badge variant="outline" className="text-sm">
            Current Term: {currentTerm.name} ({currentTerm.sessionName})
          </Badge>
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
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClasses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
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
                      {cls.isAssignedToCurrentTerm ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          <Check className="mr-1 h-3 w-3" />
                          Assigned
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-600">
                          <X className="mr-1 h-3 w-3" />
                          Not Assigned
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {cls.isAssignedToCurrentTerm ? (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleManageSubjects(cls.classTermId!)}>
                              <BookOpen className="mr-2 h-4 w-4" />
                              Manage Subjects
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setClassToRemove(cls)
                                setConfirmDialogOpen(true)
                              }}
                              disabled={isProcessing === cls.id}
                            >
                              {isProcessing === cls.id ? "Processing..." : "Remove from Term"}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAssignClassToTerm(cls.id)}
                            disabled={isProcessing === cls.id}
                          >
                            {isProcessing === cls.id ? "Processing..." : "Assign to Term"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the class <span className="font-semibold">{classToRemove?.name}</span> from the current
              term{" "}
              <span className="font-semibold">
                {currentTerm.name} ({currentTerm.sessionName})
              </span>
              .
              <span className="block mt-2 text-destructive">
                Warning: This will also remove all subject assignments for this class in this term.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveClassFromTerm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isProcessing === classToRemove?.id}
            >
              {isProcessing === classToRemove?.id ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
