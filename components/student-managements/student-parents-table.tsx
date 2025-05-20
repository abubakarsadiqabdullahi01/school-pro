"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Edit, MoreHorizontal, Trash } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { Card, CardContent } from "@/components/ui/card"
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
import { toast } from "@/components/ui/use-toast"

interface Parent {
  id: string
  parentId: string
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  phone: string
  address: string | null
  relationship: string
}

interface StudentParentsTableProps {
  parents: Parent[]
  studentId: string
}

export function StudentParentsTable({ parents, studentId }: StudentParentsTableProps) {
  const router = useRouter()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [parentToDelete, setParentToDelete] = useState<Parent | null>(null)

  const handleDeleteClick = (parent: Parent) => {
    setParentToDelete(parent)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!parentToDelete) return

    try {
      // Here you would call your API to delete the parent-student relationship
      // For now, we'll just show a toast
      toast({
        title: "Parent removed",
        description: `${parentToDelete.fullName} has been removed from this student's record.`,
      })

      // Refresh the page to show updated data
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove parent. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeleteDialogOpen(false)
      setParentToDelete(null)
    }
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No parents/guardians found.
                  </TableCell>
                </TableRow>
              ) : (
                parents.map((parent) => (
                  <TableRow key={parent.id}>
                    <TableCell className="font-medium">{parent.fullName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{parent.relationship}</Badge>
                    </TableCell>
                    <TableCell>{parent.phone}</TableCell>
                    <TableCell>{parent.email || "—"}</TableCell>
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
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/parents/${parent.parentId}`)}>
                            View Parent Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/dashboard/admin/students/${studentId}/edit-parent/${parent.id}`)
                            }
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Relationship
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(parent)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Remove Parent
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

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Parent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {parentToDelete?.fullName} from this student's record? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
