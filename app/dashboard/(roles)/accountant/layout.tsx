import type React from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"

// Guards the whole /dashboard/accountant subtree. The shared dashboard layout only checks
// that a session exists, so without this any signed-in user could reach student balances
// and the payment screen by typing the URL.
//
// This tree exists because an admin holds every power in the school, so finance lives at
// /dashboard/admin/finance for them; an accountant is assigned finance only, and the admin
// layout would bounce them. Both trees render the same views from components/finance/views,
// parameterised by basePath — the only difference is which pages exist here. Fee setup and
// discount/exemption approval are deliberately absent: they are the admin's to grant, and
// the actions behind them require a finance manager regardless of the URL reached.
export default async function AccountantSectionLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  if (session.user.role !== "ACCOUNTANT") {
    redirect("/dashboard/access-error")
  }

  return <>{children}</>
}
