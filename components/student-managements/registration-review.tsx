"use client"

import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Plus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

interface RegistrationReviewProps {
  studentData: any
  credentialsData: any
  parentsData: any[]
  classData?: { name: string }
  termData?: { name: string }
  sessionData?: { name: string }
  onAddAnotherParent: () => void
  onSubmit: () => void
  onBack: () => void
  isSubmitting: boolean
}

export function RegistrationReview({
  studentData,
  credentialsData,
  parentsData,
  classData,
  termData,
  sessionData,
  onAddAnotherParent,
  onSubmit,
  onBack,
  isSubmitting,
}: RegistrationReviewProps) {
  // Get initials for avatar fallback
  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Student Information */}
        <Card>
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
            <CardDescription>Basic details of the student</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {studentData?.photoUrl ? (
                  <AvatarImage src={studentData.photoUrl || "/placeholder.svg"} alt="Student photo" />
                ) : null}
                <AvatarFallback className="text-lg">
                  {getInitials(studentData?.firstName || "", studentData?.lastName || "")}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">
                  {studentData?.firstName} {studentData?.lastName}
                </h3>
                <p className="text-sm text-muted-foreground">Admission No: {studentData?.admissionNumber}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Date of Birth</p>
                <p>{studentData?.dateOfBirth ? format(new Date(studentData.dateOfBirth), "PPP") : "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Gender</p>
                <Badge variant="outline">{studentData?.gender || "N/A"}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Phone</p>
                <p>{studentData?.phone || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Class</p>
                <p>{classData?.name || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Term</p>
                <p>{termData?.name || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Session</p>
                <p>{sessionData?.name || "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Login Credentials */}
        <Card>
          <CardHeader>
            <CardTitle>Login Credentials</CardTitle>
            <CardDescription>Student's login information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Login Type</p>
              <Badge variant="outline">Registration Number</Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Registration Number</p>
              <p>{studentData?.admissionNumber || "N/A"}</p>
            </div>
            <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p>{studentData.email || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Password</p>
              <p>••••••••</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Parents/Guardians */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Parents/Guardians</CardTitle>
            <CardDescription>
              {parentsData.length === 0
                ? "No parents/guardians added"
                : `${parentsData.length} parent(s)/guardian(s) added`}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onAddAnotherParent}>
            <Plus className="mr-2 h-4 w-4" />
            Add Another
          </Button>
        </CardHeader>
        <CardContent>
          {parentsData.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
              <p className="text-sm text-muted-foreground">No parents/guardians added yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {parentsData.map((parent, index) => (
                <div key={index} className="rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">
                      {parent.firstName} {parent.lastName}
                    </h4>
                    <Badge>{parent.relationship}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Phone</p>
                      <p>{parent.phone || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Email</p>
                      <p>{parent.email || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Occupation</p>
                      <p>{parent.occupation || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Login Access</p>
                      <Badge variant={parent.createLogin ? "default" : "outline"}>
                        {parent.createLogin ? "Yes" : "No"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Registering..." : "Complete Registration"}
        </Button>
      </div>
    </div>
  )
}
