"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, CalendarIcon, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { createTerm, updateTerm } from "@/app/actions/term-management"

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
    startDate: Date
    endDate: Date
    isCurrent: boolean
  }
}

export function TermForm({ sessions, preselectedSessionId, termData }: TermFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const router = useRouter()
  const isEditMode = !!termData

  const form = useForm<TermFormValues>({
    resolver: zodResolver(termFormSchema),
    defaultValues: {
      name: termData?.name || "",
      sessionId: termData?.sessionId || preselectedSessionId || "",
      startDate: termData?.startDate ? new Date(termData.startDate) : undefined,
      endDate: termData?.endDate ? new Date(termData.endDate) : undefined,
      isCurrent: termData?.isCurrent || false,
    },
  })

  // Filter sessions based on search query
  const filteredSessions = sessions.filter((session) => session.name.toLowerCase().includes(searchQuery.toLowerCase()))

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

    // Reset dates when session changes
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
      // Validate that term dates are within session dates
      if (selectedSession) {
        if (data.startDate < selectedSession.startDate || data.endDate > selectedSession.endDate) {
          toast.error("Term dates must be within the session date range")
          setIsLoading(false)
          return
        }
      }

      if (isEditMode && termData) {
        await updateTerm({
          id: termData.id,
          ...data,
        })
        toast.success("Term updated successfully")
      } else {
        await createTerm(data)
        toast.success("Term created successfully")
      }

      // Immediately redirect after successful submission
      router.push("/dashboard/super-admin/terms")

      // Force a refresh to update the terms list
      router.refresh()
    } catch (error: any) {
      console.error("Failed to save term:", error)
      toast.error(error.message || "Failed to save term")
      setIsLoading(false) // Only reset loading state on error
    }
    // Remove the finally block to keep loading state active until redirect completes
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit Term" : "Term Information"}</CardTitle>
        <CardDescription>
          {isEditMode ? "Update the term details" : "Enter the details for the new academic term"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Term Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., First Term, Second Term, etc." {...field} />
                  </FormControl>
                  <FormDescription>Enter a descriptive name for the academic term</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sessionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Academic Session <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={handleSessionChange}
                    defaultValue={field.value}
                    disabled={isEditMode || !!preselectedSessionId}
                  >
                    <FormControl>
                      <SelectTrigger  className="w-full">
                        <SelectValue placeholder="Select a session" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <div className="sticky top-0 p-2 bg-background z-10 border-b">
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
                        <div className="text-center py-4 text-sm text-muted-foreground">No sessions found</div>
                      ) : (
                        filteredSessions.map((session) => (
                          <SelectItem key={session.id} value={session.id}>
                            {session.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>The academic session this term belongs to</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedSession && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Session Date Range:</p>
                <p className="text-muted-foreground">
                  {format(new Date(selectedSession.startDate), "MMMM d, yyyy")} to{" "}
                  {format(new Date(selectedSession.endDate), "MMMM d, yyyy")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Note: Term dates must be within this session date range.
                </p>
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>
                      Start Date <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          disabled={(date) => {
                            if (!selectedSession) return false
                            return date < selectedSession.startDate || date > selectedSession.endDate
                          }}
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
                    <FormLabel>
                      End Date <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          disabled={(date) => {
                            const startDate = form.getValues("startDate")
                            if (!selectedSession) return startDate ? date < startDate : false
                            return date < (startDate || selectedSession.startDate) || date > selectedSession.endDate
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>When the academic term ends</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isCurrent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Set as Current Term</FormLabel>
                    <FormDescription>
                      If checked, this will be set as the current active term for the session. This will automatically
                      deactivate any other current term for this session.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/super-admin/terms")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
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
  )
}
