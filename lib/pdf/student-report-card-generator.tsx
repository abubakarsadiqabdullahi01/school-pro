import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { format } from "date-fns"

interface StudentResult {
  studentId: string
  studentName: string
  admissionNo: string
  gender: string
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
  grade: string
  remark: string
  position: number
  gradingSystem: GradingSystem
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
  id: string
  name: string
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
}

interface GenerateReportParams {
  student: StudentResult
  schoolInfo: SchoolInfo
  classInfo: ClassInfo
  subjects: Subject[]
  classStatistics: ClassStatistics | null
  gradingSystem: GradingSystem
  action?: "save" | "preview" | "print" | "merge-preview" | "merge-save"
  previewWindow?: Window | null
  allStudents?: StudentResult[]
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
    if (!classInfo.termEndDate || !classInfo.nextTermStartDate)
      throw new Error("Term end and next term start dates are required")

    try {
      new Date(classInfo.termEndDate)
      new Date(classInfo.nextTermStartDate)
    } catch {
      throw new Error("Invalid term end or next term start date format")
    }
  }

  private async drawSchoolHeader(schoolInfo: SchoolInfo): Promise<void> {
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

    this.doc.setDrawColor(...this.config.colors.secondary)
    this.doc.setLineWidth(0.5)
    this.doc.line(
      this.config.margins.left,
      this.currentY + 25,
      this.pageWidth - this.config.margins.right,
      this.currentY + 25,
    )

    this.currentY += 28
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
    this.doc.text(gender.toUpperCase(), middleColumnX + genderWidth + 4, this.currentY)

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
    this.doc.text(format(new Date(termEndDate), "MMM d, yyyy"), (rightColumnX - 10) + termEndsWidth + 1, this.currentY + 6)

    this.doc.setFont("helvetica", "bold")
    this.doc.text("Next Term Begins:", rightColumnX + 30, this.currentY + 6)
    const nextTermWidth = this.doc.getTextWidth("Next Term Begins:")
    this.doc.setFont("helvetica", "normal")
    this.doc.text(
      format(new Date(nextTermStartDate), "MMM d, yyyy"),
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
  ): void {
    this.currentY += 1

    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.subheader - 1)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text("COGNITIVE DOMAIN", this.pageWidth / 2, this.currentY, { align: "center" })

    this.currentY += 2

    const headers = [
      "Subject",
      "1st CA\n(10)",
      "2nd CA\n(10)",
      "3rd CA\n(10)",
      "Exam\n(70)",
      "Total",
      "Grade",
      "Pos.",
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
        position,
        outOf,
        lowest,
        highest,
        average,
        remark,
      ]
    })

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
      columnStyles: {
        0: { cellWidth: this.config.tableWidths!.academicResults.subject },
        1: { cellWidth: this.config.tableWidths!.academicResults.ca1, halign: "center" },
        2: { cellWidth: this.config.tableWidths!.academicResults.ca2, halign: "center" },
        3: { cellWidth: this.config.tableWidths!.academicResults.ca3, halign: "center" },
        4: { cellWidth: this.config.tableWidths!.academicResults.exam, halign: "center" },
        5: { cellWidth: this.config.tableWidths!.academicResults.total, halign: "center" },
        6: { cellWidth: this.config.tableWidths!.academicResults.grade, halign: "center" },
        7: { cellWidth: this.config.tableWidths!.academicResults.position, halign: "center" },
        8: { cellWidth: this.config.tableWidths!.academicResults.outOf, halign: "center" },
        9: { cellWidth: this.config.tableWidths!.academicResults.lowest, halign: "center" },
        10: { cellWidth: this.config.tableWidths!.academicResults.highest, halign: "center" },
        11: { cellWidth: this.config.tableWidths!.academicResults.average, halign: "center" },
        12: { cellWidth: this.config.tableWidths!.academicResults.remarks },
      },
      alternateRowStyles: {
        fillColor: this.config.colors.lightGray,
      },
    })

    this.currentY = (this.doc as any).lastAutoTable.finalY + 5
    this.drawCognitiveDomain(student, subjects, classStatistics)
    this.currentY += 4
  }

  private drawCognitiveDomain(
    student: StudentResult,
    subjects: Subject[],
    classStatistics: ClassStatistics | null,
  ): void {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text("ACADEMIC PERFORMANCE", this.config.margins.left, this.currentY)

    this.currentY += 2

    const subjectsOffered = Object.values(student.subjects).filter((subject) => subject.score !== null).length

    const cognitiveData = [
      [
        `Total Score: ${student.totalScore.toFixed(1)}`,
        `Average Score: ${student.averageScore.toFixed(1)}%`,
        `Overall Grade: ${student.grade}`,
        `Position in Class: ${student.position > 0 ? `${student.position}${this.getOrdinalSuffix(student.position)}` : "-"}`,
      ],
      [
        `Total Obtainable: ${(subjects.length * 100).toString()}`,
        `Class Average: ${classStatistics ? classStatistics.classAverage.toFixed(1) + "%" : "-"}`,
        `No. of Subjects Offered: ${subjectsOffered}`,
        `Remark: ${student.remark}`, // Use the remark from grading system
      ],
    ]

    autoTable(this.doc, {
      body: cognitiveData,
      startY: this.currentY,
      theme: "grid",
      styles: {
        fontSize: this.config.fontSize.small,
        cellPadding: 1.5,
        lineColor: [100, 100, 100],
        lineWidth: 0.3,
        valign: "middle",
        overflow: "linebreak",
        cellWidth: "wrap",
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: "auto" },
        1: { fontStyle: "bold", cellWidth: "auto" },
        2: { fontStyle: "bold", cellWidth: "auto" },
        3: { fontStyle: "bold", cellWidth: "auto" },
      },
      margin: { left: this.config.margins.left },
      tableWidth: this.pageWidth - this.config.margins.left - this.config.margins.right,
    })

    this.currentY = (this.doc as any).lastAutoTable.finalY + 6
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

  private drawPsychomotorDomain(): number {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    const middleX = this.pageWidth / 3 + this.config.margins.left - 10
    this.doc.text("PSYCHOMOTOR DOMAIN", middleX, this.currentY)

    const psychomotorData = [
      ["Trait", "Rating"],
      ["Handwriting", "-"],
      ["Sports", "-"],
      ["Arts", "-"],
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

  private drawAffectiveDomain(): number {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    const rightX = (this.pageWidth * 2) / 3 + this.config.margins.left - 5
    this.doc.text("AFFECTIVE DOMAIN", rightX, this.currentY)

    const affectiveData = [
      ["Trait", "Rating"],
      ["Punctuality", "-"],
      ["Neatness", "-"],
      ["Behavior", "-"],
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
    const psychomotorFinalY = this.drawPsychomotorDomain()
    const affectiveFinalY = this.drawAffectiveDomain()

    this.currentY = Math.max(gradesFinalY, psychomotorFinalY, affectiveFinalY) + 10
  }

  private drawCommentsSection(student: StudentResult): void {
    this.doc.setFont("helvetica", "bold")
    this.doc.setFontSize(this.config.fontSize.normal)
    this.doc.setTextColor(...this.config.colors.primary)
    this.doc.text("COMMENTS", this.config.margins.left, this.currentY)

    this.currentY += 5

    const formTeacherComment =
      student.averageScore >= 70
        ? "Very Good Result, Well done!"
        : student.averageScore >= 60
          ? "Good Result, Keep it up!"
          : student.averageScore >= 50
            ? "Fair Result, Work harder."
            : "Poor Result, Much more effort required."

    const headTeacherComment =
      student.averageScore >= 70
        ? "Very Good Result, Forward!"
        : student.averageScore >= 60
          ? "Good Result, Keep improving!"
          : student.averageScore >= 50
            ? "Average Result, Try harder next term."
            : "Below Average, Significant improvement needed."

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
      `Next Term Begins: ${format(new Date(classInfo.nextTermStartDate), "MMM d, yyyy")} | Term Ends: ${format(
        new Date(classInfo.termEndDate),
        "MMM d, yyyy",
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
    action: "save" | "preview" | "print",
    previewWindow?: Window | null,
  ): Promise<void> {
    this.validateInputs(student, schoolInfo, classInfo, subjects)

    await this.drawSchoolHeader(schoolInfo)
    this.drawStudentInfo(student, classInfo)
    this.drawAcademicResults(student, subjects, gradingSystem, classStatistics)
    this.drawPerformanceSummary(student, gradingSystem)
    this.drawCommentsSection(student)
    this.drawFooter(student, classInfo)

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

        await this.drawSchoolHeader(schoolInfo)
        this.drawStudentInfo(student, classInfo)
        this.drawAcademicResults(student, subjects, gradingSystem, classStatistics)
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
        )
      } else {
        await this.generateSingleReport(
          student,
          schoolInfo,
          classInfo,
          subjects,
          classStatistics,
          gradingSystem,
          action as "save" | "preview" | "print",
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
  action?: "save" | "preview" | "print" | "merge-preview" | "merge-save"
  allStudents?: StudentResult[]
  config?: Partial<PDFConfig>
}): Promise<void> {
  const generator = new StudentReportCardGenerator(params.config)
  await generator.generateStudentReportCard(params)
}