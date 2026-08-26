"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Info, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { updateAssessmentScheme } from "@/app/actions/assessment-scheme"
import { schemeComponents, schemeTotal, type AssessmentScheme } from "@/lib/assessment-scheme"

const componentMax = z.coerce
  .number()
  .int("Use a whole number")
  .min(0, "Use 0 if this is not marked")
  .max(100, "A single component cannot exceed 100")

const schema = z.object({
  name: z.string().min(1, "Give the scheme a name").max(100, "Keep the name under 100 characters"),
  ca1Max: componentMax,
  ca2Max: componentMax,
  ca3Max: componentMax,
  examMax: componentMax,
})

type FormValues = z.infer<typeof schema>

interface AssessmentSchemeFormProps {
  scheme: AssessmentScheme
  schoolName: string
}

export function AssessmentSchemeForm({ scheme, schoolName }: AssessmentSchemeFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: scheme,
  })

  // Watched so the running total and the preview update as the admin types, rather than
  // only telling them the marks do not add up after they press save.
  const live = form.watch()
  const liveScheme: AssessmentScheme = {
    name: live.name ?? "",
    ca1Max: Number(live.ca1Max) || 0,
    ca2Max: Number(live.ca2Max) || 0,
    ca3Max: Number(live.ca3Max) || 0,
    examMax: Number(live.examMax) || 0,
  }
  const total = schemeTotal(liveScheme)
  const inUse = schemeComponents(liveScheme)

  async function onSubmit(values: FormValues) {
    setIsSaving(true)
    try {
      const result = await updateAssessmentScheme(values)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(result.message)
      router.refresh()
    } catch {
      toast.error("Could not save the assessment scheme. Try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assessment Scheme</CardTitle>
        <CardDescription>
          How a subject&apos;s marks are split for {schoolName}. This is what score entry
          checks against, so changing it changes what teachers are allowed to enter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scheme name</FormLabel>
                  <FormControl>
                    <Input placeholder="Three CAs and an exam" {...field} />
                  </FormControl>
                  <FormDescription>Shown to staff so they know which scheme is in use.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["ca1Max", "CA1 marks"],
                  ["ca2Max", "CA2 marks"],
                  ["ca3Max", "CA3 marks"],
                  ["examMax", "Exam marks"],
                ] as const
              ).map(([name, label]) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={100} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Each subject will be marked out of</span>
                  <Badge variant={total > 0 && total <= 100 ? "default" : "destructive"}>{total}</Badge>
                </div>
                <p className="text-sm">
                  Components in use:{" "}
                  {inUse.length > 0
                    ? inUse.map((component) => `${component.label} (${component.max})`).join(" + ")
                    : "none yet"}
                  .
                </p>
                <p className="text-sm text-muted-foreground">
                  Set a component to <strong>0</strong> if your school does not use it — a school
                  with two CAs sets CA3 to 0. Your grade bands are read on this same scale, so if
                  you change the total, check them at School Settings &rarr; Grading Systems.
                </p>
              </AlertDescription>
            </Alert>

            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Save scheme"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
