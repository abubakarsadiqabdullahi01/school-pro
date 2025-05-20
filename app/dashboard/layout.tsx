import type React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardLayoutClient } from "@/components/dashboard/dashboard-layout-client";

export const metadata = {
  title: "Dashboard | SchoolPro",
  description: "SchoolPro dashboard for managing school operations",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Get the user session
  const session = await auth();

  // If no session, redirect to login
  if (!session || !session.user) {
    redirect("/auth/login");
  }

  const userRole = session.user.role || "STUDENT";
  const userName = `${session.user.firstName} ${session.user.lastName}`;

  return (
    <DashboardLayoutClient userRole={userRole} userName={userName} userAvatar={session.user.avatarUrl}>
      {children}
    </DashboardLayoutClient>
  );
}