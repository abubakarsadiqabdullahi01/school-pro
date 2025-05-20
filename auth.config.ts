import type { NextAuthConfig } from "next-auth"
import type { Role } from "@prisma/client"

export const authConfig = {
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const isOnDashboard = request.nextUrl.pathname.startsWith("/dashboard")

      if (isOnDashboard) {
        if (isLoggedIn) return true
        return Response.redirect(new URL("/auth/login", request.nextUrl))
      } else if (isLoggedIn && request.nextUrl.pathname === "/auth/login") {
        return Response.redirect(new URL("/dashboard", request.nextUrl))
      }

      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.isActive = user.isActive
        token.avatarUrl = user.avatarUrl
      }
      return token
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
        session.user.firstName = token.firstName as string
        session.user.lastName = token.lastName as string
        session.user.isActive = token.isActive as boolean
        session.user.avatarUrl = token.avatarUrl as string | null
      }
      return session
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [], // We'll add providers in auth.ts
} satisfies NextAuthConfig

