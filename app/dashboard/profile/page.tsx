import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { ProfileTabs } from "@/components/profile/profile-tabs"
import { prisma } from "@/lib/db"

export default async function ProfilePage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  // Fetch the user with their credentials
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      credentials: {
        where: {
          type: {
            in: ["EMAIL", "PHONE", "REGISTRATION_NUMBER"],
          },
        },
        select: {
          id: true,
          type: true,
          value: true,
          isPrimary: true,
          lastUsedAt: true,
        },
      },
    },
  })

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch role-specific data
  let roleData = null

  switch (user.role) {
    case "STUDENT":
      roleData = await prisma.student.findUnique({
        where: { userId: user.id },
      })
      break
    case "TEACHER":
      roleData = await prisma.teacher.findUnique({
        where: { userId: user.id },
      })
      break
    case "PARENT":
      roleData = await prisma.parent.findUnique({
        where: { userId: user.id },
        include: {
          students: {
            include: {
              student: {
                include: {
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
      break
    case "ADMIN":
      roleData = await prisma.admin.findUnique({
        where: { userId: user.id },
      })
      break
    case "SUPER_ADMIN":
      roleData = await prisma.superAdmin.findUnique({
        where: { userId: user.id },
      })
      break
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Profile</h2>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <ProfileTabs user={user} roleData={roleData} />
    </div>
  )
}

