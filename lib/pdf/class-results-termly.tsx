import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { format } from "date-fns"

interface StudentResult {
  studentId: string
  studentName: string
  admissionNo: string
  gender: "MALE" | "FEMALE" | "OTHER"
  subjects: Record<string, { score: number | null; grade: string | null }>
  totalScore: number
  averageScore: number
  grade: string
  position: number
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
}

interface Subject {
  id: string
  name: string
  code: string
}

interface PDFConfig {
  orientation: "portrait" | "landscape"
  fontSize: {
    header: number
    table: number
    footer: number
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
  }
}

class PDFGenerator {
  private doc: jsPDF
  private config: PDFConfig
  private pageWidth: number
  private pageHeight: number

  constructor(config: Partial<PDFConfig> = {}) {
    this.config = {
      orientation: "landscape",
      fontSize: { header: 12, table: 8, footer: 7 },
      margins: { top: 20, bottom: 20, left: 20, right: 20 },
      colors: {
        primary: [0, 51, 102],
        secondary: [200, 200, 200],
        text: [40, 40, 40],
      },
      ...config,
    }

    this.doc = new jsPDF({ orientation: this.config.orientation })
    this.pageWidth = this.doc.internal.pageSize.width
    this.pageHeight = this.doc.internal.pageSize.height
  }

  private validateInputs(
    results: StudentResult[],
    schoolInfo: SchoolInfo,
    classInfo: ClassInfo,
    subjects: Subject[],
  ): void {
    if (!results?.length) throw new Error("Results array cannot be empty")
    if (!schoolInfo?.schoolName) throw new Error("School name is required")
    if (!classInfo?.className) throw new Error("Class name is required")
    if (!subjects?.length) throw new Error("Subjects array cannot be empty")
  }

  private drawHeader(schoolInfo: SchoolInfo, classInfo: ClassInfo, totalStudents: number): void {
    const { schoolName, schoolAddress, schoolPhone, schoolEmail, schoolLogo } = schoolInfo
    const { className, termName, sessionName, teacherName } = classInfo

    // Logo
    if (schoolLogo) {
      try {
        this.doc.addImage(schoolLogo, "JPEG", this.config.margins.left, 10, 15, 15)
      } catch (error) {
        console.warn("Failed to add logo:", error)
      }
    }

    // School Name (Header, Bold, Underlined)
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.header + 5)
    this.doc.setTextColor(...this.config.colors.primary)
    const schoolNameY = 15
    this.doc.text(schoolName.toUpperCase(), this.pageWidth / 2, schoolNameY, { align: "center" })

    // School Information (Normal)
    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(this.config.fontSize.footer + 2)
    this.doc.setTextColor(...this.config.colors.text)
    this.doc.text(schoolAddress, this.pageWidth / 2, 22, { align: "center" })
    this.doc.text(`Tel: ${schoolPhone} | ${schoolEmail}`, this.pageWidth / 2, 27, { align: "center" })

    // Title (BoldItalic)
    this.doc.setFont("helvetica", "bolditalic")
    this.doc.setFontSize(this.config.fontSize.header)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text("ACADEMIC PERFORMANCE REPORT", this.pageWidth / 2, 35, { align: "center" })

    // Divider
    this.doc.setDrawColor(...this.config.colors.secondary)
    this.doc.setLineWidth(0.3)
    this.doc.line(this.config.margins.left, 38, this.pageWidth - this.config.margins.right, 38)

    // Class Information (Normal, Larger Font)
    this.doc.setFont("helvetica", "normal")
    this.doc.setFontSize(this.config.fontSize.header - 2)
    this.doc.setTextColor(...this.config.colors.text)
    const infoY = 44
    this.doc.text(`Class: ${className}`, this.config.margins.left, infoY)
    this.doc.text(`Term: ${termName}`, this.pageWidth / 2, infoY, { align: "center" })
    this.doc.text(`Academic Year: ${sessionName}`, this.pageWidth - this.config.margins.right, infoY, {
      align: "right",
    })
    this.doc.text(`Teacher: ${teacherName}`, this.config.margins.left, infoY + 6)
    this.doc.text(`Total Students: ${totalStudents}`, this.pageWidth / 2, infoY + 6, { align: "center" })
    this.doc.text(
      `Date: ${format(new Date(), "MMMM d, yyyy")}`,
      this.pageWidth - this.config.margins.right,
      infoY + 6,
      { align: "right" },
    )
  }

  private drawFooter(page: number, totalPages: number): void {
    this.doc.setFontSize(this.config.fontSize.footer)
    this.doc.setTextColor(...this.config.colors.text)

    // Signatures
    const footerY = this.pageHeight - 25
    this.doc.text("Class Teacher: ___________________________", this.config.margins.left, footerY)
    this.doc.text("Head Teacher: ___________________________", this.pageWidth / 2, footerY, { align: "center" })
    this.doc.text("Official Stamp: _________________________", this.pageWidth - this.config.margins.right, footerY, {
      align: "right",
    })

    // Page Number
    this.doc.text(
      `Page ${page} of ${totalPages} | Generated on ${format(new Date(), "MMMM d, yyyy")}`,
      this.pageWidth / 2,
      this.pageHeight - 10,
      { align: "center" },
    )
  }

  private getOrdinalSuffix(n: number): string {
    const s = ["th", "st", "nd", "rd"]
    const v = n % 100
    return s[(v - 20) % 10] || s[v] || s[0]
  }

  public async generateClassResultsPDF({
    results,
    schoolInfo,
    classInfo,
    subjects,
    action = "save",
  }: {
    results: StudentResult[]
    schoolInfo: SchoolInfo
    classInfo: ClassInfo
    subjects: Subject[]
    action?: "save" | "preview"
  }): Promise<void> {
    try {
      this.validateInputs(results, schoolInfo, classInfo, subjects)

      this.drawHeader(schoolInfo, classInfo, results.length)

      // Table Configuration
      const headers = [
        "Pos.",
        "Adm. No.",
        "Student Name",
        "G.",
        ...subjects.map((s) => s.code),
        "Total",
        "Avrg.",
        "Grade",
      ]

      const body = results.map((result) => [
        result.position === 0 ? "-" : `${result.position}${this.getOrdinalSuffix(result.position)}`,
        result.admissionNo,
        result.studentName.toUpperCase(),
        result.gender === "MALE" ? "M" : result.gender === "FEMALE" ? "F" : "O",
        ...subjects.map((s) => {
          const subject = result.subjects[s.id]
          return subject?.score !== null ? subject.score.toFixed(0) : "-"
        }),
        result.totalScore.toFixed(0),
        result.averageScore.toFixed(1),
        result.grade || "-",
      ])

      // Custom column widths for better fit
      const totalColumns = headers.length
      const availableWidth = this.pageWidth - this.config.margins.left - this.config.margins.right
      // Assign relative weights for each column type
      // [Position, Adm No, Student Name, Gender, ...subjects, Total, Average, Grade]
      const nSubjects = subjects.length
      const weights = [0.5, 1.5, 3.0, 0.5]
      for (let i = 0; i < nSubjects; i++) weights.push(1)
      weights.push(0.7) // Total
      weights.push(0.8) // Average
      weights.push(0.7) // Grade
      const totalWeight = weights.reduce((a, b) => a + b, 0)
      const columnStyles: Record<number, any> = {}
      let colIdx = 0
      for (const w of weights) {
        if (colIdx === 1) {
          columnStyles[colIdx] = { cellWidth: (w / totalWeight) * availableWidth, halign: "left" }
        } else if (colIdx === 2) {
          columnStyles[colIdx] = {
            cellWidth: (w / totalWeight) * availableWidth,
            halign: "left",
            overflow: "visible",
          }
        } else {
          columnStyles[colIdx] = { cellWidth: (w / totalWeight) * availableWidth, halign: "center" }
        }
        colIdx++
      }

      autoTable(this.doc, {
        head: [headers],
        body,
        startY: 55,
        theme: "grid",
        styles: {
          fontSize: this.config.fontSize.table,
          font: "helvetica",
          cellPadding: 1,
          textColor: this.config.colors.text,
          overflow: "linebreak",
          lineColor: this.config.colors.secondary,
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: this.config.colors.primary,
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
          fontSize: this.config.fontSize.table + 1,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        columnStyles,
        margin: {
          left: this.config.margins.left,
          right: this.config.margins.right,
        },
        tableWidth: availableWidth,
      })

      // Add footers to all pages
      const pageCount = this.doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        this.doc.setPage(i)
        this.drawFooter(i, pageCount)
      }

      // Output
      const fileName = `${schoolInfo.schoolCode}_${classInfo.className}_${classInfo.termName}_Results.pdf`
      if (action === "preview") {
        const blob = this.doc.output("blob")
        const pdfUrl = URL.createObjectURL(blob)
        window.open(pdfUrl, "_blank")
        URL.revokeObjectURL(pdfUrl)
      } else {
        this.doc.save(fileName)
      }
    } catch (error) {
      console.error("PDF Generation Error:", error)
      throw new Error(`Failed to generate PDF: ${(error as Error).message}`)
    }
  }
}

export async function exportClassResultsPDF(params: {
  results: StudentResult[]
  schoolInfo: SchoolInfo
  classInfo: ClassInfo
  subjects: Subject[]
  action?: "save" | "preview"
  config?: Partial<PDFConfig>
}): Promise<void> {
  const generator = new PDFGenerator(params.config)
  await generator.generateClassResultsPDF(params)
}
