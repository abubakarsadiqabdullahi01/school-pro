"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { LoadingSpinner } from "@/components/dashboard/loading-spinner"

export default function RedirectBasedOnRole() {
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === "loading") return

    if (status === "unauthenticated") {
      router.push("/auth/login")
      return
    }

    if (session?.user?.role) {
      switch (session.user.role) {
        case "SUPER_ADMIN":
          router.push("/dashboard/super-admin")
          break
        case "ADMIN":
          router.push("/dashboard/admin")
          break
        case "TEACHER":
          router.push("/dashboard/teacher")
          break
        case "STUDENT":
          router.push("/dashboard/student")
          break
        case "PARENT":
          router.push("/dashboard/parent")
          break
        default:
          // Fallback to access error if role is not recognized
          router.push("/dashboard/access-error")
      }
    } else {
      // Fallback to login if no role is found
      router.push("/auth/login")
    }
  }, [router, session, status])

  return <LoadingSpinner message="Redirecting to your dashboard..." />
}

