import { prisma } from "@/lib/db"
import { AllClassesTable } from "@/components/class-management/admin-all-classes"
import { PageTransition } from "@/components/dashboard/page-transition"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminClassesPage() {
  const { school, schoolId } = await requireAdminSchool("academics.manage")

  // Fetch all classes for the admin's school along with terms
  const classes = await prisma.class.findMany({
    where: {
      schoolId,
    },
    include: {
      classTerms: {
        select: {
          term: {
            select: {
              id: true,
              name: true,
              session: {
                select: {
                  name: true,
                },
              },
            },
          },
          // Fees belong to a class term, so they are counted per term and summed.
          feeStructures: {
            select: {
              id: true,
            },
          },
        },
      },
      subjects: {
        select: {
          id: true,
        },
      },
    },
    orderBy: { name: "asc" },
  })

  // Format classes for the table
  const formattedClasses = classes.map((cls) => ({
    id: cls.id,
    name: cls.name,
    level: cls.level,
    schoolId,
    schoolName: school.name,
    schoolCode: school.code,
    subjectsCount: cls.subjects.length,
    termsCount: cls.classTerms.length,
    terms: cls.classTerms.length > 0 
      ? cls.classTerms.map(term => `${term.term.name} (${term.term.session.name})`).join(", ") 
      : "Not Assigned Term",
    feeStructuresCount: cls.classTerms.reduce(
      (total, classTerm) => total + classTerm.feeStructures.length,
      0,
    ),
  }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Classes</h2>
          <p className="text-muted-foreground">
            Manage classes for {school.name} ({school.code})
          </p>
        </div>

        <AllClassesTable classes={formattedClasses} />
        
      </div>
    </PageTransition>
  )
}
