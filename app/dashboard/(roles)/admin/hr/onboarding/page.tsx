import { redirect } from "next/navigation"

import { PageTransition } from "@/components/dashboard/page-transition"
import { OnboardingQueue } from "@/components/hr/onboarding-queue"
import { InfoGuide } from "@/components/ui/info-guide"
import { requirePermission } from "@/lib/authz"

export const metadata = { title: "Staff onboarding" }

export default async function HrOnboardingPage() {
  const actor = await requirePermission("payroll.manage").catch(() => null)
  if (!actor) redirect("/dashboard")

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Staff Onboarding</h1>
            <InfoGuide guideKey="hr.onboarding" />
          </div>
          <p className="text-muted-foreground">
            Everyone who has joined but whose file is not finished. A teacher added on the
            academic side now appears here automatically, with a staff number and an empty
            file, rather than being invisible to HR until somebody noticed.
          </p>
        </div>

        <OnboardingQueue />
      </div>
    </PageTransition>
  )
}
