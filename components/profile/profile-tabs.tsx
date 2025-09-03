// components/profile/profile-tabs.tsx
"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProfileForm } from "@/components/profile/profile-form"
import { PasswordForm } from "./password-form"
import { ContactInfoForm } from "@/components/profile/contact-info-form"
import { RoleInfoCard } from "@/components/profile/role-info-card"
import { LoginHistoryTable } from "./login-history-table"
import { useState } from "react"

interface ProfileTabsProps {
  user: any
  roleData: any
}

export function ProfileTabs({ user, roleData }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState("general")

  return (
    <Tabs defaultValue="general" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="contact">Contact Info</TabsTrigger>
        <TabsTrigger value="role">Role Info</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-4">
        <ProfileForm user={user} />
      </TabsContent>

      <TabsContent value="password" className="space-y-4">
        <PasswordForm user={user} />
      </TabsContent>

      <TabsContent value="contact" className="space-y-4">
        <ContactInfoForm user={user} credentials={user.credentials} />
      </TabsContent>

      <TabsContent value="role" className="space-y-4">
        <RoleInfoCard user={user} roleData={roleData} />
      </TabsContent>

      <TabsContent value="security" className="space-y-4">
        <LoginHistoryTable userId={user.id} />
      </TabsContent>
    </Tabs>
  )
}