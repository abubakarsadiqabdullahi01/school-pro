/* eslint-disable @next/next/no-img-element */
import type { SchoolBranding } from "@/lib/school-branding.server"

/**
 * The school letterhead for a printed page.
 *
 * Hidden on screen and shown only when printing, so the app keeps its own chrome while a
 * printed receipt, voucher or payslip carries the same masthead as the report card: logo,
 * uppercase school name, address, contact line, then the document title.
 *
 * Uses a plain <img> rather than next/image on purpose. next/image renders a sized,
 * lazy-loaded wrapper that browsers routinely omit from a print rendering; a bare img with
 * the remote src is what actually appears on paper.
 */
export function PrintHeader({
  school,
  title,
  reference,
}: {
  school: SchoolBranding | null
  title: string
  reference?: string | null
}) {
  return (
    <header className="hidden print:mb-4 print:block print:border-b print:border-neutral-400 print:pb-3">
      <div className="flex items-start gap-4">
        {school?.logoUrl && (
          <img src={school.logoUrl} alt="" className="h-16 w-16 shrink-0 object-contain" />
        )}
        <div className="flex-1 text-center">
          <p className="text-lg font-bold uppercase tracking-wide">{school?.name ?? "School"}</p>
          {school?.address && <p className="text-xs">{school.address}</p>}
          {(school?.phone || school?.email) && (
            <p className="text-xs">
              {[school?.phone ? `Tel: ${school.phone}` : null, school?.email ? `Email: ${school.email}` : null]
                .filter(Boolean)
                .join("  |  ")}
            </p>
          )}
          <p className="mt-2 text-sm font-semibold uppercase">{title}</p>
          {reference && <p className="text-xs">{reference}</p>}
        </div>
        {/* Balances the logo so the name stays optically centred on the page. */}
        {school?.logoUrl && <div className="h-16 w-16 shrink-0" aria-hidden />}
      </div>
    </header>
  )
}
