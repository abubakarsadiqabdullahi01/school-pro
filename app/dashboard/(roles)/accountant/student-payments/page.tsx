import { StudentPaymentForm } from "@/components/finance/student-payment-form"

export default async function AccountantStudentPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>
}) {
  const { studentId } = await searchParams
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Student Payments</h1>
        <p className="text-muted-foreground">Search a student, select unpaid charges, and allocate one receipt across fee items.</p>
      </div>
      <StudentPaymentForm basePath="/dashboard/accountant" initialStudentId={studentId} />
    </div>
  )
}
