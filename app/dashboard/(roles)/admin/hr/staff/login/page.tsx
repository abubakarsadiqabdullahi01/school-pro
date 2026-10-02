import { redirect } from "next/navigation"

/**
 * Logins are now created from the staff member's HR record (Create login), for teachers and
 * accountants alike. Old links land on that record, or on HR onboarding without one.
 */
export default async function LegacyStaffLogin({ searchParams }: { searchParams: Promise<{ fromStaff?: string | string[] }> }) {
  const { fromStaff } = await searchParams
  redirect(typeof fromStaff === "string" && /^[0-9a-f-]{36}$/i.test(fromStaff)
    ? `/dashboard/admin/hr/staff/${fromStaff}`
    : "/dashboard/admin/hr/staff/new")
}
