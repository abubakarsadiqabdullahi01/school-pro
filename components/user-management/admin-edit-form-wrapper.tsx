"use client"

import { AdminEditForm } from "@/components/user-management/admin-edit-form"

interface AdminEditFormWrapperProps {
  admin: {
    id: string
    permissions: string
    user: {
      id: string
      firstName: string
      lastName: string
      dateOfBirth: Date | null
      phone: string | null
      gender: string | null
      state: string | null
      lga: string | null
      address: string | null
      credentials: { value: string }[]
    }
    school: {
      id: string
      name: string
      code: string
    } | null
  }
  schools: {
    id: string
    name: string
    code: string
  }[]
}

export function AdminEditFormWrapper({ admin, schools }: AdminEditFormWrapperProps) {
  return <AdminEditForm admin={admin} schools={schools} />
}
