"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function RoleInfoCard({ user, roleData }: { user: any; roleData: any }) {
  // Format role name for display
  const formatRoleName = (role: string) => {
    return role.charAt(0) + role.slice(1).toLowerCase().replace("_", " ")
  }

  // Render different content based on user role
  const renderRoleContent = () => {
    switch (user.role) {
      case "STUDENT":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Grade</h3>
                <p>{roleData?.grade || "Not specified"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Section</h3>
                <p>{roleData?.section || "Not specified"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Admission Date</h3>
                <p>
                  {roleData?.admissionDate ? new Date(roleData.admissionDate).toLocaleDateString() : "Not specified"}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Student ID</h3>
                <p>{roleData?.id || "Not specified"}</p>
              </div>
            </div>
          </div>
        )

      case "TEACHER":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Department</h3>
                <p>{roleData?.department || "Not specified"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Subjects</h3>
                <p>{roleData?.subjects || "Not specified"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Joining Date</h3>
                <p>{roleData?.joiningDate ? new Date(roleData.joiningDate).toLocaleDateString() : "Not specified"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Teacher ID</h3>
                <p>{roleData?.id || "Not specified"}</p>
              </div>
            </div>
          </div>
        )

      case "PARENT":
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Children</h3>
            {roleData?.children && roleData.children.length > 0 ? (
              <div className="space-y-3">
                {roleData.children.map((child: any) => (
                  <div key={child.id} className="flex items-center space-x-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={child.user?.avatarUrl || "/placeholder.svg?height=40&width=40"}
                        alt={child.user?.firstName}
                      />
                      <AvatarFallback>
                        {child.user?.firstName?.charAt(0)}
                        {child.user?.lastName?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {child.user?.firstName} {child.user?.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">Student</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No children associated with this account</p>
            )}
          </div>
        )

      case "ADMIN":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Department</h3>
                <p>{roleData?.department || "Not specified"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Admin Level</h3>
                <p>{roleData?.adminLevel || "Standard"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Joining Date</h3>
                <p>{roleData?.joiningDate ? new Date(roleData.joiningDate).toLocaleDateString() : "Not specified"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Admin ID</h3>
                <p>{roleData?.id || "Not specified"}</p>
              </div>
            </div>
          </div>
        )

      case "SUPER_ADMIN":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Access Level</h3>
                <p>Full System Access</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Super Admin ID</h3>
                <p>{roleData?.id || "Not specified"}</p>
              </div>
            </div>
          </div>
        )

      default:
        return <p>No role-specific information available</p>
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Role Information</CardTitle>
          <Badge>{formatRoleName(user.role)}</Badge>
        </div>
        <CardDescription>Your role-specific information and details</CardDescription>
      </CardHeader>
      <CardContent>{renderRoleContent()}</CardContent>
    </Card>
  )
}

