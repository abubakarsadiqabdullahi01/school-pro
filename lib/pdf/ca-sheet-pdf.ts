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

export async function generateCASheetPDF({
  students,
  schoolInfo,
  classInfo,
}: {
  students: Student[]
  schoolInfo: SchoolInfo
  classInfo: ClassInfo
}): Promise<jsPDF> {
  const {
    schoolName,
    schoolAddress,
    schoolPhone,
    schoolEmail,
    schoolLogo,
  } = schoolInfo
  const { className, termName, sessionName, teacherName } = classInfo

  const doc = new jsPDF()

  let logoDataURL: string | null = null

  // Handle school logo - use API approach only
  if (schoolLogo) {
    try {
      console.log('Processing school logo:', schoolLogo)
      
      // If it's already a data URL, use it directly
      if (schoolLogo.startsWith('data:')) {
        logoDataURL = schoolLogo
        console.log('Using existing data URL')
      } else {
        // Use API approach for external URLs
        logoDataURL = await getImageDataURLViaAPI(schoolLogo)
      }
      
      if (logoDataURL) {
        console.log('Logo processed successfully')
      } else {
        console.log('Logo processing failed, continuing without logo')
      }
    } catch (error) {
      console.warn('Failed to load school logo:', error)
      logoDataURL = null
    }
  }

  // Add school logo if available
  if (logoDataURL) {
    try {
      // Determine image format from data URL
      const imageFormat = logoDataURL.includes('image/png') ? 'PNG' : 
                         logoDataURL.includes('image/jpeg') ? 'JPEG' : 'JPEG'
      
      doc.addImage(logoDataURL, imageFormat, 15, 10, 20, 20)
      console.log('Logo added to PDF successfully')
    } catch (error) {
      console.warn('Failed to add image to PDF:', error)
      // Continue without logo
    }
  } else {
    console.log('No logo available for PDF')
  }

  // Header - Adjust position based on whether logo was added
  const headerStartY = logoDataURL ? 15 : 20
  
  doc.setFont("times", "bold")
  doc.setFontSize(18)
  doc.text(schoolName.toUpperCase(), 105, headerStartY, { align: "center" })

  doc.setFont("times", "normal")
  doc.setFontSize(10)
  doc.text(schoolAddress, 105, headerStartY + 7, { align: "center" })
  doc.text(`GSM: ${schoolPhone} | Email: ${schoolEmail}`, 105, headerStartY + 14, { align: "center" })

  doc.setFont("times", "bold")
  doc.setFontSize(13)
  doc.text(`TERM CONTINUOUS ASSESSMENT SHEET`, 105, headerStartY + 24, { align: "center" })

  doc.setLineWidth(0.5)
  doc.line(20, headerStartY + 28, 190, headerStartY + 28)

  // Class Info
  doc.setFontSize(10)
  doc.setFont("times", "normal")
  const classInfoY = headerStartY + 34
  doc.text(`Class: ${className || "______"}`, 20, classInfoY)
  doc.text(`Term: ${termName || "______"}`, 105, classInfoY, { align: "center" })
  doc.text(`Session: ${sessionName || "______"}`, 190, classInfoY, { align: "right" })

  // Subject and Teacher
  doc.text(`Subject: __________________________________________`, 20, classInfoY + 7)
  doc.text(`Teacher: ${teacherName || "_____________________________"}`, 190, classInfoY + 7, { align: "right" })

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
    startY: classInfoY + 15,
    theme: "grid",
    styles: {
      fontSize: 8,
      font: "times",
      valign: "middle",
      cellPadding: 1,
    },
    headStyles: {
      fillColor: [230, 230, 230],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center", cellPadding: 0 },
      1: { cellWidth: 35, halign: "left" },
      2: { cellWidth: 75, halign: "left" },
      3: { cellWidth: 15, halign: "center" },
      4: { cellWidth: 15, halign: "center" },
      5: { cellWidth: 15, halign: "center" },
      6: { cellWidth: 15, halign: "center" },
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
  try {
    const doc = await generateCASheetPDF({ students, schoolInfo, classInfo })

    const pdfBlob = doc.output("blob")
    const pdfUrl = URL.createObjectURL(pdfBlob)

    const printWindow = window.open(pdfUrl, "_blank")
    if (printWindow) {
      printWindow.focus()
      // Wait for the PDF to load before printing
      printWindow.onload = () => {
        printWindow.print()
      }
    }
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw error
  }
}