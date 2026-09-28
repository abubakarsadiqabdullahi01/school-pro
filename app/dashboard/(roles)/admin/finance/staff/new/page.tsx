import { getFinanceOfficers } from "@/app/actions/finance"
import { BackButton } from "@/components/back-button"
import { FinanceStaffCreateForm } from "@/components/finance/finance-staff-create-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function NewFinanceStaffPage() {
  // The addresses already in use here, so a clash is caught as it is typed. A clash with
  // an account at another school is only caught by the server, which is where the
  // platform-wide uniqueness lives.
  const officers = await getFinanceOfficers()
  const takenEmails = officers.success
    ? officers.data
        .filter((officer) => officer.email)
        .map((officer) => ({ userId: officer.userId, email: officer.email as string }))
    : []

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/dashboard/admin/finance/staff" />
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Add Finance Officer</h1>
          <InfoGuide guideKey="finance.staff" />
        </div>
        <p className="text-muted-foreground">
          An accountant who collects fees on the school&apos;s behalf. Their sign-in details are shown
          once, when the account is created.
        </p>
      </div>
      <FinanceStaffCreateForm basePath="/dashboard/admin/finance" takenEmails={takenEmails} />
    </div>
  )
}
