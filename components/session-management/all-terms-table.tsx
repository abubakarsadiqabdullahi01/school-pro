"use client"

import { useState } from "react"
import { format } from "date-fns"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CalendarRange,
  Download,
  Edit,
  Eye,
  MoreHorizontal,
  Search,
  Trash2,
  Calendar,
  School,
  BookOpen,
  Users,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { canDeleteTerm, canEditTerm, canSetTermCurrent } from "@/lib/term-rules"
import { rowOpenHandler } from "@/lib/row-open"
import { TermActionItem } from "@/components/session-management/term-action-item"
import { motion } from "framer-motion"
import { queryKeys } from "@/lib/query-keys"

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
  studentsCount: number
  createdAt: Date
}

interface AllTermsTableProps {
  terms: Term[]
  hideSchoolColumn?: boolean
  /** The viewer's role, because only a super admin may reopen a term that has ended. */
  viewerRole?: string | null
}

export function AllTermsTable({ terms, hideSchoolColumn = false, viewerRole }: AllTermsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [termToDelete, setTermToDelete] = useState<Term | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSettingCurrent, setIsSettingCurrent] = useState<string | null>(null)
  const router = useRouter()
  const queryClient = useQueryClient()

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

  // Get term status
  const getTermStatus = (term: Term) => {
    const now = new Date()
    const startDate = new Date(term.startDate)
    const endDate = new Date(term.endDate)

    if (term.isCurrent) {
      return { label: "Current", variant: "default" as const, color: "bg-green-500/10 text-green-700 dark:text-green-400" }
    } else if (now < startDate) {
      return { label: "Upcoming", variant: "secondary" as const, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" }
    } else if (now > endDate) {
      return { label: "Completed", variant: "outline" as const, color: "bg-muted text-foreground" }
    } else {
      return { label: "Active", variant: "secondary" as const, color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" }
    }
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
      if (result.success) {
        toast.success("Success", { description: result.message })
        await queryClient.invalidateQueries({ queryKey: queryKeys.superAdmin.terms })
        router.refresh()
      } else {
        toast.error("Error", { description: result.error })
      }
    },
    onError: (error) => {
      console.error("Failed to delete term:", error)
      toast.error("Error", { description: "Failed to delete term" })
    },
    onSettled: () => {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setTermToDelete(null)
    },
  })

  const setCurrentTermMutation = useMutation({
    mutationFn: ({ termId, sessionId }: { termId: string; sessionId: string }) => setCurrentTerm(termId, sessionId),
    onMutate: ({ termId }) => setIsSettingCurrent(termId),
    onSuccess: async (result) => {
      if (result.success) {
        toast.success("Success", { description: result.message })
        await queryClient.invalidateQueries({ queryKey: queryKeys.superAdmin.terms })
        router.refresh()
      } else {
        toast.error("Error", { description: result.error })
      }
    },
    onError: (error) => {
      console.error("Failed to update current term:", error)
      toast.error("Error", { description: "Failed to update current term" })
    },
    onSettled: () => setIsSettingCurrent(null),
  })

  // Handle delete term
  const handleDeleteTerm = () => {
    if (!termToDelete) return
    deleteTermMutation.mutate(termToDelete.id)
  }

  // Handle set as current term
  const handleSetCurrentTerm = (termId: string, sessionId: string) => {
    setCurrentTermMutation.mutate({ termId, sessionId })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4"
    >
      {/* Stats Cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
            <CardTitle className="text-sm font-medium">Total Terms</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-lg font-bold leading-tight">{terms.length}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
            <CardTitle className="text-sm font-medium">Current Terms</CardTitle>
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-lg font-bold leading-tight">{terms.filter((t) => t.isCurrent).length}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-lg font-bold leading-tight">{new Set(terms.map((t) => t.sessionId)).size}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
            <CardTitle className="text-sm font-medium">Schools</CardTitle>
            <School className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-lg font-bold leading-tight">{new Set(terms.map((t) => t.schoolId)).size}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <Card className="shadow-sm">
        <CardHeader className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search terms by name, session, school..."
                className="w-full pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Term Name</TableHead>
                  <TableHead className="whitespace-nowrap">Session</TableHead>
                  {!hideSchoolColumn && <TableHead className="whitespace-nowrap">School</TableHead>}
                  <TableHead className="whitespace-nowrap">Duration</TableHead>
                  <TableHead className="whitespace-nowrap">Students</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTerms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={hideSchoolColumn ? 6 : 7} className="h-24 text-center">
                      {searchQuery ? "No terms found matching your search." : "No terms found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTerms.map((term) => {
                    const status = getTermStatus(term)
                    return (
                      <TableRow
                        key={term.id}
                        className="cursor-pointer"
                        onClick={rowOpenHandler(() => handleViewTerm(term.id))}
                      >
                        <TableCell>
                          <div className="font-medium">{term.name}</div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{term.sessionName}</div>
                          </div>
                        </TableCell>
                        {!hideSchoolColumn && (
                          <TableCell>
                            <div>
                              <div className="font-medium">{term.schoolName}</div>
                              <div className="text-sm text-muted-foreground">({term.schoolCode})</div>
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="text-sm">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {formatDate(term.startDate)}
                            </div>
                            <div className="text-muted-foreground">to {formatDate(term.endDate)}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{term.studentsCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={status.color}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleViewTerm(term.id)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <TermActionItem
                                verdict={canEditTerm(term, viewerRole)}
                                onSelect={() => handleEditTerm(term.id)}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Term
                              </TermActionItem>
                              {!term.isCurrent && (
                                <TermActionItem
                                  verdict={canSetTermCurrent(term, viewerRole)}
                                  onSelect={() => handleSetCurrentTerm(term.id, term.sessionId)}
                                  busy={isSettingCurrent === term.id}
                                >
                                  <CalendarRange className="mr-2 h-4 w-4" />
                                  {isSettingCurrent === term.id ? "Setting..." : "Set as Current"}
                                </TermActionItem>
                              )}
                              <DropdownMenuSeparator />
                              <TermActionItem
                                verdict={canDeleteTerm(term)}
                                destructive
                                onSelect={() => {
                                  setTermToDelete(term)
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </TermActionItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Term</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the term <span className="font-semibold">{termToDelete?.name}</span> from{" "}
              <span className="font-semibold">{termToDelete?.schoolName}</span>?
              {termToDelete && termToDelete.studentsCount > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠️ This term has {termToDelete.studentsCount} students and associated data. All related information
                  will be affected.
                </span>
              )}
              <span className="block mt-2 text-sm text-muted-foreground">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTerm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Term"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
