import { PageTransition } from "@/components/dashboard/page-transition"
import { StudentTransitionsOverview } from "@/components/student-transitions/StudentTransitionsOverview"
import { PromotionPolicyForm } from "@/components/student-transitions/PromotionPolicyForm"
import { getTransitionPolicy } from "@/app/actions/student-transitions"
import { requireAdminSchool } from "@/lib/admin-page-context"

export default async function AdminStudentTransitionsPage() {
  const { school } = await requireAdminSchool("compiler.configure_policy")

  // The rules still live on the same screen as the transitions that apply them — an admin
  // who has just been told a promotion was refused should not have to hunt through settings
  // to see why. They are a tab rather than a panel above the page, so the task is what you
  // land on and the configuration is one click away rather than always in the way.
  const policy = await getTransitionPolicy()

  return (
    <PageTransition>
      <StudentTransitionsOverview
        schoolId={school.id}
        schoolName={school.name}
        schoolCode={school.code}
        promotionRules={policy.data ? <PromotionPolicyForm policy={policy.data} /> : null}
      />
    </PageTransition>
  )
}
