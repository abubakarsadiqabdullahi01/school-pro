"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Download, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { getClassesForTerm, getStudentsForClassTerm } from "@/app/actions/compiler"
import { generateCASheetPDF, printCASheet } from "@/lib/pdf/ca-sheet-pdf"
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
      const result = await getClassesForTerm(selectedTermId, selectedLevel)
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

  // Get selected term and class info
  const selectedTerm = terms.find((t) => t.id === selectedTermId)
  const selectedClass = classes?.find((c) => c.id === selectedClassId)

      // Handle PDF export
  const handleExportPDF = async () => {
    if (!filteredStudents.length) {
      toast.error("No students to export")
      return
    }

    setIsExporting(true)

    try {
      await generateCASheetPDF({
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
      toast.success("PDF exported successfully")
    } catch (error) {
      console.error("Error exporting PDF:", error)
      toast.error("Failed to export PDF", {
        description: "An error occurred while exporting the PDF. Please try again.",
      })
    } finally {
      setIsExporting(false)
    }
  }

  // Handle print
  const handlePrint = async () => {
    if (!filteredStudents.length) {
      toast.error("No students to print")
      return
    }

    setIsPrinting(true)

    try {
      await printCASheet({
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
    toast.success("Print preview opened in a new tab")
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
            <div className="space-y-2">
              <Label htmlFor="term" className="text-lg font-semibold text-gray-700">
                Academic Term
              </Label>
              <Select value={selectedTermId} onValueChange={setSelectedTermId}>
                <SelectTrigger id="term" className="border-gray-300">
                  <SelectValue placeholder="Select a term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id} className="text-gray-800">
                      {term.session.name} - {term.name}
                      {term.isCurrent && " (Current)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level" className="text-lg font-semibold text-gray-700">
                Class Level
              </Label>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger id="level" className="border-gray-300">
                  <SelectValue placeholder="Select a level" />
                </SelectTrigger>
                <SelectContent>
                  {classLevels.map((level) => (
                    <SelectItem key={level} value={level} className="text-gray-800">
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="class" className="text-lg font-semibold text-gray-700">
                Class
              </Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
                disabled={!selectedTermId || !selectedLevel || isLoadingClasses}
              >
                <SelectTrigger id="class" className="border-gray-300">
                  {isLoadingClasses ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                  ) : (
                    <SelectValue placeholder="Select a class" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id} className="text-gray-800">
                      {cls.name}
                      {cls.teacherName && ` (${cls.teacherName})`}
                    </SelectItem>
                  ))}
                  {classes?.length === 0 && (
                    <SelectItem value="none" disabled className="text-gray-500">
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
                className="border-gray-300 hover:bg-gray-100"
              >
                <Download className="mr-2 h-4 w-4 text-gray-600" />
                Export to PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={!filteredStudents.length || isLoadingStudents}
                className="border-gray-300 hover:bg-gray-100"
              >
                <FileText className="mr-2 h-4 w-4 text-gray-600" />
                Print
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="mb-6 space-y-4">
              <div className=" flex items-start">
                {/* Logo on the left */}
                {schoolLogo && (
                  <div className="flex-shrink-0 pl-4">
                    <Image
                      src={schoolLogo || "/placeholder.svg"}
                      alt={`${schoolName} Logo`}
                      width={90}
                      height={90}
                      className="object-contain"
                      onError={(e) => {
                        console.error("Failed to load school logo:", schoolLogo)
                        e.currentTarget.style.display = "none"
                      }}
                    />
                  </div>
                )}

            {/* School information - centered in remaining space */}
            <div className="flex-1 text-center space-y-2">
              <h1 className="text-3xl font-bold text-gray-800">{schoolName.toUpperCase()}</h1>
              <p className="text-base text-gray-600">{schoolAddress}</p>
              <p className="text-base text-gray-600">
                GSM: {schoolPhone} | Email: {schoolEmail}
              </p>
              <h2 className="text-xl font-semibold text-gray-700">Students Termly Continuous Assessment Sheet</h2>
              <hr className="border-t border-gray-400 my-2 w-3/4 mx-auto" />
            </div>
          </div>

              <div className="space-y-2">
                <div className="flex justify-between text-lg text-gray-700 font-medium px-4 py-2 bg-gray-100 rounded">
                  <span>Class: {selectedClass?.name || ""}</span>
                  <span>Term: {selectedTerm?.name || ""}</span>
                  <span>Session: {selectedTerm?.session.name || ""}</span>
                </div>
                <div className="flex justify-between text-lg text-gray-700 font-medium px-4 py-2 bg-gray-100 rounded">
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
                  <p className="text-gray-500">No students found for this class.</p>
                </div>
              ) : (
                <div className="rounded-md border border-gray-300 overflow-x-auto">
                  <Table className="min-w-full bg-white">
                    <TableHeader>
                      <TableRow className="bg-gray-200">
                        <TableHead className="w-[60px] text-center font-bold text-gray-800">S/N</TableHead>
                        <TableHead className="w-[120px] text-center font-bold text-gray-800">Admission No.</TableHead>
                        <TableHead className="font-bold text-gray-800">Name</TableHead>
                        <TableHead className="text-center font-bold text-gray-800">1st C.A (10%)</TableHead>
                        <TableHead className="text-center font-bold text-gray-800">2nd C.A (10%)</TableHead>
                        <TableHead className="text-center font-bold text-gray-800">3rd C.A (10%)</TableHead>
                        <TableHead className="text-center font-bold text-gray-800">Exam (70%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student, index) => (
                        <TableRow key={student.id} className="hover:bg-gray-100">
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