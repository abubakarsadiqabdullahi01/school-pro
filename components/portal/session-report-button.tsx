"use client"

import { useState } from "react"
import { Download, Eye, Loader2, Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { exportStudentReportPDF } from "@/lib/pdf/student-report-card-generator"
import type { SessionReportForStudent } from "@/lib/results/session-report.server"

type ReportResult =
  | {
      success: true
      data: SessionReportForStudent & {
        /** Renamed score columns for a sessional card; null keeps the termly labels. */
        scoreHeaders: [string, string, string, string, string] | null
      }
    }
  | { success: false; error: string }

/**
 * Downloads a report card — termly or sessional — from the school's own generator.
 *
 * There is deliberately no hand-built HTML version of this document any more. There was
 * one, and it was a second report sheet with its own layout, so a family could be handed
 * two papers for the same term that did not look alike. The card downloaded here is the
 * card the school prints.
 */
export function SessionReportButton({
  periodId,
  periodName,
  load,
  label = "Report card (PDF)",
  variant = "default",
  includePosition = true,
  action = "save",
}: {
  /** A session id for a sessional card, a term id for a termly one. */
  periodId: string
  /** What the card's Term line should read. */
  periodName: string
  load: (periodId: string) => Promise<ReportResult>
  label?: string
  variant?: "default" | "outline"
  includePosition?: boolean
  /** "preview" opens the card in a tab; "save" downloads it; "share" opens the device share sheet. */
  action?: "save" | "preview" | "share"
}) {
  const [isWorking, setIsWorking] = useState(false)

  async function handleDownload() {
    // Opened here, in the click handler, before anything is awaited. Building the PDF is
    // asynchronous and a window opened afterwards counts as unsolicited, so every
    // mainstream browser blocks it — which is why preview needs the tab up front.
    const previewWindow = action === "preview" ? window.open("", "_blank") : null

    setIsWorking(true)
    try {
      const result = await load(periodId)
      if (!result.success) {
        previewWindow?.close()
        toast.error("Not available", { description: result.error })
        return
      }

      const { report, student, school, scoreHeaders } = result.data

      await exportStudentReportPDF({
        student: {
          studentId: student.studentId,
          studentName: student.studentName,
          admissionNo: student.admissionNo,
          gender: student.gender,
          passportUrl: student.passportUrl,
          subjects: student.subjects,
          totalScore: student.totalScore,
          averageScore: student.averageScore,
          grade: student.grade,
          remark: student.remark,
          position: student.position,
          // Carried straight through from the session report, which only ever supplies an
          // APPROVED decision. On a termly card these are PENDING and empty, and the
          // generator falls back to the wording it always used.
          annualDecision: student.annualDecision,
          principalComment: student.principalComment,
          gradingSystem: report.gradingSystem,
        },
        schoolInfo: school,
        classInfo: {
          className: report.className,
          termName: periodName,
          sessionName: report.session.name,
          teacherName: report.teacherName,
          termEndDate: report.session.endDate,
          nextTermStartDate: report.session.nextStartDate,
        },
        subjects: report.subjects,
        classStatistics: report.statistics,
        gradingSystem: report.gradingSystem,
        includePosition,
        action,
        previewWindow,
        // Omitted entirely for a termly card, so the generator keeps its own headings.
        ...(scoreHeaders ? { config: { scoreHeaders } } : {}),
      })

      if (action === "save") {
        toast.success("Downloaded", { description: `${periodName} — ${student.studentName}.` })
      }
    } catch (error) {
      previewWindow?.close()
      console.error("Report card failed:", error)
      toast.error("Could not build the report", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <Button variant={variant} size="sm" onClick={handleDownload} disabled={isWorking}>
      {isWorking ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Building
        </>
      ) : (
        <>
          {action === "preview" ? (
            <Eye className="mr-2 h-4 w-4" />
          ) : action === "share" ? (
            <Share2 className="mr-2 h-4 w-4" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {label}
        </>
      )}
    </Button>
  )
}
