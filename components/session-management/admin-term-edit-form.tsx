"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, CalendarIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { updateTerm } from "@/app/actions/term-management"

// Define the form schema with validation
const termFormSchema = z
  .object({
    name: z.string().min(2, {
      message: "Term name must be at least 2 characters.",
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

interface AdminTermEditFormProps {
  termData: {
    id: string
    name: string
    sessionId: string
    sessionName: string
    schoolName: string
    schoolCode: string
    sessionStartDate: Date
    sessionEndDate: Date
    startDate: Date
    endDate: Date
    isCurrent: boolean
  }
}

export function AdminTermEditForm({ termData }: AdminTermEditFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<TermFormValues>({
    resolver: zodResolver(termFormSchema),
    defaultValues: {
      name: termData.name,
      startDate: new Date(termData.startDate),
      endDate: new Date(termData.endDate),
      isCurrent: termData.isCurrent,
    },
  })

  async function onSubmit(data: TermFormValues) {
    setIsLoading(true)

    try {
      // Validate that term dates are within session dates
      const sessionStartDate = new Date(termData.sessionStartDate)
      const sessionEndDate = new Date(termData.sessionEndDate)

      if (data.startDate < sessionStartDate || data.endDate > sessionEndDate) {
        toast.error("Term dates must be within the session date range")
        setIsLoading(false)
        return
      }

      await updateTerm({
        id: termData.id,
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        isCurrent: data.isCurrent,
      })

      toast.success("Term updated successfully")
      router.push("/dashboard/admin/school-terms")
      router.refresh()
    } catch (error: any) {
      console.error("Failed to update term:", error)
      toast.error(error.message || "Failed to update term")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Term Information</CardTitle>
        <CardDescription>Update the details for this academic term</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">Session Information:</p>
              <p className="text-muted-foreground">
                {termData.sessionName} - {termData.schoolName} ({termData.schoolCode})
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Session Date Range: {format(new Date(termData.sessionStartDate), "MMMM d, yyyy")} to{" "}
                {format(new Date(termData.sessionEndDate), "MMMM d, yyyy")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Note: Term dates must be within this session date range.
              </p>
            </div>

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
                            return (
                              date < new Date(termData.sessionStartDate) || date > new Date(termData.sessionEndDate)
                            )
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
                            return (
                              date < (startDate || new Date(termData.sessionStartDate)) ||
                              date > new Date(termData.sessionEndDate)
                            )
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
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/school-terms")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Term"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
