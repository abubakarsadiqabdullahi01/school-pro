import { Badge } from "@/components/ui/badge"

/**
 * One status, rendered the same way everywhere.
 *
 * The wording is what a bursar would say rather than the enum name: PENDING_APPROVAL reads
 * as "Awaiting approval", and a CANCELLED expense says "Cancelled" rather than pretending
 * it was never there.
 */
const PRESENTATION: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  PENDING_APPROVAL: { label: "Awaiting approval", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  APPROVED: { label: "Approved", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  PAID: { label: "Paid", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  REJECTED: { label: "Rejected", className: "bg-destructive/15 text-destructive" },
  CANCELLED: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
}

export function ExpenseStatusBadge({ status }: { status: string }) {
  const presentation = PRESENTATION[status] ?? { label: status, className: "bg-muted text-muted-foreground" }
  return (
    <Badge variant="outline" className={`border-0 font-medium ${presentation.className}`}>
      {presentation.label}
    </Badge>
  )
}

/** The same wording, for a PDF or CSV cell where a badge cannot go. */
export function expenseStatusLabel(status: string): string {
  return PRESENTATION[status]?.label ?? status
}
