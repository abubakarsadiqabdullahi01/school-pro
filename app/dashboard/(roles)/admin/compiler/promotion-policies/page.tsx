import { redirect } from "next/navigation"

import { getClassPromotionPolicies } from "@/app/actions/annual-results"
import { ClassPromotionPolicies } from "@/components/annual-results/class-promotion-policies"
import { PageTransition } from "@/components/dashboard/page-transition"
import { InfoGuide } from "@/components/ui/info-guide"
import { requirePermission } from "@/lib/authz"

export const metadata = { title: "Promotion rules by class" }

export default async function PromotionPoliciesPage() {
  const actor = await requirePermission("compiler.configure_policy").catch(() => null)
  if (!actor?.schoolId) redirect("/dashboard")

  const result = await getClassPromotionPolicies()

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Promotion Rules by Class</h1>
            <InfoGuide guideKey="compiler.promotionPolicies" />
          </div>
          <p className="text-muted-foreground">
            The bar each class has to clear — by average, by subjects passed, or by credits
            earned. Classes with no rules of their own follow the school default.
          </p>
        </div>

        {result.success ? (
          <ClassPromotionPolicies rows={result.data} />
        ) : (
          <p className="rounded-md border border-destructive/50 p-4 text-sm text-destructive">
            {result.error}
          </p>
        )}
      </div>
    </PageTransition>
  )
}
