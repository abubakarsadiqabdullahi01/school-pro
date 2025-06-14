"use client"

import { useState, useEffect, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { TransitionSelectionControls } from "./TransitionSelectionControls"
import { TransitionSummaryCards } from "./TransitionSummaryCards"
import { StudentTransitionTable } from "./StudentTransitionTable"
import { TransitionHistoryTable } from "./TransitionHistoryTable"
import {
  getTransitionOptions,
  getTransitionClasses,
  getStudentsForTransition,
  getTransitionHistory,
} from "@/app/actions/student-transitions"
import { toast } from "sonner"

interface StudentTransitionsOverviewProps {
  schoolId: string
  schoolName: string
  schoolCode: string
}

export function StudentTransitionsOverview({ schoolId, schoolName, schoolCode }: StudentTransitionsOverviewProps) {
  // State for transition form
  const [form, setForm] = useState({
    fromTermId: "",
    toTermId: "",
    fromClassTermId: "",
    toClassTermId: "",
    transitionType: "PROMOTION",
  })

  // State for data
  const [transitionOptions, setTransitionOptions] = useState<any>(null)
  const [transitionClasses, setTransitionClasses] = useState<any>({
    sourceClasses: [],
    destinationClasses: [],
  })
  const [studentsForTransition, setStudentsForTransition] = useState<any>(null)
  const [transitionHistory, setTransitionHistory] = useState<any>([])

  // Loading states
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [isLoadingClasses, setIsLoadingClasses] = useState(false)
  const [isLoadingStudents, setIsLoadingStudents] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Fetch transition options on mount
  useEffect(() => {
    async function fetchTransitionOptions() {
      setIsLoadingOptions(true)
      try {
        const result = await getTransitionOptions()
        if (result.success) {
          setTransitionOptions(result.data)

          // If there's a current term, pre-select it as the source term
          if (result.data.currentTerm) {
            setForm((prev) => ({
              ...prev,
              fromTermId: result.data.currentTerm.id,
            }))
          }
        } else {
          toast.error("Error", {
            description: result.error || "Failed to load transition options",
          })
        }
      } catch (error) {
        console.error("Error fetching transition options:", error)
        toast.error("Error", {
          description: "An unexpected error occurred",
        })
      } finally {
        setIsLoadingOptions(false)
      }
    }

    fetchTransitionOptions()
  }, [])

  // Fetch transition history on mount
  useEffect(() => {
    async function fetchTransitionHistory() {
      setIsLoadingHistory(true)
      try {
        const result = await getTransitionHistory()
        if (result.success) {
          setTransitionHistory(result.data)
        } else {
          console.error("Failed to get transition history:", result.error)
        }
      } catch (error) {
        console.error("Error fetching transition history:", error)
      } finally {
        setIsLoadingHistory(false)
      }
    }

    fetchTransitionHistory()
  }, [])

  // Fetch classes when source term changes
  useEffect(() => {
    async function fetchSourceClasses() {
      if (!form.fromTermId) {
        setTransitionClasses((prev: any) => ({
          ...prev,
          sourceClasses: [],
        }))
        return
      }

      setIsLoadingClasses(true)
      try {
        // We'll fetch source classes even if destination term isn't selected yet
        const result = await getTransitionClasses(form.fromTermId, form.toTermId || form.fromTermId)
        if (result.success) {
          setTransitionClasses((prev: any) => ({
            ...prev,
            sourceClasses: result.data.sourceClasses || [],
          }))
        } else {
          console.error("Failed to load source classes:", result.error)
          setTransitionClasses((prev: any) => ({
            ...prev,
            sourceClasses: [],
          }))
        }
      } catch (error) {
        console.error("Error fetching source classes:", error)
        setTransitionClasses((prev: any) => ({
          ...prev,
          sourceClasses: [],
        }))
      } finally {
        setIsLoadingClasses(false)
      }
    }

    fetchSourceClasses()
  }, [form.fromTermId])

  // Fetch destination classes when destination term changes
  useEffect(() => {
    async function fetchDestinationClasses() {
      if (!form.toTermId || !form.fromTermId) {
        setTransitionClasses((prev: any) => ({
          ...prev,
          destinationClasses: [],
        }))
        return
      }

      setIsLoadingClasses(true)
      try {
        const result = await getTransitionClasses(form.fromTermId, form.toTermId)
        if (result.success) {
          setTransitionClasses((prev: any) => ({
            ...prev,
            destinationClasses: result.data.destinationClasses || [],
          }))
        } else {
          console.error("Failed to load destination classes:", result.error)
          setTransitionClasses((prev: any) => ({
            ...prev,
            destinationClasses: [],
          }))
        }
      } catch (error) {
        console.error("Error fetching destination classes:", error)
        setTransitionClasses((prev: any) => ({
          ...prev,
          destinationClasses: [],
        }))
      } finally {
        setIsLoadingClasses(false)
      }
    }

    if (form.toTermId) {
      fetchDestinationClasses()
    }
  }, [form.toTermId, form.fromTermId])

  // Fetch students when source class is selected
  useEffect(() => {
    async function fetchStudentsForTransition() {
      if (!form.fromClassTermId) {
        setStudentsForTransition(null)
        return
      }

      setIsLoadingStudents(true)
      try {
        const result = await getStudentsForTransition(form.fromClassTermId)
        if (result.success) {
          setStudentsForTransition(result.data)
        } else {
          console.error("Failed to load students:", result.error)
          setStudentsForTransition(null)
          toast.error("Error", {
            description: result.error || "Failed to load students",
          })
        }
      } catch (error) {
        console.error("Error fetching students for transition:", error)
        setStudentsForTransition(null)
      } finally {
        setIsLoadingStudents(false)
      }
    }

    fetchStudentsForTransition()
  }, [form.fromClassTermId])

  // Handle form changes
  const handleFromTermChange = useCallback((value: string) => {
    setForm((prev) => ({
      ...prev,
      fromTermId: value,
      fromClassTermId: "", // Reset class selection when term changes
    }))
    setStudentsForTransition(null) // Clear students when term changes
  }, [])

  const handleToTermChange = useCallback((value: string) => {
    setForm((prev) => ({
      ...prev,
      toTermId: value,
      toClassTermId: "", // Reset class selection when term changes
    }))
  }, [])

  const handleFromClassChange = useCallback((value: string) => {
    setForm((prev) => ({
      ...prev,
      fromClassTermId: value,
    }))
  }, [])

  const handleToClassChange = useCallback((value: string) => {
    setForm((prev) => ({
      ...prev,
      toClassTermId: value,
    }))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Student Transitions</h2>
          <p className="text-muted-foreground">
            Manage student transitions between terms and classes for {schoolName} ({schoolCode})
          </p>
        </div>
      </div>

      <Tabs defaultValue="transitions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transitions">Transitions</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="transitions" className="space-y-4">
          <TransitionSelectionControls
            form={form}
            transitionOptions={transitionOptions}
            transitionClasses={transitionClasses}
            isLoadingOptions={isLoadingOptions}
            isLoadingClasses={isLoadingClasses}
            onFromTermChange={handleFromTermChange}
            onToTermChange={handleToTermChange}
            onFromClassChange={handleFromClassChange}
            onToClassChange={handleToClassChange}
          />

          {/* Show alert if no source classes are available */}
          {form.fromTermId && !isLoadingClasses && transitionClasses.sourceClasses.length === 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                No classes are available for the selected source term. You may need to create ClassTerm records that
                link your classes to this term.
              </AlertDescription>
            </Alert>
          )}

          {/* Show summary cards only when we have student data */}
          {studentsForTransition && studentsForTransition.statistics && studentsForTransition.classInfo && (
            <TransitionSummaryCards
              statistics={studentsForTransition.statistics}
              classInfo={studentsForTransition.classInfo}
            />
          )}

          <StudentTransitionTable
            students={studentsForTransition?.students || []}
            isLoading={isLoadingStudents}
            fromClassTermId={form.fromClassTermId}
            toClassTermId={form.toClassTermId}
            transitionType={form.transitionType}
            classInfo={studentsForTransition?.classInfo}
            onTransitionComplete={() => {
              // Refresh students after transition
              if (form.fromClassTermId) {
                getStudentsForTransition(form.fromClassTermId).then((result) => {
                  if (result.success) {
                    setStudentsForTransition(result.data)
                  }
                })
              }

              // Refresh history after transition
              getTransitionHistory().then((result) => {
                if (result.success) {
                  setTransitionHistory(result.data)
                }
              })
            }}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transition History</CardTitle>
              <CardDescription>View past student transitions</CardDescription>
            </CardHeader>
            <CardContent>
              <TransitionHistoryTable transitions={transitionHistory} isLoading={isLoadingHistory} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
