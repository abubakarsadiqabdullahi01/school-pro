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
  Plus,
  Search,
  Trash2,
  Calendar,
  School,
  Users,
  BookOpen,
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
import { deleteSession, setCurrentSession } from "@/app/actions/session-management"
import { motion } from "framer-motion"
import { queryKeys } from "@/lib/query-keys"

interface Session {
  id: string
  name: string
  school: string
  schoolCode: string
  schoolId: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
  termsCount: number
  studentsCount: number
  createdAt: Date
  description?: string | null
}

interface SessionsTableProps {
  sessions: Session[]
  /**
   * Hide the School column. When the header switcher has a school in focus every row
   * belongs to it, so repeating the name on each row is redundant.
   */
  hideSchoolColumn?: boolean
}

export function SessionsTable({ sessions, hideSchoolColumn = false }: SessionsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSettingCurrent, setIsSettingCurrent] = useState<string | null>(null)
  const router = useRouter()
  const queryClient = useQueryClient()

  // Filter sessions based on search query
  const filteredSessions = sessions.filter(
    (session) =>
      session.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.school.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.schoolCode.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Format date for display
  const formatDate = (date: Date) => {
    return format(new Date(date), "MMM d, yyyy")
  }

  // Get session status
  const getSessionStatus = (session: Session) => {
    const now = new Date()
    const startDate = new Date(session.startDate)
    const endDate = new Date(session.endDate)

    if (session.isCurrent) {
      return { label: "Current", variant: "default" as const, color: "bg-green-500/10 text-green-700 dark:text-green-400" }
    } else if (now < startDate) {
      return { label: "Upcoming", variant: "secondary" as const, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" }
    } else if (now > endDate) {
      return { label: "Completed", variant: "outline" as const, color: "bg-muted text-foreground" }
    } else {
      return { label: "Active", variant: "secondary" as const, color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" }
    }
  }

  // Handle edit session
  const handleEditSession = (sessionId: string) => {
    router.push(`/dashboard/super-admin/sessions/edit/${sessionId}`)
  }

  // Handle view session
  const handleViewSession = (sessionId: string) => {
    router.push(`/dashboard/super-admin/sessions/${sessionId}`)
  }

  // Handle add session
  const deleteSessionMutation = useMutation({
    mutationFn: deleteSession,
    onMutate: () => setIsDeleting(true),
    onSuccess: async (result) => {
      if (result.success) {
        toast.success("Success", { description: result.message })
        await queryClient.invalidateQueries({ queryKey: queryKeys.superAdmin.sessions })
        router.refresh()
      } else {
        toast.error("Error", { description: result.error })
      }
    },
    onError: (error) => {
      console.error("Failed to delete session:", error)
      toast.error("Error", { description: "Failed to delete session" })
    },
    onSettled: () => {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setSessionToDelete(null)
    },
  })

  const setCurrentSessionMutation = useMutation({
    mutationFn: ({ sessionId, schoolId }: { sessionId: string; schoolId: string }) =>
      setCurrentSession(sessionId, schoolId),
    onMutate: ({ sessionId }) => setIsSettingCurrent(sessionId),
    onSuccess: async (result) => {
      if (result.success) {
        toast.success("Success", { description: result.message })
        await queryClient.invalidateQueries({ queryKey: queryKeys.superAdmin.sessions })
        router.refresh()
      } else {
        toast.error("Error", { description: result.error })
      }
    },
    onError: (error) => {
      console.error("Failed to update current session:", error)
      toast.error("Error", { description: "Failed to update current session" })
    },
    onSettled: () => setIsSettingCurrent(null),
  })

  // Handle delete session
  const handleDeleteSession = () => {
    if (!sessionToDelete) return
    deleteSessionMutation.mutate(sessionToDelete.id)
  }

  // Handle set as current session
  const handleSetCurrentSession = (sessionId: string, schoolId: string) => {
    setCurrentSessionMutation.mutate({ sessionId, schoolId })
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
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-lg font-bold leading-tight">{sessions.length}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
            <CardTitle className="text-sm font-medium">Current Sessions</CardTitle>
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-lg font-bold leading-tight">{sessions.filter((s) => s.isCurrent).length}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
            <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
            <School className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-lg font-bold leading-tight">{new Set(sessions.map((s) => s.schoolId)).size}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
            <CardTitle className="text-sm font-medium">Total Terms</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-lg font-bold leading-tight">{sessions.reduce((sum, s) => sum + s.termsCount, 0)}</div>
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
                placeholder="Search sessions by name, school..."
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
                  <TableHead className="whitespace-nowrap">Session Name</TableHead>
                  {!hideSchoolColumn && <TableHead className="whitespace-nowrap">School</TableHead>}
                  <TableHead className="whitespace-nowrap">Duration</TableHead>
                  <TableHead className="whitespace-nowrap">Terms</TableHead>
                  <TableHead className="whitespace-nowrap">Students</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={hideSchoolColumn ? 6 : 7} className="h-24 text-center">
                      {searchQuery ? "No sessions found matching your search." : "No sessions found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSessions.map((session) => {
                    const status = getSessionStatus(session)
                    return (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{session.name}</div>
                            {session.description && (
                              <div className="text-sm text-muted-foreground">{session.description}</div>
                            )}
                          </div>
                        </TableCell>
                        {!hideSchoolColumn && (
                          <TableCell>
                            <div>
                              <div className="font-medium">{session.school}</div>
                              <div className="text-sm text-muted-foreground">({session.schoolCode})</div>
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="text-sm">
                            <div>{formatDate(session.startDate)}</div>
                            <div className="text-muted-foreground">to {formatDate(session.endDate)}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                            <span>{session.termsCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{session.studentsCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={status.color}>{status.label}</Badge>
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
                              <DropdownMenuItem onClick={() => handleViewSession(session.id)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditSession(session.id)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Session
                              </DropdownMenuItem>
                              {!session.isCurrent && (
                                <DropdownMenuItem
                                  onClick={() => handleSetCurrentSession(session.id, session.schoolId)}
                                  disabled={isSettingCurrent === session.id}
                                >
                                  <CalendarRange className="mr-2 h-4 w-4" />
                                  {isSettingCurrent === session.id ? "Setting..." : "Set as Current"}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setSessionToDelete(session)
                                  setDeleteDialogOpen(true)
                                }}
                                disabled={session.isCurrent}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
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
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the session <span className="font-semibold">{sessionToDelete?.name}</span>{" "}
              from <span className="font-semibold">{sessionToDelete?.school}</span>?
              {sessionToDelete && sessionToDelete.termsCount > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠️ This session has {sessionToDelete.termsCount} terms and {sessionToDelete.studentsCount} students.
                  All associated data will be affected.
                </span>
              )}
              <span className="block mt-2 text-sm text-muted-foreground">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
