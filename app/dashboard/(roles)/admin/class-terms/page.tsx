import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { ClassTermsTable } from "@/components/class-term-management/class-terms-table"

export default async function AdminClassTermsPage() {
  const session = await auth()

  // Check if user is admin
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  // Get the admin's assigned school
  const admin = await prisma.admin.findUnique({
    where: { userId: session.user.id },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  if (!admin || !admin.school) {
    redirect("/dashboard/access-error")
  }

  // Get current terms for the school
  const currentTerms = await prisma.term.findMany({
    where: {
      isCurrent: true,
      session: {
        schoolId: admin.schoolId!,
      },
    },
    include: {
      session: true,
    },
    orderBy: {
      startDate: "desc",
    },
    take: 1,
  })

  const currentTerm = currentTerms.length > 0 ? currentTerms[0] : null

  // Get all classes for the school
  const classes = await prisma.class.findMany({
    where: {
      schoolId: admin.schoolId!,
    },
    orderBy: {
      name: "asc",
    },
    include: {
      classTerms: {
        where: {
          termId: currentTerm?.id,
        },
        include: {
          term: true,
        },
      },
    },
  })

  // Format classes for the table
  const formattedClasses = classes.map((cls) => ({
    id: cls.id,
    name: cls.name,
    level: cls.level,
    isAssignedToCurrentTerm: cls.classTerms.length > 0,
    classTermId: cls.classTerms[0]?.id || null,
  }))

  // After fetching currentTerm
  const sessionDetails = currentTerm ? await prisma.session.findUnique({
    where: { id: currentTerm.sessionId },
  }) : null;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Class Term Management</h2>
          <p className="text-muted-foreground">
            Manage classes for {currentTerm ? `${currentTerm.name} (${sessionDetails ? sessionDetails.name : "No session"})` : "No current term"}
          </p>
        </div>
        {currentTerm ? (
          <ClassTermsTable
            classes={formattedClasses}
            currentTerm={{
              id: currentTerm.id,
              name: currentTerm.name,
              sessionName: sessionDetails ? sessionDetails.name : "No session",
            }}
          />
        ) : (
          <div className="rounded-md bg-yellow-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">No Current Term</h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    There is no current term set for your school. Please contact a super admin to set a current term
                    before managing class terms.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
