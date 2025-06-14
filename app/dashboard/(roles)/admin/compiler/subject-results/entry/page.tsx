import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { PageTransition } from "@/components/dashboard/page-transition"
import { SubjectResultEntry } from "@/components/score-entry/SubjectResultEntry"
import type { ClassLevel } from "@prisma/client"

interface School {
  id: string
  name: string
  code: string
  logoUrl: string | null
}

interface Term {
  id: string
  name: string
  isCurrent: boolean
  session: {
    id: string
    name: string
  }
}

interface Admin {
  school: School | null
  schoolId: string
}

async function fetchPageData(
  userId: string,
  role: string,
): Promise<{
  admin: Admin | null
  currentTerm: Term | null
  terms: Term[]
}> {
  try {
    const [admin, currentTerm, terms] = await Promise.all([
      prisma.admin.findUnique({
        where: { userId },
        include: {
          school: {
            select: {
              id: true,
              name: true,
              code: true,
              logoUrl: true,
            },
          },
        },
      }),
      prisma.term.findFirst({
        where: {
          isCurrent: true,
          session: {
            schoolId: {
              equals:
                role === "ADMIN"
                  ? (
                      await prisma.admin.findUnique({
                        where: { userId },
                        select: { schoolId: true },
                      })
                    )?.schoolId
                  : undefined,
            },
          },
        },
        include: {
          session: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.term.findMany({
        where: {
          session: {
            schoolId: {
              equals:
                role === "ADMIN"
                  ? (
                      await prisma.admin.findUnique({
                        where: { userId },
                        select: { schoolId: true },
                      })
                    )?.schoolId
                  : undefined,
            },
          },
        },
        include: {
          session: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ isCurrent: "desc" }, { session: { startDate: "desc" } }, { startDate: "desc" }],
        take: 50,
      }),
    ])

    return { admin, currentTerm, terms }
  } catch (error) {
    console.error("Failed to fetch page data:", error)
    throw new Error("Unable to load page data")
  }
}

export default async function AdminSubjectResultEntryPage() {
  const session = await auth()

  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN")) {
    redirect("/dashboard?error=unauthorized")
  }

  let admin: Admin | null
  let currentTerm: Term | null
  let terms: Term[]

  try {
    ;({ admin, currentTerm, terms } = await fetchPageData(session.user.id, session.user.role))
  } catch (error) {
    console.error("Error in AdminSubjectResultEntryPage:", error)
    redirect("/dashboard?error=data-fetch-failed")
  }

  if (!admin || !admin.school) {
    redirect("/dashboard?error=admin-not-assigned-to-school")
  }

  if (terms.length === 0) {
    redirect("/dashboard?error=no-terms-found")
  }

  const effectiveTermId = currentTerm?.id ?? terms[0].id
  const classLevels: ClassLevel[] = ["PRIMARY", "JSS", "SSS"]

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Subject Result Entry</h2>
          <p className="text-muted-foreground">
            Enter and manage subject results for {admin.school.name} ({admin.school.code})
          </p>
        </div>

        <SubjectResultEntry
          schoolId={admin.school.id}
          schoolName={admin.school.name}
          schoolCode={admin.school.code}
          schoolLogo={admin.school.logoUrl}
          terms={terms}
          currentTermId={effectiveTermId}
          classLevels={classLevels}
        />
      </div>
    </PageTransition>
  )
}
