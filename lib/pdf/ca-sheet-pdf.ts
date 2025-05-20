import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { format } from "date-fns"

interface Student {
  id: string
  admissionNo: string
  fullName: string
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
  className: string | undefined
  termName: string | undefined
  sessionName: string | undefined
  teacherName: string | undefined
}

export function generateCASheetPDF({
  students,
  schoolInfo,
  classInfo,
}: {
  students: Student[]
  schoolInfo: SchoolInfo
  classInfo: ClassInfo
}): jsPDF {
  const {
    schoolName,
    schoolAddress,
    schoolPhone,
    schoolEmail,
    schoolLogo,
  } = schoolInfo
  const { className, termName, sessionName, teacherName } = classInfo

  const doc = new jsPDF()

  // Add school logo
  if (schoolLogo) {
    doc.addImage(schoolLogo, "JPEG", 15, 10, 20, 20)
  }

  // Header
  doc.setFont("times", "bold")
  doc.setFontSize(18)
  doc.text(schoolName.toUpperCase(), 105, 15, { align: "center" })

  doc.setFont("times", "normal")
  doc.setFontSize(10)
  doc.text(schoolAddress, 105, 22, { align: "center" })
  doc.text(`GSM: ${schoolPhone} | Email: ${schoolEmail}`, 105, 28, { align: "center" })

  doc.setFont("times", "bold")
  doc.setFontSize(13)
  doc.text(`TERM CONTINUOUS ASSESSMENT SHEET`, 105, 38, { align: "center" })

  doc.setLineWidth(0.5)
  doc.line(20, 42, 190, 42)

  // Class Info
  doc.setFontSize(10)
  doc.setFont("times", "normal")
  doc.text(`Class: ${className || "______"}`, 20, 48)
  doc.text(`Term: ${termName || "______"}`, 105, 48, { align: "center" })
  doc.text(`Session: ${sessionName || "______"}`, 190, 48, { align: "right" })

  // Subject and Teacher
  doc.text(`Subject: __________________________________________`, 20, 55)
  doc.text(`Teacher: ${teacherName || "_____________________________"}`, 190, 55, { align: "right" })

  // Table headers
  const tableColumn = [
    "S/N",
    "Admission No.",
    "Student Name",
    "1st C.A",
    "2nd C.A",
    "3rd C.A",
    "Exam",
  ]

  const tableRows = students.map((student, index) => [
    (index + 1).toString(),
    student.admissionNo,
    student.fullName.toUpperCase(),
    "",
    "",
    "",
    "",
  ])

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 65,
    theme: "grid",
    styles: {
      fontSize: 8,
      font: "times",
      valign: "middle",
      cellPadding: 1, // Default padding for all, override S/N later
    },
    headStyles: {
      fillColor: [230, 230, 230],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center", cellPadding: 0 }, // S/N
      1: { cellWidth: 35, halign: "left" }, // Admission No.
      2: { cellWidth: 75, halign: "left" }, // Student Name
      3: { cellWidth: 15, halign: "center" }, // 1st CA
      4: { cellWidth: 15, halign: "center" }, // 2nd CA
      5: { cellWidth: 15, halign: "center" }, // 3rd CA
      6: { cellWidth: 15, halign: "center" }, // Exam
    },
  })

  // Signature lines
  const pageHeight = doc.internal.pageSize.height
  doc.setFontSize(10)
  doc.text("Teacher's Signature: ___________________________", 20, pageHeight - 30)
  doc.text("Head Teacher's Signature: ___________________________", 120, pageHeight - 30)

  // Footer with date
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont("times", "normal")
    doc.text(
      `Generated on ${format(new Date(), "MMM dd, yyyy")} | Page ${i} of ${pageCount}`,
      105,
      doc.internal.pageSize.height - 10,
      { align: "center" },
    )
  }

  return doc
}

export async function printCASheet({
  students,
  schoolInfo,
  classInfo,
}: {
  students: Student[]
  schoolInfo: SchoolInfo
  classInfo: ClassInfo
}) {
  const doc = generateCASheetPDF({ students, schoolInfo, classInfo })

  const pdfBlob = doc.output("blob")
  const pdfUrl = URL.createObjectURL(pdfBlob)

  const printWindow = window.open(pdfUrl, "_blank")
  if (printWindow) {
    printWindow.focus()
    printWindow.onload = () => {
      printWindow.print()
    }
  }
}
