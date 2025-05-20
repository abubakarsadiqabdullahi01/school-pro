"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ChevronDown, Download, Edit, MoreHorizontal, Search, Trash2, UserPlus } from "lucide-react"

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface Column {
  key: string
  label: string
}

interface User {
  id: string
  name: string
  firstName?: string
  lastName?: string
  avatarUrl?: string | null
  email: string
  role: string
  status: string
  createdAt: Date
  [key: string]: any
}

interface UserManagementTableProps {
  users: User[]
  userType: string
  columns: Column[]
}

export function UserManagementTable({ users, userType, columns }: UserManagementTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  // Filter users based on search query
  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Format date for display
  const formatDate = (date: Date) => {
    return format(new Date(date), "MMM d, yyyy")
  }

  // Get status badge
  const getStatusBadge = (status: string) => {
    if (status === "Active") {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-50">
          Active
        </Badge>
      )
    } else {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 hover:bg-red-50">
          Inactive
        </Badge>
      )
    }
  }

  // Get user initials for avatar fallback
  const getUserInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    }

    // If firstName and lastName aren't available, use the name field
    const nameParts = user.name.split(" ")
    if (nameParts.length >= 2) {
      return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
    }
    return user.name.charAt(0).toUpperCase()
  }

  // Handle edit user
  const handleEditUser = (userId: string) => {
    router.push(`/dashboard/super-admin/users/edit/${userId}`)
  }

  // Handle view user
  const handleViewUser = (userId: string) => {
    router.push(`/dashboard/super-admin/users/view/${userId}`)
  }

  // Add a new handler function for adding a user
  const handleAddUser = () => {
    router.push(`/dashboard/super-admin/users/${userType}s/add`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder={`Search ${userType}s...`}
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
          <Button onClick={handleAddUser}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add {userType.charAt(0).toUpperCase() + userType.slice(1)}
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                {columns.map((column) => (
                  <TableHead key={column.key} className="whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {column.label}
                      <ChevronDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 2} className="h-24 text-center">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatarUrl || ""} alt={user.name} />
                        <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell key={`${user.id}-${column.key}`} className="whitespace-nowrap">
                        {column.key === "status"
                          ? getStatusBadge(user[column.key])
                          : column.key === "createdAt"
                            ? formatDate(user[column.key])
                            : user[column.key]}
                      </TableCell>
                    ))}
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
                          <DropdownMenuItem onClick={() => handleViewUser(user.id)}>View details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditUser(user.id)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive">
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
    </div>
  )
}

