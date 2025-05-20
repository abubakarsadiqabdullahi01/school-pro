import type { Role } from "@prisma/client"
import "next-auth"

declare module "next-auth" {
  interface User {
    firstName: string
    lastName: string
    role: Role
    isActive: boolean
    avatarUrl?: string | null
  }

  interface Session {
    user: {
      id: string
      firstName: string
      lastName: string
      role: Role
      isActive: boolean
      avatarUrl?: string | null
      email?: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    firstName: string
    lastName: string
    role: Role
    isActive: boolean
    avatarUrl?: string | null
  }
}

