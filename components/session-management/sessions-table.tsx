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
import { deleteSession, setCurrentSession } from "@/app/actions/session-management"

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
  createdAt: Date
}

interface SessionsTableProps {
  sessions: Session[]
}

export function SessionsTable({ sessions }: SessionsTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSettingCurrent, setIsSettingCurrent] = useState(false)
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
      await deleteSession(sessionToDelete.id)
      toast.success("Session deleted successfully")
      router.refresh()
    } catch (error) {
      console.error("Failed to delete session:", error)
      toast.error("Failed to delete session")
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setSessionToDelete(null)
    }
  }

  // Handle set as current session
  const handleSetCurrentSession = async (sessionId: string, schoolId: string) => {
    try {
      setIsSettingCurrent(true)
      await setCurrentSession(sessionId, schoolId)
      toast.success("Current session updated successfully")
      router.refresh()
    } catch (error) {
      console.error("Failed to update current session:", error)
      toast.error("Failed to update current session")
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
            placeholder="Search sessions..."
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
          <Button onClick={handleAddSession}>
            <Plus className="mr-2 h-4 w-4" />
            Add Session
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
                    Session Name
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead className="whitespace-nowrap">School</TableHead>
                <TableHead className="whitespace-nowrap">Start Date</TableHead>
                <TableHead className="whitespace-nowrap">End Date</TableHead>
                <TableHead className="whitespace-nowrap">Terms</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No sessions found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.name}</TableCell>
                    <TableCell>
                      {session.school} <span className="text-xs text-muted-foreground">({session.schoolCode})</span>
                    </TableCell>
                    <TableCell>{formatDate(session.startDate)}</TableCell>
                    <TableCell>{formatDate(session.endDate)}</TableCell>
                    <TableCell>{session.termsCount}</TableCell>
                    <TableCell>
                      {session.isCurrent ? (
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
                          <DropdownMenuItem onClick={() => handleViewSession(session.id)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditSession(session.id)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {!session.isCurrent && (
                            <DropdownMenuItem
                              onClick={() => handleSetCurrentSession(session.id, session.schoolId)}
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
                              setSessionToDelete(session)
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
              This will permanently delete the session <span className="font-semibold">{sessionToDelete?.name}</span>{" "}
              from <span className="font-semibold">{sessionToDelete?.school}</span>.
              {sessionToDelete?.termsCount > 0 && (
                <span className="block mt-2 text-destructive">
                  Warning: This session has {sessionToDelete.termsCount} terms associated with it. Deleting it will also
                  delete all related terms and data.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
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
