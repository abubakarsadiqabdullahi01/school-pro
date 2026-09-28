import { ExpenseCategoriesView } from "@/components/expenditure/views/expense-categories-view"

// Admin tree only. Configuring categories is the admin's authority, and the write actions
// refuse an accountant regardless of the URL reached.
export default async function ExpenseCategoriesPage({
  searchParams,
}: {
  // Handed on whole rather than picked apart here: the screen's filters are checked in one
  // place, so a page cannot quietly forget to pass one on.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <ExpenseCategoriesView basePath="/dashboard/admin/expenditure" searchParams={await searchParams} />
}
