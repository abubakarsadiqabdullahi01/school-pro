"use client"

import { useState } from "react"
import { format } from "date-fns"
import { CalendarRange, ChevronDown, Download, Edit, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react"

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
import { deleteTerm, setCurrentTerm } from "@/app/actions/term-management"

interface Term {
  id: string
  name: string
  sessionId: string
  sessionName: string
  schoolId: string
  schoolName: string
  schoolCode: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
  createdAt: Date
}

interface AllTermsTableProps {
  terms: Term[]
}

export function AllTermsTable({ terms }: AllTermsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [termToDelete, setTermToDelete] = useState<Term | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSettingCurrent, setIsSettingCurrent] = useState(false)
  const router = useRouter()

  // Filter terms based on search query
  const filteredTerms = terms.filter(
    (term) =>
      term.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      term.sessionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      term.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      term.schoolCode.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Format date for display
  const formatDate = (date: Date) => {
    return format(new Date(date), "MMM d, yyyy")
  }

  // Handle edit term
  const handleEditTerm = (termId: string) => {
    router.push(`/dashboard/admin/school-terms/edit/${termId}`)
  }

  // Handle view term
  const handleViewTerm = (termId: string) => {
    router.push(`/dashboard/admin/school-terms/${termId}`)
  }

  // Handle add term
  const handleAddTerm = () => {
    router.push("/dashboard/admin/school-terms/create")
  }

  // Handle delete term
  const handleDeleteTerm = async () => {
    if (!termToDelete) return

    try {
      setIsDeleting(true)
      await deleteTerm(termToDelete.id)
      toast.success("Term deleted successfully")
      router.refresh()
    } catch (error) {
      console.error("Failed to delete term:", error)
      toast.error("Failed to delete term")
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setTermToDelete(null)
    }
  }

  // Handle set as current term
  const handleSetCurrentTerm = async (termId: string, sessionId: string) => {
    try {
      setIsSettingCurrent(true)
      await setCurrentTerm(termId, sessionId)
      toast.success("Current term updated successfully")
      router.refresh()
    } catch (error) {
      console.error("Failed to update current term:", error)
      toast.error("Failed to update current term")
    } finally {
      setIsSettingCurrent(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search terms..."
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
          <Button onClick={handleAddTerm}>
            <Plus className="mr-2 h-4 w-4" />
            Add Term
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
                    Term Name
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead className="whitespace-nowrap">Session</TableHead>
                <TableHead className="whitespace-nowrap">School</TableHead>
                <TableHead className="whitespace-nowrap">Start Date</TableHead>
                <TableHead className="whitespace-nowrap">End Date</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTerms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No terms found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTerms.map((term) => (
                  <TableRow key={term.id}>
                    <TableCell className="font-medium">{term.name}</TableCell>
                    <TableCell>{term.sessionName}</TableCell>
                    <TableCell>
                      {term.schoolName} <span className="text-xs text-muted-foreground">({term.schoolCode})</span>
                    </TableCell>
                    <TableCell>{formatDate(term.startDate)}</TableCell>
                    <TableCell>{formatDate(term.endDate)}</TableCell>
                    <TableCell>
                      {term.isCurrent ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Current</Badge>
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
                            <DropdownMenuItem
                              onClick={() => handleSetCurrentTerm(term.id, term.sessionId)}
                              disabled={isSettingCurrent}
                            >
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
              This will permanently delete the term <span className="font-semibold">{termToDelete?.name}</span> from{" "}
              <span className="font-semibold">{termToDelete?.schoolName}</span>.
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
