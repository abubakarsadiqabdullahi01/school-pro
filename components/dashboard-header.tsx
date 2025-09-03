"use client"

import { useState } from "react"
import Link from "next/link"
import { Bell, LogOut, Moon, Search, Settings, Sun, User } from "lucide-react"
import { signOut } from "next-auth/react"
import type { Role } from "@prisma/client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/theme-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"

interface HeaderProps {
  userRole: Role
  userName?: string
  userAvatar?: string | null
}

export function DashboardHeader({ userRole, userName, userAvatar }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const [showSearch, setShowSearch] = useState(false)

  // Get role display name
  const getRoleDisplayName = (role: Role) => {
    switch (role) {
      case "SUPER_ADMIN":
        return "Super Admin"
      case "ADMIN":
        return "Administrator"
      case "TEACHER":
        return "Teacher"
      case "PARENT":
        return "Parent"
      case "STUDENT":
        return "Student"
      default:
        return "User"
    }
  }

  // Get initials from name
  const getInitials = () => {
    if (!userName) return userRole.charAt(0)

    const nameParts = userName.split(" ")
    if (nameParts.length >= 2) {
      return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
    }
    return userName[0].toUpperCase()
  }

  // Handle logout
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/auth/login" })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      <SidebarTrigger className="lg:hidden" />

      <div className="w-full flex items-center gap-4 md:gap-8">
        {!showSearch && (
          <div className="hidden md:flex">
            <h1 className="text-lg font-semibold">
              Welcome, <span className="text-primary">{userName || getRoleDisplayName(userRole)}</span>
            </h1>
          </div>
        )}

        <div className={cn("flex-1", showSearch ? "block" : "hidden md:block")}>
          <form className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="w-full bg-background pl-8 md:w-[300px] lg:w-[400px]"
            />
          </form>
        </div>

        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowSearch(!showSearch)}>
          <Search className="h-5 w-5" />
          <span className="sr-only">Search</span>
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="sr-only">Toggle theme</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  {userAvatar ? (
                  <AvatarImage src={userAvatar} alt={userName || "User"} />
                  ) : (
                  <AvatarFallback>
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                  )}
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{userName || "User"}</p>
                  <p className="text-xs leading-none text-muted-foreground">{getRoleDisplayName(userRole)}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

