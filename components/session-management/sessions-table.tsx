"use client"

import { useState } from "react"
import { format } from "date-fns"
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
}

export function SessionsTable({ sessions }: SessionsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSettingCurrent, setIsSettingCurrent] = useState<string | null>(null)
  const router = useRouter()

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
      return { label: "Current", variant: "default" as const, color: "bg-green-100 text-green-800" }
    } else if (now < startDate) {
      return { label: "Upcoming", variant: "secondary" as const, color: "bg-blue-100 text-blue-800" }
    } else if (now > endDate) {
      return { label: "Completed", variant: "outline" as const, color: "bg-gray-100 text-gray-800" }
    } else {
      return { label: "Active", variant: "secondary" as const, color: "bg-yellow-100 text-yellow-800" }
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
  const handleAddSession = () => {
    router.push("/dashboard/super-admin/sessions/create")
  }

  // Handle delete session
  const handleDeleteSession = async () => {
    if (!sessionToDelete) return

    try {
      setIsDeleting(true)
      const result = await deleteSession(sessionToDelete.id)

      if (result.success) {
        toast.success("Success", { description: result.message })
        router.refresh()
      } else {
        toast.error("Error", { description: result.error })
      }
    } catch (error) {
      console.error("Failed to delete session:", error)
      toast.error("Error", { description: "Failed to delete session" })
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setSessionToDelete(null)
    }
  }

  // Handle set as current session
  const handleSetCurrentSession = async (sessionId: string, schoolId: string) => {
    try {
      setIsSettingCurrent(sessionId)
      const result = await setCurrentSession(sessionId, schoolId)

      if (result.success) {
        toast.success("Success", { description: result.message })
        router.refresh()
      } else {
        toast.error("Error", { description: result.error })
      }
    } catch (error) {
      console.error("Failed to update current session:", error)
      toast.error("Error", { description: "Failed to update current session" })
    } finally {
      setIsSettingCurrent(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Academic Sessions</h2>
          <p className="text-muted-foreground">Manage academic sessions across all schools</p>
        </div>
        <Button onClick={handleAddSession}>
          <Plus className="mr-2 h-4 w-4" />
          Add Session
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Sessions</CardTitle>
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions.filter((s) => s.isCurrent).length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
            <School className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{new Set(sessions.map((s) => s.schoolId)).size}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Terms</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions.reduce((sum, s) => sum + s.termsCount, 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <Card>
        <CardHeader>
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

        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Session Name</TableHead>
                  <TableHead className="whitespace-nowrap">School</TableHead>
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
                    <TableCell colSpan={7} className="h-24 text-center">
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
                        <TableCell>
                          <div>
                            <div className="font-medium">{session.school}</div>
                            <div className="text-sm text-muted-foreground">({session.schoolCode})</div>
                          </div>
                        </TableCell>
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
