import { PageTransition } from "@/components/dashboard/page-transition"
import { BackButton } from "@/components/back-button"
import { TraitRatingsGrid } from "@/components/teacher/trait-ratings-grid"
import { getClassTraitRatings } from "@/app/actions/teacher-traits"
import { InfoGuide } from "@/components/ui/info-guide"

interface ClassTraitsPageProps {
  params: Promise<{ classTermId: string }>
}

export default async function ClassTraitsPage({ params }: ClassTraitsPageProps) {
  const { classTermId } = await params

  // The action carries the authorization: it refuses a class term this teacher
  // is not assigned to, so there is no second check to keep in step here.
  const result = await getClassTraitRatings(classTermId)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <BackButton fallbackHref="/dashboard/teacher/my-classes" />
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Behaviour &amp; Skills</h1>
            <InfoGuide guideKey="teacher.traits" />
          </div>
          <p className="text-muted-foreground">
            Rate each student&apos;s affective and psychomotor traits for the term. They print on the
            report sheet.
          </p>
        </div>

        {result.success ? (
          <TraitRatingsGrid
            classTermId={classTermId}
            className={result.data.className}
            termName={result.data.termName}
            sessionName={result.data.sessionName}
            traits={result.data.traits}
            students={result.data.students}
          />
        ) : (
          <p className="text-destructive">{result.error}</p>
        )}
      </div>
    </PageTransition>
  )
}
