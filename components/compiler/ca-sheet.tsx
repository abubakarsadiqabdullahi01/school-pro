"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Download, FileText, Loader2, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { getClassesForTerm, getStudentsForClassTerm } from "@/app/actions/compiler"
import { generateCASheetPDF, printCASheet, shareCASheet } from "@/lib/pdf/ca-sheet-pdf"
import Image from "next/image"
import type { ClassLevel } from "@prisma/client"
import { toast } from "sonner"

interface CASheetProps {
  schoolId: string
  schoolName: string
  schoolCode: string
  schoolAddress: string
  schoolPhone: string
  schoolEmail: string
  schoolLogo: string | null
  terms: {
    id: string
    name: string
    isCurrent: boolean
    session: {
      id: string
      name: string
    }
  }[]
  currentTermId: string | undefined
  classLevels: ClassLevel[]
}

interface Student {
  id: string
  admissionNo: string
  fullName: string
}

export function CASheetComponent({
  schoolId,
  schoolName,
  schoolCode,
  schoolAddress,
  schoolPhone,
  schoolEmail,
  schoolLogo,
  terms,
  currentTermId,
  classLevels,
}: CASheetProps) {
  const [selectedTermId, setSelectedTermId] = useState<string>(currentTermId || "")
  const [logoLoadError, setLogoLoadError] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState<string>("")
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [selectedClassTermId, setSelectedClassTermId] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [isExporting, setIsExporting] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)

  // Fetch classes for the selected term and level
  const {
    data: classes,
    isLoading: isLoadingClasses,
    refetch: refetchClasses,
  } = useQuery({
    queryKey: ["classes", selectedTermId, selectedLevel],
    queryFn: async () => {
      if (!selectedTermId || !selectedLevel) return []
      const result = await getClassesForTerm(selectedTermId, selectedLevel as ClassLevel)
      return result.success ? result.data : []
    },
    enabled: !!selectedTermId && !!selectedLevel,
  })

  // Fetch students for the selected class term
  const {
    data: students,
    isLoading: isLoadingStudents,
    refetch: refetchStudents,
  } = useQuery({
    queryKey: ["students", selectedClassTermId],
    queryFn: async () => {
      if (!selectedClassTermId) return []
      const result = await getStudentsForClassTerm(selectedClassTermId)
      return result.success ? result.data : []
    },
    enabled: !!selectedClassTermId,
  })

  // Reset class selection when term or level changes
  useEffect(() => {
    setSelectedClassId("")
    setSelectedClassTermId("")
    if (selectedTermId && selectedLevel) {
      refetchClasses()
    }
  }, [selectedTermId, selectedLevel, refetchClasses])

  // Reset class term when class changes
  useEffect(() => {
    if (selectedClassId && classes) {
      const classTermId = classes.find((c) => c.id === selectedClassId)?.classTermId
      setSelectedClassTermId(classTermId || "")
      if (classTermId) {
        refetchStudents()
      }
    }
  }, [selectedClassId, classes, refetchStudents])

  // Filter students based on search query
  const filteredStudents =
    students?.filter(
      (student) =>
        student.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.admissionNo.toLowerCase().includes(searchQuery.toLowerCase()),
    ) || []

    console.log("schoolLogo", schoolLogo);  
  // Get selected term and class info
  const selectedTerm = terms.find((t) => t.id === selectedTermId)
  const selectedClass = classes?.find((c) => c.id === selectedClassId)

  const handleExportPDF = async () => {
    if (!filteredStudents.length) {
      toast.error("No students to export")
      return
    }

    setIsExporting(true)

    try {
      const doc = await generateCASheetPDF({
        students: filteredStudents,
        schoolInfo: {
          schoolName,
          schoolCode,
          schoolAddress,
          schoolPhone,
          schoolEmail,
          schoolLogo: logoLoadError ? null : schoolLogo, 
        },
        classInfo: {
          className: selectedClass?.name,
          termName: selectedTerm?.name,
          sessionName: selectedTerm?.session.name,
          teacherName: selectedClass?.teacherName,
        },
      })
      
      doc.save(`CA-Sheet-${selectedClass?.name}-${selectedTerm?.name}.pdf`)
      toast.success("PDF exported successfully")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      
      // Check if it's a logo-related error
      if (error instanceof Error && error.message.includes('logo')) {
        setLogoLoadError(true)
      }
      
      toast.error("Failed to export PDF", {
        description: "An error occurred while exporting the PDF. Please try again.",
      })
    } finally {
      setIsExporting(false)
    }
  }

  // Handle print
  const handlePrint = async (mode: "print" | "share" = "print") => {
    if (!filteredStudents.length) {
      toast.error("No students to print")
      return
    }

    setIsPrinting(true)

    try {
      await (mode === "share" ? shareCASheet : printCASheet)({
        students: filteredStudents,
        schoolInfo: {
          schoolName,
          schoolCode,
          schoolAddress,
          schoolPhone,
          schoolEmail,
          schoolLogo,
        },
        classInfo: {
          className: selectedClass?.name,
          termName: selectedTerm?.name,
          sessionName: selectedTerm?.session.name,
          teacherName: selectedClass?.teacherName,
        },
      })
    if (mode === "print") toast.success("Print preview opened in a new tab")
    } catch (error) {
      console.error("Error printing:", error)
      toast.error("Failed to print", {
        description: "An error occurred while preparing the print. Please try again.",
      })
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <Card className="border shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Select Class and Term</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="term" className="text-lg font-semibold text-foreground">
                Academic Term
              </Label>
              <Select value={selectedTermId} onValueChange={setSelectedTermId}>
                <SelectTrigger id="term" className="w-full min-h-10 bg-card border-border hover:border-border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
                  <SelectValue placeholder="Select a term" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto bg-card border border-border shadow-lg rounded-md">
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id} className="px-3 py-2 hover:bg-muted/50 focus:bg-muted/50 cursor-pointer transition-colors text-foreground">
                      {term.session.name} - {term.name}
                      {term.isCurrent && " (Current)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="level" className="text-lg font-semibold text-foreground">
                Class Section
              </Label>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger id="level" className="w-full min-h-10 bg-card border-border hover:border-border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
                  <SelectValue placeholder="Select a section" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto bg-card border border-border shadow-lg rounded-md">
                  {classLevels.map((level) => (
                    <SelectItem key={level} value={level} className="px-3 py-2 hover:bg-muted/50 focus:bg-muted/50 cursor-pointer transition-colors text-foreground">
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="class" className="text-lg font-semibold text-foreground">
                Class
              </Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
                disabled={!selectedTermId || !selectedLevel || isLoadingClasses}
              >
                <SelectTrigger
                  id="class"
                  className="w-full min-h-10 bg-card border-border hover:border-border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-muted disabled:cursor-not-allowed"
                >
                  {isLoadingClasses ? (
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <SelectValue placeholder="Select a class" />
                  )}
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto bg-card border border-border shadow-lg rounded-md">
                  {classes?.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id} className="px-3 py-2 hover:bg-muted/50 focus:bg-muted/50 cursor-pointer transition-colors text-foreground">
                      {cls.name}
                      {cls.teacherName && ` (${cls.teacherName})`}
                    </SelectItem>
                  ))}
                  {classes?.length === 0 && (
                    <SelectItem value="none" disabled className="px-3 py-2 text-muted-foreground cursor-not-allowed">
                      No classes available for this term and level
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedClassTermId && (
        <Card className="shadow-md border-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl font-bold">Continuous Assessment Sheet</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={!filteredStudents.length || isLoadingStudents}
                className="border-border hover:bg-muted"
              >
                <Download className="mr-2 h-4 w-4 text-muted-foreground" />
                Export to PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrint()}
                disabled={!filteredStudents.length || isLoadingStudents}
                className="border-border hover:bg-muted"
              >
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrint("share")}
                disabled={!filteredStudents.length || isLoadingStudents || isPrinting}
                className="border-gray-300 hover:bg-gray-100"
              >
                <Share2 className="mr-2 h-4 w-4 text-gray-600" />
                Share
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="mb-6 space-y-4">
              <div className=" flex items-start">
                {/* Logo on the left */}
                {schoolLogo && (
                  <div className="flex-shrink-0 pl-4">
                    {schoolLogo ? (
                      <Image
                        src={schoolLogo}
                        alt={`${schoolName} Logo`}
                        width={90}
                        height={90}
                        className="object-contain"
                      />
                    ) : (
                      <div className="h-20 w-20 flex items-center justify-center rounded bg-muted border border-border">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-10 w-10 text-muted-foreground"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M3 21v-13l9-5 9 5v13" />
                          <path d="M9 10h.01M15 10h.01" />
                          <path d="M9 14h6" />
                        </svg>
                      </div>
                    )}
                  </div>
                )}

            {/* School information - centered in remaining space */}
            <div className="flex-1 text-center space-y-2">
              <h1 className="text-3xl font-bold text-foreground">{schoolName.toUpperCase()}</h1>
              <p className="text-base text-muted-foreground">{schoolAddress}</p>
              <p className="text-base text-muted-foreground">
                GSM: {schoolPhone} | Email: {schoolEmail}
              </p>
              <h2 className="text-xl font-semibold text-foreground">Students Termly Continuous Assessment Sheet</h2>
              <hr className="border-t border-border my-2 w-3/4 mx-auto" />
            </div>
          </div>

              <div className="space-y-2">
                <div className="flex justify-between text-lg text-foreground font-medium px-4 py-2 bg-muted rounded">
                  <span>Class: {selectedClass?.name || ""}</span>
                  <span>Term: {selectedTerm?.name || ""}</span>
                  <span>Session: {selectedTerm?.session.name || ""}</span>
                </div>
                <div className="flex justify-between text-lg text-foreground font-medium px-4 py-2 bg-muted rounded">
                  <span>Subject: <span className="border-b border-dotted border-gray-500 w-64 inline-block"></span></span>
                  <span>Teacher: {selectedClass?.teacherName ? (
                    selectedClass.teacherName
                  ) : (
                    <span className="border-b border-dotted border-gray-500 w-64 inline-block"></span>
                  )}</span>
                </div>
              </div>

              {isLoadingStudents ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground">No students found for this class.</p>
                </div>
              ) : (
                <div className="rounded-md border border-border overflow-x-auto">
                  <Table className="min-w-full bg-card">
                    <TableHeader>
                      <TableRow className="bg-muted">
                        <TableHead className="w-[60px] text-center font-bold text-foreground">S/N</TableHead>
                        <TableHead className="w-[120px] text-center font-bold text-foreground">Admission No.</TableHead>
                        <TableHead className="font-bold text-foreground">Name</TableHead>
                        <TableHead className="text-center font-bold text-foreground">1st C.A (10%)</TableHead>
                        <TableHead className="text-center font-bold text-foreground">2nd C.A (10%)</TableHead>
                        <TableHead className="text-center font-bold text-foreground">3rd C.A (10%)</TableHead>
                        <TableHead className="text-center font-bold text-foreground">Exam (70%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student, index) => (
                        <TableRow key={student.id} className="hover:bg-muted">
                          <TableCell className="text-center">{index + 1}</TableCell>
                          <TableCell className="text-center">{student.admissionNo}</TableCell>
                          <TableCell>{student.fullName.toUpperCase()}</TableCell>
                          <TableCell className="text-center"></TableCell>
                          <TableCell className="text-center"></TableCell>
                          <TableCell className="text-center"></TableCell>
                          <TableCell className="text-center"></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
