"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, CalendarIcon, Search, School, Info, CheckCircle } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { createSession, updateSession } from "@/app/actions/session-management"
import { motion } from "framer-motion"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"

// Define the form schema with validation
const sessionFormSchema = z
  .object({
    name: z.string().min(2, {
      message: "Session name must be at least 2 characters.",
    }),
    schoolId: z.string().min(1, {
      message: "Please select a school.",
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

type SessionFormValues = z.infer<typeof sessionFormSchema>

interface SessionFormProps {
  schools: {
    id: string
    name: string
    code: string
  }[]
  sessionData?: {
    id: string
    name: string
    schoolId: string
    startDate: Date
    endDate: Date
    isCurrent: boolean
  }
}

export function SessionForm({ schools, sessionData }: SessionFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const isEditMode = !!sessionData

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      name: sessionData?.name || "",
      schoolId: sessionData?.schoolId || "",
      startDate: sessionData?.startDate ? new Date(sessionData.startDate) : undefined,
      endDate: sessionData?.endDate ? new Date(sessionData.endDate) : undefined,
      isCurrent: sessionData?.isCurrent || false,
    },
  })

  // Filter schools based on search query
  const filteredSchools = schools.filter(
    (school) =>
      school.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      school.code.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Get selected school info
  const selectedSchool = schools.find((school) => school.id === form.watch("schoolId"))

  async function onSubmit(data: SessionFormValues) {
    setIsLoading(true)
    try {
      let result
      if (isEditMode && sessionData) {
        result = await updateSession({
          id: sessionData.id,
          ...data,
        })
      } else {
        result = await createSession(data)
      }

      if (result.success) {
        toast.success("Success", { description: result.message })
        router.push("/dashboard/super-admin/sessions")
        router.refresh()
      } else {
        toast.error("Error", { description: result.error })
      }
    } catch (error: any) {
      console.error("Failed to save session:", error)
      toast.error("Error", { description: error.message || "Failed to save session" })
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
              <CalendarIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">
                {isEditMode ? "Edit Academic Session" : "Create Academic Session"}
              </CardTitle>
              <CardDescription className="text-base">
                {isEditMode ? "Update the session details below" : "Set up a new academic session for a school"}
              </CardDescription>
            </div>
          </div>

          {selectedSchool && (
            <Alert>
              <School className="h-4 w-4" />
              <AlertDescription>
                Creating session for <strong>{selectedSchool.name}</strong> ({selectedSchool.code})
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-8">
              {/* Session Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Session Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 2023-2024 Academic Year" className="h-12 text-base" {...field} />
                    </FormControl>
                    <FormDescription>
                      Enter a descriptive name for the academic session (e.g., "2023-2024 Academic Year")
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* School Selection */}
              <FormField
                control={form.control}
                name="schoolId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      School <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isEditMode}>
                      <FormControl>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Select a school" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <div className="sticky top-0 p-2 bg-background z-10 border-b">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search schools..."
                              className="pl-8"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                            />
                          </div>
                        </div>
                        {filteredSchools.length === 0 ? (
                          <div className="text-center py-4 text-sm text-muted-foreground">No schools found</div>
                        ) : (
                          filteredSchools.map((school) => (
                            <SelectItem key={school.id} value={school.id} className="py-3">
                              <div className="flex items-center gap-2">
                                <School className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <div className="font-medium">{school.name}</div>
                                  <div className="text-sm text-muted-foreground">Code: {school.code}</div>
                                </div>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {isEditMode
                        ? "School cannot be changed after session creation"
                        : "Select the school this session belongs to"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                                !field.value && "text-muted-foreground",
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
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>When the academic session begins</FormDescription>
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
                                !field.value && "text-muted-foreground",
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
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            disabled={(date) => {
                              const startDate = form.getValues("startDate")
                              return startDate ? date < startDate : false
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>When the academic session ends</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Current Session Toggle */}
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
                          Set as Current Session
                        </FormLabel>
                        <FormDescription className="text-sm">
                          If checked, this will be set as the current active session for the school. This will
                          automatically deactivate any other current session for this school.
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
                  After creating the session, you can add academic terms to organize the session into smaller periods
                  (e.g., First Term, Second Term, Third Term).
                </AlertDescription>
              </Alert>
            </CardContent>

            <CardFooter className="flex justify-between bg-muted/50 rounded-b-lg">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/super-admin/sessions")}
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
                  "Update Session"
                ) : (
                  "Create Session"
                )}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </motion.div>
  )
}
