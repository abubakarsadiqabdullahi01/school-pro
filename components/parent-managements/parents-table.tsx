"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Download, Filter, Loader2, MoreHorizontal, Search, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deleteParent } from "@/app/actions/parent-management"

interface Parent {
  id: string
  userId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  occupation: string
  gender: "MALE" | "FEMALE" | "OTHER" | null
  state: string
  lga: string
  address: string
  studentCount: number
  createdAt: Date
}

interface ParentsTableProps {
  parents: Parent[]
}

export function ParentsTable({ parents }: ParentsTableProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [genderFilter, setGenderFilter] = useState("all")
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [parentToDelete, setParentToDelete] = useState<Parent | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filter parents based on search query and gender filter
  const filteredParents = parents.filter((parent) => {
    const matchesSearch =
      parent.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.occupation.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesGender =
      genderFilter === "all" ||
      (genderFilter === "MALE" && parent.gender === "MALE") ||
      (genderFilter === "FEMALE" && parent.gender === "FEMALE") ||
      (genderFilter === "OTHER" && parent.gender === "OTHER") ||
      (genderFilter === "UNSPECIFIED" && parent.gender === null)

    return matchesSearch && matchesGender
  })

  // Handle parent deletion
  const handleDeleteClick = (parent: Parent) => {
    if (parent.studentCount > 0) {
      toast.error("Cannot Delete Parent", {
        description: "This parent has linked students. Please unlink all students first.",
      })
      return
    }

    setParentToDelete(parent)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!parentToDelete) return

    setIsDeleting(true)
    try {
      const result = await deleteParent(parentToDelete.id)

      if (result.success) {
        toast.success("Parent Deleted", {
          description: "The parent has been successfully deleted.",
        })
        setIsDeleteDialogOpen(false)
        router.refresh()
      } else {
        toast.error("Delete Failed", {
          description: result.error || "Failed to delete parent. Please try again.",
        })
      }
    } catch (error) {
      console.error("Error deleting parent:", error)
      toast.error("Delete Failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Parents</CardTitle>
            <CardDescription>Manage parents and their linked students</CardDescription>
          </div>
          <Button asChild>
            <Link href="/dashboard/admin/parents/create">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Parent
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger className="w-[180px]">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <span>Filter by Gender</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                  <SelectItem value="UNSPECIFIED">Unspecified</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact Information</TableHead>
                  <TableHead>Occupation</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Registration Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParents.length > 0 ? (
                  filteredParents.map((parent) => (
                    <TableRow key={parent.id}>
                      <TableCell className="font-medium">
                        {parent.firstName} {parent.lastName}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {parent.email && <span className="text-xs text-muted-foreground">{parent.email}</span>}
                          {parent.phone && <span className="text-sm">{parent.phone}</span>}
                        </div>
                      </TableCell>
                      <TableCell>{parent.occupation || "Not specified"}</TableCell>
                      <TableCell>
                        {parent.gender ? (
                          <Badge
                            variant={
                              parent.gender === "MALE"
                                ? "default"
                                : parent.gender === "FEMALE"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {parent.gender === "MALE" ? "Male" : parent.gender === "FEMALE" ? "Female" : "Other"}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not specified</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={parent.studentCount > 0 ? "default" : "outline"}>
                          {parent.studentCount} student{parent.studentCount !== 1 ? "s" : ""}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(parent.createdAt), "MMM d, yyyy")}</TableCell>
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
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/admin/parents/${parent.id}`}>View Details</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/admin/parents/${parent.id}/edit`}>Edit Parent</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteClick(parent)}
                              disabled={parent.studentCount > 0}
                            >
                              Delete Parent
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      {searchQuery || genderFilter !== "all"
                        ? "No parents found matching your filters."
                        : "No parents found in the system."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Parent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this parent? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {parentToDelete && (
            <div className="py-4">
              <p className="font-medium">
                {parentToDelete.firstName} {parentToDelete.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{parentToDelete.email}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting} className="gap-1">
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
