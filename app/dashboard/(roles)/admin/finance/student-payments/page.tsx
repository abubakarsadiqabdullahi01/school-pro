import { StudentPaymentForm } from "@/components/finance/student-payment-form"

export default async function StudentPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>
}) {
  // studentId arrives from the debtor list's Pay action, so the cashier does not have to
  // search for a student they just clicked.
  const { studentId } = await searchParams
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Student Payments</h1>
        <p className="text-muted-foreground">Search a student, select unpaid charges, and allocate one receipt across fee items.</p>
      </div>
      <StudentPaymentForm basePath="/dashboard/admin/finance" initialStudentId={studentId} />
    </div>
  )
}
