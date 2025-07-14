"use client"

import { useState } from "react"
import Link from "next/link"
import { MoreHorizontal, Eye, Edit, Power, PowerOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { toggleUserStatus } from "@/app/actions/user-management" // Assuming this is a Server Action

interface TableActionsProps {
  userId: string
  userType: string
  status: string
}

export function TableActions({ userId, userType, status }: TableActionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleToggleStatus = async () => {
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

  return (
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
          <Link href={`/dashboard/super-admin/users/${userType}s/${userId}`}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/super-admin/users/${userType}s/${userId}/edit`}>
            <Edit className="mr-2 h-4 w-4" />
            Edit {userType.charAt(0).toUpperCase() + userType.slice(1)}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleToggleStatus} disabled={isLoading === userId}>
          {isLoading === userId ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : status === "Active" ? (
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
  )
}
