"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, CalendarIcon, Search, BookOpen, Info, CheckCircle, Clock } from "lucide-react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { createTerm, updateTerm } from "@/app/actions/term-management"
import { motion } from "framer-motion"

// Define the form schema with validation
const termFormSchema = z
  .object({
    name: z.string().min(2, {
      message: "Term name must be at least 2 characters.",
    }),
    sessionId: z.string().min(1, {
      message: "Please select a session.",
    }),
    startDate: z.date({
      required_error: "Start date is required.",
    }),
    endDate: z.date({
      required_error: "End date is required.",
    }),
    isCurrent: z.boolean().default(false),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date.",
    path: ["endDate"],
  })

type TermFormValues = z.infer<typeof termFormSchema>

interface Session {
  id: string
  name: string
  startDate: Date
  endDate: Date
}

interface TermFormProps {
  sessions: Session[]
  preselectedSessionId?: string
  termData?: {
    id: string
    name: string
    sessionId: string
    startDate: Date | string
    endDate: Date | string
    isCurrent: boolean
  }
}

export function TermForm({ sessions, preselectedSessionId, termData }: TermFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const router = useRouter()

  const isEditMode = !!termData

  // Helper to validate and convert dates
  const parseDate = (date: Date | string | undefined): Date | undefined => {
    if (!date) return undefined
    const parsed = new Date(date)
    return !isNaN(parsed.getTime()) ? parsed : undefined
  }

  const form = useForm<TermFormValues>({
    resolver: zodResolver(termFormSchema),
    defaultValues: {
      name: termData?.name || "",
      sessionId: termData?.sessionId || preselectedSessionId || "",
      startDate: parseDate(termData?.startDate),
      endDate: parseDate(termData?.endDate),
      isCurrent: termData?.isCurrent || false,
    },
  })

  // Filter sessions based on search query
  const filteredSessions = sessions.filter((session) =>
    session.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Update selected session when sessionId changes
  useEffect(() => {
    const sessionId = form.getValues("sessionId")
    if (sessionId) {
      const session = sessions.find((s) => s.id === sessionId)
      if (session) {
        setSelectedSession(session)
      }
    }
  }, [form, sessions])

  // Handle session change
  const handleSessionChange = (sessionId: string) => {
    form.setValue("sessionId", sessionId)
    form.setValue("startDate", undefined)
    form.setValue("endDate", undefined)
    const session = sessions.find((s) => s.id === sessionId)
    if (session) {
      setSelectedSession(session)
    }
  }

  async function onSubmit(data: TermFormValues) {
    setIsLoading(true)
    try {
      if (selectedSession) {
        const sessionStart = parseDate(selectedSession.startDate)
        const sessionEnd = parseDate(selectedSession.endDate)
        if (!sessionStart || !sessionEnd) {
          toast.error("Error", { description: "Invalid session dates" })
          setIsLoading(false)
          return
        }
        if (data.startDate < sessionStart || data.endDate > sessionEnd) {
          toast.error("Error", { description: "Term dates must be within the session date range" })
          setIsLoading(false)
          return
        }
      }

      let result
      if (isEditMode && termData) {
        result = await updateTerm({
          id: termData.id,
          ...data,
        })
      } else {
        result = await createTerm(data)
      }

      if (result.success) {
        toast.success("Success", { description: result.message })
        router.push("/dashboard/super-admin/terms")
        router.refresh()
      } else {
        toast.error("Error", { description: result.error })
      }
    } catch (error: any) {
      console.error("Failed to save term:", error)
      toast.error("Error", { description: error.message || "Failed to save term" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">{isEditMode ? "Edit Academic Term" : "Create Academic Term"}</CardTitle>
              <CardDescription className="text-base">
                {isEditMode ? "Update the term details below" : "Set up a new academic term within a session"}
              </CardDescription>
            </div>
          </div>

          {selectedSession && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Creating term for session <strong>{selectedSession.name}</strong>
                <br />
                <span className="text-sm text-muted-foreground">
                  Session period: {format(parseDate(selectedSession.startDate) || new Date(), "MMM d, yyyy")} to{" "}
                  {format(parseDate(selectedSession.endDate) || new Date(), "MMM d, yyyy")}
                </span>
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-8">
              {/* Term Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Term Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., First Term, Second Term, Third Term"
                        className="h-12 text-base"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter a descriptive name for the academic term (e.g., "First Term", "Second Term")
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Session Selection */}
              <FormField
                control={form.control}
                name="sessionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Academic Session <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value)
                        handleSessionChange(value)
                      }}
                      defaultValue={field.value}
                      disabled={isEditMode || !!preselectedSessionId}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full h-12 text-base">
                          <SelectValue placeholder="Select a session" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <div className="sticky top-0 z-10 bg-background p-2 border-b">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search sessions..."
                              className="pl-8"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                            />
                          </div>
                        </div>
                        {filteredSessions.length === 0 ? (
                          <div className="text-center py-4 text-sm text-muted-foreground">
                            No sessions found
                          </div>
                        ) : (
                          filteredSessions.map((session) => (
                            <SelectItem key={session.id} value={session.id} className="py-3">
                              <div className="flex flex-col">
                                <span className="font-medium">{session.name}</span>
                                <span className="text-sm text-muted-foreground">
                                  {format(parseDate(session.startDate) || new Date(), "MMM yyyy")} –{" "}
                                  {format(parseDate(session.endDate) || new Date(), "MMM yyyy")}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {isEditMode || preselectedSessionId
                        ? "Session cannot be changed after term creation."
                        : "Select the academic session this term belongs to."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Session Date Range Info */}
              {selectedSession && (
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium">Session Date Range:</p>
                      <p className="text-sm">
                        {format(parseDate(selectedSession.startDate) || new Date(), "MMMM d, yyyy")} to{" "}
                        {format(parseDate(selectedSession.endDate) || new Date(), "MMMM d, yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Note: Term dates must be within this session date range.
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Date Range */}
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-base font-semibold">
                        Start Date <span className="text-destructive">*</span>
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "h-12 text-base pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                <div className="flex items-center gap-2">
                                  <CalendarIcon className="h-4 w-4" />
                                  {format(field.value, "PPP")}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <CalendarIcon className="h-4 w-4" />
                                  <span>Pick start date</span>
                                </div>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              if (!selectedSession) return false
                              const sessionStart = parseDate(selectedSession.startDate)
                              const sessionEnd = parseDate(selectedSession.endDate)
                              if (!sessionStart || !sessionEnd) return true
                              return date < sessionStart || date > sessionEnd
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>When the academic term begins</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-base font-semibold">
                        End Date <span className="text-destructive">*</span>
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "h-12 text-base pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                <div className="flex items-center gap-2">
                                  <CalendarIcon className="h-4 w-4" />
                                  {format(field.value, "PPP")}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <CalendarIcon className="h-4 w-4" />
                                  <span>Pick end date</span>
                                </div>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const startDate = form.getValues("startDate")
                              if (!selectedSession) return startDate ? date <= startDate : false
                              const sessionStart = parseDate(selectedSession.startDate)
                              const sessionEnd = parseDate(selectedSession.endDate)
                              if (!sessionStart || !sessionEnd) return true
                              return date < (startDate || sessionStart) || date > sessionEnd
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>When the academic term ends</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Current Term Toggle */}
              <FormField
                control={form.control}
                name="isCurrent"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-2 leading-none">
                        <FormLabel className="text-base font-semibold flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Set as Current Term
                        </FormLabel>
                        <FormDescription className="text-sm">
                          If checked, this will be set as the current active term for the session. This will
                          automatically deactivate any other current term for this session.
                        </FormDescription>
                        {field.value && (
                          <Badge variant="secondary" className="mt-2">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Will be set as current
                          </Badge>
                        )}
                      </div>
                    </div>
                  </FormItem>
                )}
              />

              {/* Info Alert */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  After creating the term, you can assign classes, subjects, and students to this term, as well as set
                  up fee structures and assessment schedules.
                </AlertDescription>
              </Alert>
            </CardContent>

            <CardFooter className="flex justify-between bg-muted/50 rounded-b-lg">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/super-admin/terms")}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="min-w-[120px]">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEditMode ? "Updating..." : "Creating..."}
                  </>
                ) : isEditMode ? (
                  "Update Term"
                ) : (
                  "Create Term"
                )}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </motion.div>
  )
}