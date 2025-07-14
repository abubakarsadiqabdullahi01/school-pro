"use client"

import { useState } from "react"
import { format } from "date-fns"
import {
  ArrowLeft,
  Edit,
  Mail,
  Phone,
  MapPin,
  Calendar,
  User,
  Shield,
  School,
  MoreHorizontal,
  UserCheck,
  UserX,
  Loader2,
  Power,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { toggleUserStatus, resetAdminPassword } from "@/app/actions/user-management"
import { motion } from "framer-motion"

interface AdminDetailsProps {
  admin: {
    id: string
    permissions: string
    user: {
      id: string
      firstName: string
      lastName: string
      avatarUrl: string | null
      dateOfBirth: Date | null
      phone: string | null
      gender: string | null
      state: string | null
      lga: string | null
      address: string | null
      isActive: boolean
      createdAt: Date
      updatedAt: Date
      credentials: { value: string }[]
    }
    school: {
      id: string
      name: string
      code: string
      address: string
      phone: string
      email: string
    } | null
  }
}

export function AdminDetails({ admin }: AdminDetailsProps) {
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const router = useRouter()

  const handleToggleStatus = async () => {
    try {
      setIsUpdatingStatus(true)
      const result = await toggleUserStatus(admin.user.id, "admin") // Pass userType

      if (result.success) {
        toast.success("Success", { description: result.message })
        router.refresh()
      } else {
        toast.error("Error", { description: result.error })
      }
    } catch (error) {
      toast.error("Error", { description: "Failed to update admin status" })
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleResetPassword = async () => {
    setIsResettingPassword(true)
    try {
      const result = await resetAdminPassword(admin.id)
      if (result.success && result.data && result.data.newPassword) {
        toast.success("Success", { description: `New password: ${result.data.newPassword}` })
      } else if (result.success) {
        toast.success("Success", { description: "Password reset successfully." })
      } else {
        toast.error("Error", { description: result.error })
      }
    } catch (error) {
      toast.error("Error", { description: "Failed to reset password" })
    } finally {
      setIsResettingPassword(false)
    }
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  const formatPermissions = (permissions: string) => {
    try {
      const perms = JSON.parse(permissions)
      return Array.isArray(perms) ? perms : [permissions]
    } catch {
      return [permissions]
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/super-admin/users/admins")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Admin Details</h2>
            <p className="text-muted-foreground">View and manage administrator information</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <MoreHorizontal className="h-4 w-4 mr-2" />
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Admin Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push(`/dashboard/super-admin/users/admins/${admin.id}/edit`)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Admin
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleResetPassword} disabled={isResettingPassword}>
              {isResettingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Power className="mr-2 h-4 w-4" />
                  Reset Password
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleToggleStatus}
              disabled={isUpdatingStatus}
              className={
                admin.user.isActive ? "text-destructive focus:text-destructive" : "text-green-600 focus:text-green-600"
              }
            >
              {admin.user.isActive ? (
                <>
                  <UserX className="mr-2 h-4 w-4" />
                  Deactivate Admin
                </>
              ) : (
                <>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Activate Admin
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Avatar className="h-24 w-24">
                <AvatarImage src={admin.user.avatarUrl || ""} />
                <AvatarFallback className="text-lg">
                  {getInitials(admin.user.firstName, admin.user.lastName)}
                </AvatarFallback>
              </Avatar>
            </div>
            <CardTitle className="text-xl">
              {admin.user.firstName} {admin.user.lastName}
            </CardTitle>
            <CardDescription className="flex items-center justify-center gap-2">
              <Shield className="h-4 w-4" />
              Administrator
            </CardDescription>
            <div className="flex justify-center">
              <Badge variant={admin.user.isActive ? "default" : "destructive"}>
                {admin.user.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Details Cards */}
        <div className="md:col-span-2 space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{admin.user.credentials[0]?.value || "Not provided"}</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{admin.user.phone || "Not provided"}</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Gender</label>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{admin.user.gender || "Not specified"}</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {admin.user.dateOfBirth
                        ? format(new Date(admin.user.dateOfBirth), "MMM d, yyyy")
                        : "Not provided"}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <label className="text-sm font-medium text-muted-foreground">Address</label>
                <div className="flex items-start gap-2 mt-1">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div>{admin.user.address || "Not provided"}</div>
                    {(admin.user.lga || admin.user.state) && (
                      <div className="text-sm text-muted-foreground">
                        {admin.user.lga && `${admin.user.lga}, `}
                        {admin.user.state}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* School Assignment */}
          {admin.school && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <School className="h-5 w-5" />
                  School Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">School Name</label>
                    <div className="mt-1 font-medium">{admin.school.name}</div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">School Code</label>
                    <div className="mt-1">
                      <Badge variant="outline">{admin.school.code}</Badge>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">School Email</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{admin.school.email}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">School Phone</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{admin.school.phone}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">School Address</label>
                  <div className="flex items-start gap-2 mt-1">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span>{admin.school.address}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Permissions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Permissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {formatPermissions(admin.permissions).map((permission, index) => (
                  <Badge key={index} variant="secondary">
                    {permission.replace(/_/g, " ")} {/* Format permission string */}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created</label>
                  <div className="mt-1">{format(new Date(admin.user.createdAt), "MMM d, yyyy 'at' h:mm a")}</div>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                  <div className="mt-1">{format(new Date(admin.user.updatedAt), "MMM d, yyyy 'at' h:mm a")}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}
