import { StudentStatementView } from "@/components/finance/views/student-statement-view"

export default async function StudentStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StudentStatementView studentId={id} />
}
