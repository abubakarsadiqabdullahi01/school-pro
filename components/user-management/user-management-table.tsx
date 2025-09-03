"use client"

import { useState } from "react"
import Link from "next/link"
import { MoreHorizontal, Eye, Edit, Power, PowerOff, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toggleUserStatus } from "@/app/actions/user-management"
import { toast } from "sonner"
import Image from "next/image"

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


interface Column {
  key: string
  label: string
}

interface UserManagementTableProps {
  users: User[]
  userType: string // e.g., "admin", "teacher", "student", "parent"
  columns: Column[]
}

export function UserManagementTable({ users, userType, columns }: UserManagementTableProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.admissionNo && user.admissionNo.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  const handleToggleStatus = async (userId: string) => {
    setIsLoading(userId)
    try {
      const result = await toggleUserStatus(userId, userType)
      if (result.success) {
        toast.success("Success", { description: result.message })
      } else {
        toast.error("Error", { description: result.error })
      }
    } catch (error) {
      toast.error("Error", { description: "Failed to update user status" })
    } finally {
      setIsLoading(null)
    }
  }

  const getAddUserLink = () => {
    switch (userType) {
      case "admin":
        return "/dashboard/super-admin/users/admins/add"
      case "teacher":
        return "/dashboard/super-admin/users/teachers/add"
      case "student":
        return "/dashboard/admin/students/add"
      case "parent":
        return "/dashboard/admin/parents/add"
      default:
        return "#"
    }
  }

  const canAddUser = userType === "admin" || userType === "teacher" || userType === "student" || userType === "parent"

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="capitalize">{userType} Management</CardTitle>
          <CardDescription>Manage {userType} accounts across all schools</CardDescription>
        </div>
        {canAddUser && (
          <Button asChild>
            <Link href={getAddUserLink()}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add {userType.charAt(0).toUpperCase() + userType.slice(1)}
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Input
            placeholder={`Search ${userType}s by name, email${userType === "student" ? ", or admission number" : ""}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        {column.key === "name" ? (
                          <div className="flex items-center gap-3">
                            {user.avatarUrl ? (
                              <Image
                                src={user.avatarUrl}
                                alt={user.name}
                                className="h-8 w-8 rounded-full object-cover"
                                width={32}
                                height={32}
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                <span className="text-xs font-medium">
                                  {user.firstName?.[0] || ""}
                                  {user.lastName?.[0] || ""}
                                </span>
                              </div>
                            )}
                            <span className="font-medium">{user.name}</span>
                          </div>
                        ) : column.key === "status" ? (
                          <Badge variant={user.status === "Active" ? "default" : "secondary"}>{user.status}</Badge>
                        ) : column.key === "createdAt" ? (
                          new Date(user.createdAt).toLocaleDateString()
                        ) : (
                          user[column.key] || "N/A"
                        )}
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
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/super-admin/users/${userType}s/${user.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/super-admin/users/${userType}s/${user.id}/edit`}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit {userType.charAt(0).toUpperCase() + userType.slice(1)}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleToggleStatus(user.id)}
                            disabled={isLoading === user.id}
                          >
                            {user.status === "Active" ? (
                              <>
                                <PowerOff className="mr-2 h-4 w-4" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Power className="mr-2 h-4 w-4" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                    {searchQuery ? `No ${userType}s found matching your search.` : `No ${userType}s found.`}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
