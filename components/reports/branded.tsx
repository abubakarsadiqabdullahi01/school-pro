import type { ComponentProps } from "react"

import { DocumentDownload, type PrintableDocument } from "@/components/reports/document-download"
import { PrintHeader } from "@/components/reports/print-header"
import { ReportExport } from "@/components/reports/report-export"
import { getSchoolBranding } from "@/lib/school-branding.server"

/**
 * Server wrappers that put the school letterhead on a document without every view having to
 * fetch it.
 *
 * `ReportExport`, `DocumentDownload` and `PrintHeader` are client components and cannot
 * reach a server-only helper, so the branding is resolved here and handed down. Any new
 * report gets the letterhead by using these rather than the bare components — which is the
 * point: finance, expenditure and HR previously each printed their own idea of a header,
 * and none of them matched the compiler's report card.
 */

export async function BrandedReportExport(props: Omit<ComponentProps<typeof ReportExport>, "school">) {
  const school = await getSchoolBranding()
  return <ReportExport {...props} school={school} />
}

export async function BrandedDocumentDownload({
  document,
  label,
}: {
  document: PrintableDocument
  label: string
}) {
  const school = await getSchoolBranding()

  // The caller's own name and code are kept when no school resolves, so a document still
  // prints something sensible rather than "School".
  return (
    <DocumentDownload
      label={label}
      document={
        school
          ? { ...document, schoolName: school.name, schoolCode: school.code, school }
          : document
      }
    />
  )
}

export async function BrandedPrintHeader({ title, reference }: { title: string; reference?: string | null }) {
  const school = await getSchoolBranding()
  return <PrintHeader school={school} title={title} reference={reference} />
}
