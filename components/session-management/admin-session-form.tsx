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
import { createSession } from "@/app/actions/session-management"

// Define the form schema with validation
const sessionFormSchema = z
  .object({
    name: z.string().min(2, {
      message: "Session name must be at least 2 characters.",
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

interface AdminSessionFormProps {
  schoolId: string
  schoolName: string
  schoolCode: string
}

export function AdminSessionForm({ schoolId, schoolName, schoolCode }: AdminSessionFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      name: "",
      startDate: undefined,
      endDate: undefined,
      isCurrent: false,
    },
  })

  async function onSubmit(data: SessionFormValues) {
    setIsLoading(true)

    try {
      await createSession({
        name: data.name,
        schoolId: schoolId,
        startDate: data.startDate,
        endDate: data.endDate,
        isCurrent: data.isCurrent,
      })

      toast.success("Session created successfully")
      router.push("/dashboard/admin/school-sessions")
      router.refresh()
    } catch (error: any) {
      console.error("Failed to save session:", error)
      toast.error(error.message || "Failed to save session")
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session Information</CardTitle>
        <CardDescription>Enter the details for the new academic session</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">School Information:</p>
              <p className="text-muted-foreground">
                {schoolName} ({schoolCode})
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                This session will be created for your assigned school.
              </p>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Session Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 2023-2024 Academic Year" {...field} />
                  </FormControl>
                  <FormDescription>Enter a descriptive name for the academic session</FormDescription>
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
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
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

            <FormField
              control={form.control}
              name="isCurrent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Set as Current Session</FormLabel>
                    <FormDescription>
                      If checked, this will be set as the current active session for your school. This will
                      automatically deactivate any other current session.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/admin/school-sessions")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Session"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
