import { redirect } from "next/navigation"

/**
 * `Create Fee` used to be one screen carrying the category form and the schedule form side
 * by side. They are separate screens now; a bookmark or a link from elsewhere in the app
 * lands on the one that bills students, which is what `Create Fee` meant in practice.
 */
export default function CreateFeeRedirectPage() {
  redirect("/dashboard/admin/finance/fees/schedules/new")
}
