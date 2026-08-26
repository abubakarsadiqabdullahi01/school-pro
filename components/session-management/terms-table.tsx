"use client"

import { useState } from "react"
import { format } from "date-fns"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarRange, Edit, MoreHorizontal, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
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
import { deleteTerm, setCurrentTerm } from "@/app/actions/term-management"
import { queryKeys } from "@/lib/query-keys"

interface Term {
  id: string
  name: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
  createdAt: Date
}

interface TermsTableProps {
  terms: Term[]
  sessionId: string
}

export function TermsTable({ terms, sessionId }: TermsTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [termToDelete, setTermToDelete] = useState<Term | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSettingCurrent, setIsSettingCurrent] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  // Format date for display
  const formatDate = (date: Date) => {
    return format(new Date(date), "MMM d, yyyy")
  }

  // Handle edit term
  const handleEditTerm = (termId: string) => {
    router.push(`/dashboard/super-admin/terms/edit/${termId}`)
  }

  // Handle view term
  const handleViewTerm = (termId: string) => {
    router.push(`/dashboard/super-admin/terms/${termId}`)
  }

  const deleteTermMutation = useMutation({
    mutationFn: deleteTerm,
    onMutate: () => setIsDeleting(true),
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.error ?? "Failed to delete term")
        return
      }
      toast.success("Term deleted successfully")
      await queryClient.invalidateQueries({ queryKey: queryKeys.superAdmin.terms })
      router.refresh()
    },
    onError: (error) => {
      console.error("Failed to delete term:", error)
      toast.error("Failed to delete term")
    },
    onSettled: () => {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setTermToDelete(null)
    },
  })

  const setCurrentTermMutation = useMutation({
    mutationFn: (termId: string) => setCurrentTerm(termId, sessionId),
    onMutate: () => setIsSettingCurrent(true),
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.error ?? "Failed to update current term")
        return
      }
      toast.success("Current term updated successfully")
      await queryClient.invalidateQueries({ queryKey: queryKeys.superAdmin.terms })
      router.refresh()
    },
    onError: (error) => {
      console.error("Failed to update current term:", error)
      toast.error("Failed to update current term")
    },
    onSettled: () => setIsSettingCurrent(false),
  })

  // Handle delete term
  const handleDeleteTerm = () => {
    if (!termToDelete) return
    deleteTermMutation.mutate(termToDelete.id)
  }

  // Handle set as current term
  const handleSetCurrentTerm = (termId: string) => {
    setCurrentTermMutation.mutate(termId)
  }

  if (terms.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">No terms have been created for this session yet.</div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Term Name</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {terms.map((term) => (
            <TableRow key={term.id}>
              <TableCell className="font-medium">{term.name}</TableCell>
              <TableCell>{formatDate(term.startDate)}</TableCell>
              <TableCell>{formatDate(term.endDate)}</TableCell>
              <TableCell>
                {term.isCurrent ? (
                  <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-100">Current</Badge>
                ) : (
                  <Badge variant="outline">Inactive</Badge>
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
                    <DropdownMenuItem onClick={() => handleViewTerm(term.id)}>View details</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleEditTerm(term.id)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    {!term.isCurrent && (
                      <DropdownMenuItem onClick={() => handleSetCurrentTerm(term.id)} disabled={isSettingCurrent}>
                        <CalendarRange className="mr-2 h-4 w-4" />
                        Set as Current
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setTermToDelete(term)
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
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the term <span className="font-semibold">{termToDelete?.name}</span>.
              <span className="block mt-2 text-destructive">
                Warning: Deleting this term will also delete all related data including assessments, fee structures, and
                other term-specific information.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTerm}
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
