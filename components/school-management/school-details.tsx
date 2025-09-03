"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Building, Users, GraduationCap, BookOpen, Calendar, Mail, Phone, Globe, MapPin, Edit, Power, PowerOff, Trash2 } from 'lucide-react'
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { toggleSchoolStatus, deleteSchool } from "@/app/actions/school-management"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface SchoolDetailsProps {
  school: {
    id: string
    name: string
    code: string
    address: string
    phone: string
    email: string
    website?: string | null
    logoUrl?: string | null
    isActive: boolean
    createdAt: Date
    _count: {
      students: number
      teachers: number
      admins: number
      sessions: number
      classes: number
      subjects: number
    }
    sessions: Array<{
      id: string
      name: string
      startDate: Date
      endDate: Date
      isCurrent: boolean
      terms: Array<{ id: string }>
    }>
    admins: Array<{
      id: string
      user: {
        firstName: string
        lastName: string
        credentials: Array<{ value: string }>
      }
    }>
  }
}

export function SchoolDetails({ school }: SchoolDetailsProps) {
  const router = useRouter()
  const [isToggling, setIsToggling] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleToggleStatus = async () => {
    setIsToggling(true)
    try {
      const result = await toggleSchoolStatus(school.id)
      if (result.success) {
        toast.success(result.data?.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Failed to update school status")
    } finally {
      setIsToggling(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteSchool(school.id)
      if (result.success) {
        toast.success(result.message)
        router.push("/dashboard/super-admin/schools")
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Failed to delete school")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          {school.logoUrl ? (
            <Image
              src={school.logoUrl}
              alt={`${school.name} logo`}
              className="h-16 w-16 rounded-lg object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
              <Building className="h-8 w-8 text-primary" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold">{school.name}</h1>
            <p className="text-muted-foreground">Code: {school.code}</p>
            <Badge variant={school.isActive ? "default" : "destructive"}>
              {school.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/super-admin/schools/${school.id}/edit`)}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit School
          </Button>
          <Button
            variant={school.isActive ? "destructive" : "default"}
            onClick={handleToggleStatus}
            disabled={isToggling}
          >
            {school.isActive ? (
              <>
                <PowerOff className="mr-2 h-4 w-4" />
                {isToggling ? "Deactivating..." : "Deactivate"}
              </>
            ) : (
              <>
                <Power className="mr-2 h-4 w-4" />
                {isToggling ? "Activating..." : "Activate"}
              </>
            )}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete School</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this school? This action cannot be undone.
                  Schools with active students or teachers cannot be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Students</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{school._count.students}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Teachers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{school._count.teachers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Classes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{school._count.classes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{school._count.sessions}</div>
          </CardContent>
        </Card>
      </div>

      {/* School Information */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>School Information</CardTitle>
            <CardDescription>Basic details about the school</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{school.address}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{school.phone}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{school.email}</span>
            </div>
            {school.website && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <a 
                  href={school.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {school.website}
                </a>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="text-sm">{format(new Date(school.createdAt), "PPP")}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Administrators</CardTitle>
            <CardDescription>School administrators and their contact information</CardDescription>
          </CardHeader>
          <CardContent>
            {school.admins.length > 0 ? (
              <div className="space-y-3">
                {school.admins.map((admin) => (
                  <div key={admin.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {admin.user.firstName} {admin.user.lastName}
                      </p>
                      {admin.user.credentials.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {admin.user.credentials[0].value}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No administrators assigned</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Academic Sessions</CardTitle>
          <CardDescription>Latest academic sessions for this school</CardDescription>
        </CardHeader>
        <CardContent>
          {school.sessions.length > 0 ? (
            <div className="space-y-3">
              {school.sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{session.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(session.startDate), "MMM yyyy")} - {format(new Date(session.endDate), "MMM yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={session.isCurrent ? "default" : "outline"}>
                      {session.isCurrent ? "Current" : "Inactive"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {session.terms.length} term{session.terms.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No academic sessions found</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
