import { StudentStatementView } from "@/components/finance/views/student-statement-view"

export default async function AccountantStudentStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StudentStatementView studentId={id} />
}
