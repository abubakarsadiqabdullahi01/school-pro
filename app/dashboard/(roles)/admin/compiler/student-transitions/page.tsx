import { PageTransition } from "@/components/dashboard/page-transition"
import { StudentTransitionsOverview } from "@/components/student-transitions/StudentTransitionsOverview"
import { PromotionPolicyForm } from "@/components/student-transitions/PromotionPolicyForm"
import { getTransitionPolicy } from "@/app/actions/student-transitions"
import { requireAdminSchool } from "@/lib/admin-page-context"
import { getEffectivePermissionsForCurrentUser } from "@/lib/authz"

export default async function AdminStudentTransitionsPage() {
  // The transitions are a registrar's job (students.manage) and the rules the Exams
  // Officer's (compiler.configure_policy): either opens the page, and only the second can
  // change the rules.
  const { school } = await requireAdminSchool(["students.manage", "compiler.configure_policy"])
  const canEditRules = (await getEffectivePermissionsForCurrentUser()).includes("compiler.configure_policy")

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
        promotionRules={policy.data ? <PromotionPolicyForm policy={policy.data} readOnly={!canEditRules} /> : null}
      />
    </PageTransition>
  )
}
