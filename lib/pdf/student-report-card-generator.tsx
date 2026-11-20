import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { format } from "date-fns"
import { sharePdf } from "./share-pdf"

import { reportCardComments, type AnnualCardDecision } from "@/lib/pdf/report-card-comments"

import { RATING_KEY, ratingsForDomain } from "@/lib/report-traits"
import { stampAllPages } from "@/lib/pdf/watermark"

interface StudentResult {
  studentId: string
  studentName: string
  admissionNo: string
  gender: string | null
  /** The student's passport photograph. Null when none has been uploaded, in which case the
   *  report prints an empty framed box so the layout does not shift between students. */
  passportUrl?: string | null
  subjects: Record<
    string,
    {
      ca1: number | null
      ca2: number | null
      ca3: number | null
      exam: number | null
      score: number | null
      grade: string | null
      remark: string | null
      position: number | null
      outOf: number
      lowest: number
      highest: number
      average: number
    }
  >
  totalScore: number
  averageScore: number
  /** Null when no grade band covers the average. Printed as an em dash on the report card
   *  rather than as a fail — a report card is the one place a fabricated grade does real
   *  harm. */
  grade: string | null
  remark: string
  position: number
  gradingSystem: GradingSystem
  /** Affective and psychomotor ratings for the term, as the class teacher entered them.
   *  Absent on older callers, which print a dash against every trait. */
  traitRatings?: Array<{ trait: string; rating: number }>
  /**
   * The approved end-of-session outcome, on an annual card.
   *
   * Absent or PENDING on a termly card, and on a sessional one nobody has approved yet.
   * In that case the card prints the generated encouragement it always did, because an
   * unapproved outcome is not the school's word yet.
   */
  annualDecision?: AnnualCardDecision
  /** The principal's own words, when they have written any. */
  principalComment?: string
}

interface SchoolInfo {
  schoolName: string
  schoolCode: string
  schoolAddress: string
  schoolPhone: string
  schoolEmail: string
  schoolLogo: string | null
}

interface ClassInfo {
  className: string
  termName: string
  sessionName: string
  teacherName: string
  termEndDate: string // ISO date string (e.g., "2025-05-16")
  nextTermStartDate: string // ISO date string
}

interface Subject {
  id: string
  name: string
  code: string
}

interface ClassStatistics {
  highestTotal: number
  lowestTotal: number
  classAverage: number
  subjectHighest: Record<string, number>
  subjectLowest: Record<string, number>
  subjectAverage: Record<string, number>
}

interface GradingLevel {
  minScore: number
  maxScore: number
  grade: string
  remark: string
}

interface GradingSystem {
  id?: string
  name?: string
  passMark: number
  levels: GradingLevel[]
}

interface PDFConfig {
  orientation: "portrait" | "landscape"
  fontSize: {
    header: number
    subheader: number
    normal: number
    small: number
  }
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
  colors: {
    primary: [number, number, number]
    secondary: [number, number, number]
    text: [number, number, number]
    lightGray: [number, number, number]
  }
  tableWidths?: {
    academicResults: Record<string, number>
  }
  logoSize?: { width: number; height: number }
  /** Passport photograph box, in millimetres. Roughly the 35×45 passport ratio. */
  passportSize?: { width: number; height: number }
  /**
   * Stamped diagonally across every page.
   *
   * A report card is a document families keep and schools are asked to re-issue, so it
   * benefits from the same mark a receipt carries. Left unset it draws nothing, so every
   * existing caller is unchanged.
   */
  watermark?: string | null
  /**
   * Labels for the five score columns, in order: the three component columns, the column
   * after them, and the summary column.
   *
   * A termly card marks three CAs and an exam. A sessional card marks three terms and
   * totals them. The columns, widths, order and every other part of the layout are the
   * same, so the sessional report is this document with five headers renamed rather than a
   * second generator that would drift away from this one the first time either changed.
   *
   * Defaults to the termly labels, so every existing caller is untouched.
   */
  scoreHeaders?: [string, string, string, string, string]
}

interface GenerateReportParams {
  student: StudentResult
  schoolInfo: SchoolInfo
  classInfo: ClassInfo
  subjects: Subject[]
  classStatistics: ClassStatistics | null
  gradingSystem: GradingSystem
  action?: "save" | "preview" | "print" | "share" | "merge-preview" | "merge-save"
  previewWindow?: Window | null
  allStudents?: StudentResult[]
  /**
   * Whether class positions appear on the card.
   *
   * Some schools deliberately do not rank children, and others rank only in senior classes,
   * so this is the school's call at the moment of printing rather than a build-time decision.
   * When false, both the per-subject "Pos." column and the "Position in Class" summary line
   * are left out entirely — not blanked, which would still advertise that a rank exists.
   */
  includePosition?: boolean
}

// Server-side image conversion using API
async function getImageDataURLViaAPI(url: string): Promise<string | null> {
  try {
    console.log('Converting image via API:', url)
    
    const response = await fetch('/api/convert-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl: url }),
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || 'API returned unsuccessful response')
    }

    console.log('Image converted via API successfully')
    return data.dataURL
  } catch (error) {
    console.error('API image conversion failed:', error)
    return null
  }
}

/**
 * A date for the card, or an em dash.
 *
 * `format(new Date(""))` throws "Invalid time value", so every place that printed one of
 * these dates was one unset field away from failing the whole document. A school that has
 * not yet created next session has nothing to say here, and a blank line is the honest
 * answer — far better than refusing to print the report card at all.
 */
function printableDate(value: string | null | undefined): string {
  if (!value) return "—"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "—" : format(parsed, "MMM d, yyyy")
}

class StudentReportCardGenerator {
  private doc: jsPDF
  private config: PDFConfig
  private pageWidth: number
  private pageHeight: number
  private currentY: number

  constructor(config: Partial<PDFConfig> = {}) {
    this.config = {
      orientation: "portrait",
      fontSize: {
        header: 14,
        subheader: 11,
        normal: 9,
        small: 8,
      },
      margins: {
        top: 10,
        bottom: 12,
        left: 15,
        right: 15,
      },
      colors: {
        primary: [0, 51, 102],
        secondary: [100, 100, 100],
        text: [40, 40, 40],
        lightGray: [240, 240, 240],
      },
      tableWidths: {
        academicResults: {
          subject: 36,
          ca1: 12,
          ca2: 12,
          ca3: 12,
          exam: 10,
          total: 10,
          grade: 11,
          position: 10,
          outOf: 10,
          lowest: 13,
          highest: 13,
          average: 14,
          remarks: 18,
        },
      },
      logoSize: { width: 18, height: 18 },
      passportSize: { width: 20, height: 25 },
      ...config,
    }

    this.doc = new jsPDF({ orientation: this.config.orientation })
    this.pageWidth = this.doc.internal.pageSize.width
    this.pageHeight = this.doc.internal.pageSize.height
    this.currentY = this.config.margins.top
  }

  private validateInputs(
    student: StudentResult,
    schoolInfo: SchoolInfo,
    classInfo: ClassInfo,
    subjects: Subject[],
  ): void {
    if (!student) throw new Error("Student result is required")
    if (!schoolInfo?.schoolName) throw new Error("School name is required")
    if (!classInfo?.className) throw new Error("Class name is required")
    if (!subjects?.length) throw new Error("Subjects array cannot be empty")
    // Term dates are printed, not calculated with. An unset one is shown as a dash rather
    // than throwing away the whole report card.
  }

  /**
   * The letterhead: school logo left, school identity centred, student photograph right.
   *
   * The photo sits here rather than down in the student information block because the
   * header is the one band on the page with a free right-hand margin — the logo already
   * establishes that edge — and a report card reads better when the child's face is beside
   * the school's mark rather than buried among the term dates.
   */
  private async drawSchoolHeader(
    schoolInfo: SchoolInfo,
    passportDataURL: string | null,
  ): Promise<void> {
    const { schoolName, schoolAddress, schoolPhone, schoolEmail, schoolLogo } = schoolInfo

    let logoDataURL: string | null = null

    // Handle school logo using API
    if (schoolLogo) {
      try {
        if (schoolLogo.startsWith('data:')) {
          logoDataURL = schoolLogo
        } else {
          logoDataURL = await getImageDataURLViaAPI(schoolLogo)
        }
      } catch (error) {
        console.warn("Failed to load logo:", error)
      }
    }

    // Add logo if available
    if (logoDataURL) {
      try {
        const imageFormat = logoDataURL.includes('image/png') ? 'PNG' : 'JPEG'
        this.doc.addImage(
          logoDataURL,
          imageFormat,
          this.config.margins.left,
          this.currentY,
          this.config.logoSize!.width,
          this.config.logoSize!.height,
        )
      } catch (error) {
        console.warn("Failed to add logo to PDF:", error)
      }
    }

    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.header)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text(schoolName.toUpperCase(), this.pageWidth / 2, this.currentY + 6, { align: "center" })

    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(this.config.fontSize.small)
    this.doc.setTextColor(...this.config.colors.text)
    this.doc.text(schoolAddress, this.pageWidth / 2, this.currentY + 12, { align: "center" })
    this.doc.text(`Tel: ${schoolPhone} | Email: ${schoolEmail}`, this.pageWidth / 2, this.currentY + 16, {
      align: "center",
    })

    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.subheader)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text("STUDENT REPORT CARD", this.pageWidth / 2, this.currentY + 22, { align: "center" })

    // The rule clears the photo rather than sitting flush against it. The centred text ends
    // at +22 and the 25mm photo at +25, so +27 leaves both a margin.
    this.doc.setDrawColor(...this.config.colors.secondary)
    this.doc.setLineWidth(0.5)
    this.doc.line(
      this.config.margins.left,
      this.currentY + 27,
      this.pageWidth - this.config.margins.right,
      this.currentY + 27,
    )

    // Mirrors the logo on the left, within the same band.
    this.drawPassport(passportDataURL, this.currentY)

    this.currentY += 30
  }

  /**
   * The passport photograph, framed, at the right of the student information block.
   *
   * The frame is drawn whether or not there is a picture, so a class where only some
   * students have uploaded one still prints cards of identical height — a report card that
   * changes shape per child looks like a fault rather than a missing photo.
   */
  private drawPassport(passportDataURL: string | null, top: number): void {
    const width = this.config.passportSize!.width
    const height = this.config.passportSize!.height
    const x = this.pageWidth - this.config.margins.right - width

    if (passportDataURL) {
      try {
        const imageFormat = passportDataURL.includes("image/png") ? "PNG" : "JPEG"
        this.doc.addImage(passportDataURL, imageFormat, x, top, width, height)
      } catch (error) {
        console.warn("Failed to add passport to PDF:", error)
      }
    } else {
      this.doc.setFont("helvetica", "normal")
      this.doc.setFontSize(this.config.fontSize.small - 1)
      this.doc.setTextColor(...this.config.colors.secondary)
      this.doc.text("NO PHOTO", x + width / 2, top + height / 2, { align: "center" })
      this.doc.setTextColor(...this.config.colors.text)
    }

    this.doc.setDrawColor(...this.config.colors.secondary)
    this.doc.setLineWidth(0.3)
    this.doc.rect(x, top, width, height)
  }

  private drawStudentInfo(student: StudentResult, classInfo: ClassInfo): void {
    const { studentName, admissionNo, gender } = student
    const { className, termName, sessionName, termEndDate, nextTermStartDate } = classInfo

    const leftMargin = this.config.margins.left
    const middleColumnX = this.pageWidth * 0.34
    const rightColumnX = this.pageWidth * 0.56
    const pageWidth = this.pageWidth - this.config.margins.left - this.config.margins.right

    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    this.currentY += 3

    this.doc.text("Student Information", leftMargin + pageWidth / 4, this.currentY, { align: "center" })
    this.doc.text("Term Information", rightColumnX - 10 + pageWidth / 4, this.currentY, { align: "center" })

    this.currentY += 6
    this.doc.setTextColor(...this.config.colors.text)

    this.doc.setFont("helvetica", "bold")
    this.doc.text("Name:", leftMargin, this.currentY)
    const nameWidth = this.doc.getTextWidth("Name:")
    this.doc.setFont("helvetica", "normal")
    this.doc.text(studentName.toLocaleUpperCase(), leftMargin + nameWidth + 1, this.currentY)

    this.doc.setFont("helvetica", "bold")
    this.doc.text("Admission No:", leftMargin, this.currentY + 6)
    const admissionWidth = this.doc.getTextWidth("Admission No:")
    this.doc.setFont("helvetica", "normal")
    this.doc.text(admissionNo, leftMargin + admissionWidth + 2, this.currentY + 6)

    this.doc.setFont("helvetica", "bold")
    this.doc.text("Gender:", middleColumnX + 2, this.currentY)
    const genderWidth = this.doc.getTextWidth("Gender:")
    this.doc.setFont("helvetica", "normal")
    this.doc.text((gender ?? "N/A").toUpperCase(), middleColumnX + genderWidth + 4, this.currentY)

    this.doc.setFont("helvetica", "bold")
    this.doc.text("Class:", middleColumnX + 2, this.currentY + 6)
    const classWidth = this.doc.getTextWidth("Class:")
    this.doc.setFont("helvetica", "normal")
    this.doc.text(className.toLocaleUpperCase(), middleColumnX + classWidth + 4, this.currentY + 6)

    this.doc.setFont("helvetica", "bold")
    this.doc.text("Session:", rightColumnX - 10, this.currentY)
    const sessionWidth = this.doc.getTextWidth("Session:")
    this.doc.setFont("helvetica", "normal")
    this.doc.text(sessionName, (rightColumnX - 10) + sessionWidth + 2, this.currentY)

    this.doc.setFont("helvetica", "bold")
    this.doc.text("Term:", rightColumnX + 30, this.currentY)
    const termWidth = this.doc.getTextWidth("Term:")
    this.doc.setFont("helvetica", "normal")
    this.doc.text(termName.toLocaleUpperCase(), rightColumnX + 30 + termWidth + 2, this.currentY)

    this.doc.setFont("helvetica", "bold")
    this.doc.text("Term Ends:", rightColumnX - 10, this.currentY + 6)
    const termEndsWidth = this.doc.getTextWidth("Term Ends:")
    this.doc.setFont("helvetica", "normal")
    this.doc.text(printableDate(termEndDate), (rightColumnX - 10) + termEndsWidth + 1, this.currentY + 6)

    this.doc.setFont("helvetica", "bold")
    this.doc.text("Next Term Begins:", rightColumnX + 30, this.currentY + 6)
    const nextTermWidth = this.doc.getTextWidth("Next Term Begins:")
    this.doc.setFont("helvetica", "normal")
    this.doc.text(
      printableDate(nextTermStartDate),
      rightColumnX + 30 + nextTermWidth + 1,
      this.currentY + 6,
    )

    this.doc.setDrawColor(...this.config.colors.secondary)
    this.doc.setLineWidth(0.3)
    this.doc.line(
      this.config.margins.left,
      this.currentY + 10,
      this.pageWidth - this.config.margins.right,
      this.currentY + 10,
    )

    this.currentY += 14
  }

  private drawAcademicResults(
    student: StudentResult,
    subjects: Subject[],
    gradingSystem: GradingSystem,
    classStatistics: ClassStatistics | null,
    includePosition: boolean,
  ): void {
    this.currentY += 1

    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.subheader - 1)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text("COGNITIVE DOMAIN", this.pageWidth / 2, this.currentY, { align: "center" })

    this.currentY += 2

    const [firstLabel, secondLabel, thirdLabel, fourthLabel, summaryLabel] = this.config
      .scoreHeaders ?? ["1st CA\n(10)", "2nd CA\n(10)", "3rd CA\n(10)", "Exam\n(70)", "Total"]

    const headers = [
      "Subject",
      firstLabel,
      secondLabel,
      thirdLabel,
      fourthLabel,
      summaryLabel,
      "Grade",
      // Dropped entirely rather than blanked: an empty column still tells a family that a
      // rank exists and is being withheld.
      ...(includePosition ? ["Pos."] : []),
      "Out\nOf",
      "Lowest\nScore",
      "Highest\nScore",
      "Class\nAvg.",
      "Remarks",
    ]

    const body = subjects.map((subject) => {
      // Safely access subject result with fallback
      const subjectResult = student.subjects[subject.id] || {
        ca1: null,
        ca2: null,
        ca3: null,
        exam: null,
        score: null,
        grade: null,
        remark: null,
        position: null,
        outOf: 0,
        lowest: 0,
        highest: 0,
        average: 0,
      }

      const score = subjectResult.score !== null && subjectResult.score !== undefined ? subjectResult.score : null
      const grade = subjectResult.grade || ""
      const position =
        subjectResult.position !== null
          ? `${subjectResult.position}${this.getOrdinalSuffix(subjectResult.position)}`
          : "-"
      const outOf = subjectResult.outOf > 0 ? subjectResult.outOf.toString() : "-"
      const lowest = subjectResult.lowest > 0 ? subjectResult.lowest.toFixed(1) : "-"
      const highest = subjectResult.highest > 0 ? subjectResult.highest.toFixed(1) : "-"
      const average = subjectResult.average > 0 ? subjectResult.average.toFixed(1) : "-"
      const remark = subjectResult.remark || "-"

      return [
        subject.name,
        subjectResult.ca1 !== null && subjectResult.ca1 !== undefined ? subjectResult.ca1.toFixed(1) : "-",
        subjectResult.ca2 !== null && subjectResult.ca2 !== undefined ? subjectResult.ca2.toFixed(1) : "-",
        subjectResult.ca3 !== null && subjectResult.ca3 !== undefined ? subjectResult.ca3.toFixed(1) : "-",
        subjectResult.exam !== null && subjectResult.exam !== undefined ? subjectResult.exam.toFixed(1) : "-",
        score !== null && score !== undefined ? score.toFixed(1) : "-",
        grade || "-",
        ...(includePosition ? [position] : []),
        outOf,
        lowest,
        highest,
        average,
        remark,
      ]
    })

    // Same order as `headers` and each body row, so the two cannot drift apart. The width
    // the position column gave up is returned to the subject name, which is the column that
    // actually runs out of room.
    const widths = this.config.tableWidths!.academicResults
    const columnWidths = [
      widths.subject + (includePosition ? 0 : widths.position),
      widths.ca1,
      widths.ca2,
      widths.ca3,
      widths.exam,
      widths.total,
      widths.grade,
      ...(includePosition ? [widths.position] : []),
      widths.outOf,
      widths.lowest,
      widths.highest,
      widths.average,
      widths.remarks,
    ]

    autoTable(this.doc, {
      head: [headers],
      body: body,
      startY: this.currentY,
      theme: "grid",
      styles: {
        fontSize: this.config.fontSize.small - 0.5,
        cellPadding: 1.5,
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: this.config.colors.primary,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        valign: "middle",
        cellPadding: 1.5,
      },
      // Built from the column order rather than hardcoded indices, because dropping the
      // position column shifts every column after it. Hardcoding 0–12 silently applied the
      // "Out Of" width to "Lowest Score" and left the last column unstyled.
      columnStyles: columnWidths.reduce<Record<number, Record<string, unknown>>>(
        (styles, width, index) => {
          styles[index] = index === 0 ? { cellWidth: width } : { cellWidth: width, halign: "center" }
          return styles
        },
        {},
      ),
      alternateRowStyles: {
        fillColor: this.config.colors.lightGray,
      },
    })

    this.currentY = (this.doc as any).lastAutoTable.finalY + 5
    this.drawCognitiveDomain(student, subjects, classStatistics, includePosition)
    this.currentY += 4
  }

  /**
   * The academic performance summary.
   *
   * This used to be a two-by-three grid of "Label: value" strings in one bold weight, with
   * an empty half-row underneath when positions were switched off. Everything carried the
   * same visual weight, so the two figures a parent actually looks for — the average and
   * the grade — had to be hunted for among the arithmetic that supports them.
   *
   * It is now a band of tiles: the headline figures large, the workings on one quiet line
   * beneath, and the remark on its own full-width bar. Drawn directly rather than through
   * autoTable, because a table cell cannot hold two type sizes.
   */
  private drawCognitiveDomain(
    student: StudentResult,
    subjects: Subject[],
    classStatistics: ClassStatistics | null,
    includePosition: boolean,
  ): void {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text("ACADEMIC PERFORMANCE", this.config.margins.left, this.currentY)

    this.currentY += 3

    const left = this.config.margins.left
    const width = this.pageWidth - this.config.margins.left - this.config.margins.right

    // Only the subjects that count towards the average.
    //
    // A subject the student did not sit is still given a `score` of 0 rather than null, so
    // the old `score !== null` test counted every row on the sheet — which is why a card
    // with two untaken subjects read "398 of 800 obtainable" beside an average of 66.3%,
    // and no reader could get from one number to the other. The average divides by the
    // subjects that were actually marked, and those are exactly the ones carrying a real
    // grade: an untaken, absent or exempt subject is written out with `grade: "-"`.
    const subjectsTaken = Object.values(student.subjects).filter(
      (subject) => subject.grade !== null && subject.grade !== "-",
    ).length
    const obtainable = subjectsTaken * 100

    const tiles: { label: string; value: string }[] = [
      { label: "AVERAGE SCORE", value: `${student.averageScore.toFixed(1)}%` },
      { label: "OVERALL GRADE", value: student.grade ?? "—" },
      {
        label: "CLASS AVERAGE",
        value: classStatistics ? `${classStatistics.classAverage.toFixed(1)}%` : "—",
      },
    ]

    if (includePosition) {
      tiles.splice(2, 0, {
        label: "POSITION IN CLASS",
        value:
          student.position > 0
            ? `${student.position}${this.getOrdinalSuffix(student.position)}`
            : "—",
      })
    }

    const tileHeight = 13
    const tileGap = 2
    const tileWidth = (width - tileGap * (tiles.length - 1)) / tiles.length

    tiles.forEach((tile, index) => {
      const x = left + index * (tileWidth + tileGap)

      this.doc.setFillColor(...this.config.colors.lightGray)
      this.doc.setDrawColor(...this.config.colors.primary)
      this.doc.setLineWidth(0.3)
      this.doc.rect(x, this.currentY, tileWidth, tileHeight, "FD")

      this.doc.setFont("helvetica", "normal")
      this.doc.setFontSize(this.config.fontSize.small - 1.5)
      this.doc.setTextColor(...this.config.colors.secondary)
      this.doc.text(tile.label, x + tileWidth / 2, this.currentY + 4.5, { align: "center" })

      this.doc.setFont("helvetica", "bold")
      this.doc.setFontSize(this.config.fontSize.subheader)
      this.doc.setTextColor(...this.config.colors.primary)
      this.doc.text(tile.value, x + tileWidth / 2, this.currentY + 10.5, { align: "center" })
    })

    this.currentY += tileHeight + 3

    // The workings, kept deliberately quiet: present for anyone who wants to check the
    // headline figures, not competing with them.
    const workings = [
      `Total score ${student.totalScore.toFixed(1)} of ${obtainable} obtainable`,
      `${subjectsTaken} of ${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"} taken`,
    ].join("     •     ")

    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(this.config.fontSize.small - 0.5)
    this.doc.setTextColor(...this.config.colors.secondary)
    this.doc.text(workings, left + width / 2, this.currentY + 1, { align: "center" })

    this.currentY += 4

    // The remark gets its own bar, so it is not a fourth item competing with three numbers.
    const remarkHeight = 7
    const labelWidth = 26

    this.doc.setDrawColor(...this.config.colors.primary)
    this.doc.setLineWidth(0.3)
    this.doc.setFillColor(...this.config.colors.primary)
    this.doc.rect(left, this.currentY, labelWidth, remarkHeight, "FD")
    this.doc.rect(left + labelWidth, this.currentY, width - labelWidth, remarkHeight, "D")

    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.small - 1)
    this.doc.setTextColor(255, 255, 255)
    this.doc.text("REMARK", left + labelWidth / 2, this.currentY + 4.6, { align: "center" })

    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.small)
    this.doc.setTextColor(...this.config.colors.text)
    this.doc.text(student.remark || "—", left + labelWidth + 3, this.currentY + 4.6)

    this.currentY += remarkHeight + 6
  }

  private drawGradesDescription(gradingSystem: GradingSystem): number {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    const leftX = this.config.margins.left
    this.doc.text("GRADES DESCRIPTION", leftX, this.currentY)

    const gradesData = gradingSystem.levels.map((level) => [
      `${level.minScore} – ${level.maxScore} = ${level.grade} - ${level.remark}`,
    ])

    autoTable(this.doc, {
      body: gradesData,
      startY: this.currentY + 4,
      theme: "grid",
      styles: {
        fontSize: this.config.fontSize.small,
        cellPadding: 1,
        halign: "left",
      },
      columnStyles: {
        0: { cellWidth: 45 },
      },
      head: [],
      margin: { left: leftX },
      tableWidth: 45,
    })

    return (this.doc as any).lastAutoTable.finalY
  }

  private drawPsychomotorDomain(student: StudentResult): number {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    const middleX = this.pageWidth / 3 + this.config.margins.left - 10
    this.doc.text("PSYCHOMOTOR DOMAIN", middleX, this.currentY)

    // A trait the teacher left blank prints as a dash. Dropping the row instead
    // would read as though the school does not assess it.
    const psychomotorData = [
      ["Trait", "Rating"],
      ...ratingsForDomain("PSYCHOMOTOR", student.traitRatings ?? []).map((row) => [
        row.label,
        row.rating === null ? "-" : String(row.rating),
      ]),
    ]

    autoTable(this.doc, {
      body: psychomotorData,
      startY: this.currentY + 4,
      theme: "grid",
      styles: {
        fontSize: this.config.fontSize.small,
        cellPadding: 1.5,
      },
      columnStyles: {
        0: { cellWidth: 30, halign: "left" },
        1: { cellWidth: 20, halign: "center" },
      },
      headStyles: {
        fillColor: this.config.colors.primary,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      margin: { left: middleX },
      tableWidth: 55,
    })

    return (this.doc as any).lastAutoTable.finalY
  }

  private drawAffectiveDomain(student: StudentResult): number {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    const rightX = (this.pageWidth * 2) / 3 + this.config.margins.left - 5
    this.doc.text("AFFECTIVE DOMAIN", rightX, this.currentY)

    const affectiveData = [
      ["Trait", "Rating"],
      ...ratingsForDomain("AFFECTIVE", student.traitRatings ?? []).map((row) => [
        row.label,
        row.rating === null ? "-" : String(row.rating),
      ]),
    ]

    autoTable(this.doc, {
      body: affectiveData,
      startY: this.currentY + 4,
      theme: "grid",
      styles: {
        fontSize: this.config.fontSize.small,
        cellPadding: 1.5,
      },
      columnStyles: {
        0: { cellWidth: 25, halign: "left" },
        1: { cellWidth: 20, halign: "center" },
      },
      headStyles: {
        fillColor: this.config.colors.primary,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      margin: { left: rightX },
      tableWidth: 50,
    })

    return (this.doc as any).lastAutoTable.finalY
  }

  private drawPerformanceSummary(student: StudentResult, gradingSystem: GradingSystem): void {
    const gradesFinalY = this.drawGradesDescription(gradingSystem)
    const psychomotorFinalY = this.drawPsychomotorDomain(student)
    const affectiveFinalY = this.drawAffectiveDomain(student)

    // What 1 to 5 mean. Without the key the ratings are just numbers to a parent.
    const keyY = Math.max(psychomotorFinalY, affectiveFinalY) + 3.5
    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(this.config.fontSize.small - 0.5)
    this.doc.setTextColor(...this.config.colors.secondary)
    this.doc.text(RATING_KEY, this.pageWidth / 3 + this.config.margins.left - 10, keyY)

    this.currentY = Math.max(gradesFinalY, keyY) + 10
  }

  private drawCommentsSection(student: StudentResult): void {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text("COMMENTS", this.config.margins.left, this.currentY)

    this.currentY += 5

    // What each line says is decided in `lib/pdf/report-card-comments.ts`, which is pure
    // and tested. This function only places it on the page.
    const comments = reportCardComments(student)
    const formTeacherComment = comments.formTeacher
    const headTeacherComment = comments.headTeacher

    const marginLeft = this.config.margins.left
    const boxWidth = this.pageWidth - this.config.margins.left - this.config.margins.right
    const boxHeight = 26
    const padding = 4
    const currentDate = format(new Date(), "MMM d, yyyy")

    this.doc.setDrawColor(...this.config.colors.secondary)
    this.doc.setLineWidth(0.5)
    this.doc.roundedRect(marginLeft, this.currentY, boxWidth, boxHeight, 3, 3, "S")

    const line1Y = this.currentY + 8
    const line2Y = this.currentY + 18

    const label1 = "Form Teacher's Comment:"
    this.doc.setFont("helvetica", "bold")
    const label1X = marginLeft + padding
    this.doc.text(label1, label1X, line1Y)

    const label1Width = this.doc.getTextWidth(label1)
    const comment1X = label1X + label1Width + 2
    this.doc.setFont("helvetica", "italic")
    this.doc.text(formTeacherComment, comment1X, line1Y)

    const comment1Width = 63
    this.doc.setLineWidth(0.3)
    this.doc.line(comment1X, line1Y + 1.5, comment1X + comment1Width, line1Y + 1.5)

    this.doc.setFont("helvetica", "normal")
    const signDate1 = `Sign: ______________________ ${currentDate}`
    const signDate1Width = this.doc.getTextWidth(signDate1)
    this.doc.text(signDate1, marginLeft + boxWidth - signDate1Width - padding, line1Y)

    // A decision a family has to infer from prose is a decision badly communicated, so it
    // is stated outright as well as being written into the comment.
    if (comments.stamp) {
      const stamp = comments.stamp
      this.doc.setFont("helvetica", "bold")
      this.doc.setFontSize(this.config.fontSize.normal)
      const stampWidth = this.doc.getTextWidth(stamp) + 6
      const stampX = marginLeft + boxWidth - stampWidth - padding
      const stampY = this.currentY - 3

      this.doc.setDrawColor(...this.config.colors.primary)
      this.doc.setLineWidth(0.5)
      this.doc.roundedRect(stampX, stampY - 5, stampWidth, 7, 1.5, 1.5, "S")
      this.doc.setTextColor(...this.config.colors.primary)
      this.doc.text(stamp, stampX + 3, stampY)
      this.doc.setTextColor(0, 0, 0)
      this.doc.setFont("helvetica", "normal")
      this.doc.setFontSize(this.config.fontSize.small)
    }

    const label2 = "Head Teacher's Comment:"
    this.doc.setFont("helvetica", "bold")
    const label2X = marginLeft + padding
    this.doc.text(label2, label2X, line2Y)

    const label2Width = this.doc.getTextWidth(label2)
    const comment2X = label2X + label2Width + 2
    this.doc.setFont("helvetica", "italic")
    this.doc.text(headTeacherComment, comment2X, line2Y)

    const comment2Width = 63
    this.doc.setLineWidth(0.3)
    this.doc.line(comment2X, line2Y + 1.5, comment2X + comment2Width, line2Y + 1.5)

    this.doc.setFont("helvetica", "normal")
    const signDate2 = `Sign: ______________________ ${currentDate}`
    const signDate2Width = this.doc.getTextWidth(signDate2)
    this.doc.text(signDate2, marginLeft + boxWidth - signDate2Width - padding, line2Y)

    this.currentY += boxHeight + 5
  }

  private drawFooter(student: StudentResult, classInfo: ClassInfo): void {
    const footerHeight = 12
    const footerY = this.pageHeight - 10 - footerHeight
    const marginLeft = this.config.margins.left
    const marginRight = this.config.margins.right
    const pageWidth = this.pageWidth - marginLeft - marginRight

    this.doc.setFillColor(...this.config.colors.lightGray)
    this.doc.setDrawColor(...this.config.colors.secondary)
    this.doc.setLineWidth(0.3)
    this.doc.roundedRect(marginLeft, footerY, pageWidth, footerHeight, 2, 2, "FD")

    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.small + 1)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text("Powered by Digisoft-Ng", marginLeft + 2, footerY + 5)

    this.doc.setFont("helvetica", "italic")
    this.doc.setFontSize(this.config.fontSize.small - 1)
    this.doc.setTextColor(...this.config.colors.text)
    this.doc.text("Excellence in Education Technology", marginLeft + 2, footerY + 10)

    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(this.config.fontSize.small)
    this.doc.setTextColor(...this.config.colors.text)
    this.doc.text(
      `Student: ${student.studentName} | Admission No: ${student.admissionNo}`,
      this.pageWidth / 2,
      footerY + 5,
      { align: "center" },
    )

    this.doc.setFont("helvetica", "italic")
    this.doc.setFontSize(this.config.fontSize.small - 1)
    this.doc.setTextColor(...this.config.colors.text)
    this.doc.text(
      `Next Term Begins: ${printableDate(classInfo.nextTermStartDate)} | Term Ends: ${printableDate(
        classInfo.termEndDate,
      )}`,
      this.pageWidth / 2,
      footerY + 10,
      { align: "center" },
    )

    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(this.config.fontSize.small)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy")}`, this.pageWidth - marginRight - 2, footerY + 5, {
      align: "right",
    })

    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(this.config.fontSize.small - 1)
    this.doc.setTextColor(...this.config.colors.text)
    this.doc.text("Contact: support@digisoft-ng.com", this.pageWidth - marginRight - 2, footerY + 10, {
      align: "right",
    })
  }

  /**
   * Resolves a student's passport to a data URL, going through the same conversion API the
   * school logo uses. A failure is not fatal — the card prints the empty frame instead.
   */
  private async loadPassport(passportUrl?: string | null): Promise<string | null> {
    if (!passportUrl) return null
    try {
      if (passportUrl.startsWith("data:")) return passportUrl
      return await getImageDataURLViaAPI(passportUrl)
    } catch (error) {
      console.warn("Failed to load passport photo:", error)
      return null
    }
  }

  private getOrdinalSuffix(n: number): string {
    const s = ["th", "st", "nd", "rd"]
    const v = n % 100
    return s[(v - 20) % 10] || s[v] || s[0]
  }

  private async generateSingleReport(
    student: StudentResult,
    schoolInfo: SchoolInfo,
    classInfo: ClassInfo,
    subjects: Subject[],
    classStatistics: ClassStatistics | null,
    gradingSystem: GradingSystem,
    action: "save" | "preview" | "print" | "share",
    includePosition: boolean,
    previewWindow?: Window | null,
  ): Promise<void> {
    this.validateInputs(student, schoolInfo, classInfo, subjects)

    const passportDataURL = await this.loadPassport(student.passportUrl)

    await this.drawSchoolHeader(schoolInfo, passportDataURL)
    this.drawStudentInfo(student, classInfo)
    this.drawAcademicResults(student, subjects, gradingSystem, classStatistics, includePosition)
    this.drawPerformanceSummary(student, gradingSystem)
    this.drawCommentsSection(student)
    this.drawFooter(student, classInfo)

    stampAllPages(this.doc, {
      watermark: this.config.watermark ?? schoolInfo.schoolCode,
      footerRight: schoolInfo.schoolName,
      marginX: this.config.margins.left,
    })

    const fileName = `${student.admissionNo}_${classInfo.termName}_Report_Card.pdf`
    const blob = this.doc.output("blob")
    const pdfUrl = URL.createObjectURL(blob)

    if (action === "preview") {
      // If a preview window was opened synchronously by the caller, use it to avoid popup blockers.
      if (previewWindow && !previewWindow.closed) {
        try {
          // Try to navigate the opened window to the blob URL; some browsers don't render blob URLs via location.href,
          // so also write an HTML wrapper that embeds the PDF via <iframe> or <embed>.
          try {
            previewWindow.document.open()
            previewWindow.document.write(`<!doctype html><html><head><title>Report Preview</title></head><body style="margin:0">
              <iframe src="${pdfUrl}" style="border:0; width:100%; height:100vh;" title="PDF Preview"></iframe>
              <noscript><a href="${pdfUrl}" target="_blank">Open PDF</a></noscript>
              </body></html>`)
            previewWindow.document.close()
          } catch {
            // If writing fails, fall back to setting location
            previewWindow.location.href = pdfUrl
          }
        } catch {
          // Fallback to opening a new window if assignment fails
          window.open(pdfUrl, "_blank")
        }
      } else {
        window.open(pdfUrl, "_blank")
      }
      // Revoke sooner to better match average-case preview loading (30s).
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 30 * 1000)
    } else if (action === "print") {
      const iframe = document.createElement("iframe")
      iframe.style.display = "none"
      iframe.src = pdfUrl
      document.body.appendChild(iframe)
      iframe.contentWindow?.print()
      setTimeout(() => {
        document.body.removeChild(iframe)
        URL.revokeObjectURL(pdfUrl)
      }, 1000)
    } else if (action === "share") {
      URL.revokeObjectURL(pdfUrl)
      await sharePdf(blob, fileName, `${student.studentName} - ${classInfo.termName} Report Card`)
    } else {
      this.doc.save(fileName)
    }

  }

  private async generateMergedReport(
    allStudents: StudentResult[],
    schoolInfo: SchoolInfo,
    classInfo: ClassInfo,
    subjects: Subject[],
    classStatistics: ClassStatistics | null,
    gradingSystem: GradingSystem,
  action: "merge-preview" | "merge-save",
  includePosition: boolean,
  previewWindow?: Window | null,
  ): Promise<void> {
    const mergedPdf = new jsPDF({ orientation: this.config.orientation })
    const batchSize = 10
    let processed = 0

    for (let i = 0; i < allStudents.length; i += batchSize) {
      const batch = allStudents.slice(i, i + batchSize)

      for (const student of batch) {
        this.doc = mergedPdf
        this.currentY = this.config.margins.top

        const passportDataURL = await this.loadPassport(student.passportUrl)

        await this.drawSchoolHeader(schoolInfo, passportDataURL)
        this.drawStudentInfo(student, classInfo)
        this.drawAcademicResults(student, subjects, gradingSystem, classStatistics, includePosition)
        this.drawPerformanceSummary(student, gradingSystem)
        this.drawCommentsSection(student)
        this.drawFooter(student, classInfo)

        if (processed < allStudents.length - 1) {
          mergedPdf.addPage()
        }
        processed++
      }

      console.log(`Processed ${processed}/${allStudents.length} students`)
    }

    stampAllPages(mergedPdf, {
      watermark: this.config.watermark ?? schoolInfo.schoolCode,
      footerRight: schoolInfo.schoolName,
      marginX: this.config.margins.left,
    })

    const fileName = `${classInfo.className}_${classInfo.termName}_All_Reports.pdf`
    const blob = mergedPdf.output("blob")
    const pdfUrl = URL.createObjectURL(blob)

    if (action === "merge-preview") {
      if (previewWindow && !previewWindow.closed) {
        try {
          // try to navigate the opened window
          previewWindow.location.href = pdfUrl
          // also attempt to write an embed to ensure rendering in some browsers
          try {
            previewWindow.document.open()
            previewWindow.document.write(`<html><head><title>Reports Preview</title></head><body style="margin:0"><embed src="${pdfUrl}" type="application/pdf" width="100%" height="100%"></embed></body></html>`)
            previewWindow.document.close()
          } catch {
            // ignore secondary failure
          }
        } catch {
          window.open(pdfUrl, "_blank")
        }
      } else {
        window.open(pdfUrl, "_blank")
      }
    } else {
      const link = document.createElement("a")
      link.href = pdfUrl
      link.download = fileName
      link.click()
    }

    // If we previewed in a pre-opened window, defer revocation so the tab can load the blob URL.
    if (action === "merge-preview") {
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 2 * 60 * 1000)
    } else {
      URL.revokeObjectURL(pdfUrl)
    }
  }

  public async generateStudentReportCard({
    student,
    schoolInfo,
    classInfo,
    subjects,
    classStatistics,
    gradingSystem,
    action = "save",
    allStudents = [],
    includePosition = true,
    previewWindow = null,
  }: GenerateReportParams): Promise<void> {
    try {
      if (["merge-preview", "merge-save"].includes(action) && allStudents.length > 0) {
        await this.generateMergedReport(
          allStudents,
          schoolInfo,
          classInfo,
          subjects,
          classStatistics,
          gradingSystem,
          action as "merge-preview" | "merge-save",
          includePosition,
          previewWindow,
        )
      } else {
        await this.generateSingleReport(
          student,
          schoolInfo,
          classInfo,
          subjects,
          classStatistics,
          gradingSystem,
          action as "save" | "preview" | "print" | "share",
          includePosition,
          previewWindow,
        )
      }
    } catch (error) {
      console.error("PDF Generation Error:", error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate PDF: ${message}`)
    }
  }
}

export async function exportStudentReportPDF(params: {
  student: StudentResult
  schoolInfo: SchoolInfo
  classInfo: ClassInfo
  subjects: Subject[]
  classStatistics: ClassStatistics | null
  gradingSystem: GradingSystem
  action?: "save" | "preview" | "print" | "share" | "merge-preview" | "merge-save"
  allStudents?: StudentResult[]
  includePosition?: boolean
  config?: Partial<PDFConfig>
  /**
   * A window the caller opened synchronously, for `action: "preview"`.
   *
   * Building the PDF is asynchronous, and a `window.open` that happens after an await is
   * treated as unsolicited and blocked by every mainstream browser. The parameter existed on
   * the renderer and nothing ever passed it, so preview silently depended on the popup
   * blocker being off. Open the tab in the click handler and hand it over.
   */
  previewWindow?: Window | null
}): Promise<void> {
  const generator = new StudentReportCardGenerator(params.config)
  await generator.generateStudentReportCard(params)
}
