import { PageTransition } from "@/components/dashboard/page-transition"
import { StudentTransitionsOverview } from "@/components/student-transitions/StudentTransitionsOverview"
import { PromotionPolicyForm } from "@/components/student-transitions/PromotionPolicyForm"
import { getTransitionPolicy } from "@/app/actions/student-transitions"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminStudentTransitionsPage() {
  const { school } = await requireAdminSchool("compiler.configure_policy")

  // The rules live next to the screen that applies them, so an admin can see why a
  // promotion was refused and change the rule without hunting through settings.
  const policy = await getTransitionPolicy()

  return (
    <PageTransition>
      <div className="space-y-6">
        {policy.data && <PromotionPolicyForm policy={policy.data} />}
        <StudentTransitionsOverview
          schoolId={school.id}
          schoolName={school.name}
          schoolCode={school.code}
        />
      </div>
    </PageTransition>
  )
}
