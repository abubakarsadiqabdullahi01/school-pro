import { redirect } from "next/navigation"

export default async function LegacyTeacherCreation({ searchParams }: { searchParams: Promise<{ fromStaff?: string }> }) {
  const { fromStaff } = await searchParams
  redirect(typeof fromStaff === "string"
    ? `/dashboard/admin/hr/staff/${encodeURIComponent(fromStaff)}`
    : "/dashboard/admin/hr/staff/new")
}
