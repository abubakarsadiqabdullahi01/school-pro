import { getFinanceSetupData } from "@/app/actions/finance"
import { StudentPaymentForm } from "@/components/finance/student-payment-form"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function StudentPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>
}) {
  // studentId arrives from the debtor list's Pay action, so the cashier does not have to
  // search for a student they just clicked.
  const [{ studentId }, setup] = await Promise.all([searchParams, getFinanceSetupData()])

  // The classes of the term in progress: a parent at the counter names a class far more
  // often than an admission number.
  const currentTermId = setup.success
    ? (setup.data.terms.find((term) => term.isCurrent)?.id ?? setup.data.terms[0]?.id)
    : undefined
  const classes = setup.success
    ? setup.data.classTerms.filter((classTerm) => classTerm.termId === currentTermId)
    : []

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Student Payments</h1>
          <InfoGuide guideKey="finance.studentPayments" />
        </div>
        <p className="text-muted-foreground">
          Find the student, enter what they are paying against each fee, and record one receipt.
        </p>
      </div>
      <StudentPaymentForm basePath="/dashboard/admin/finance" initialStudentId={studentId} classes={classes} />
    </div>
  )
}
