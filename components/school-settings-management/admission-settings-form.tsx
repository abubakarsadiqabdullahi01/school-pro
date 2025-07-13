"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Info, Eye, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { updateAdmissionSettings, generateNextAdmissionNumber } from "@/app/actions/school-settings"

const admissionSettingsSchema = z.object({
  admissionPrefix: z
    .string()
    .min(2, "Prefix must be at least 2 characters")
    .max(10, "Prefix must not exceed 10 characters"),
  admissionFormat: z.string().min(1, "Format is required"),
  admissionSequenceStart: z.number().min(1, "Starting number must be at least 1"),
})

type AdmissionSettingsFormValues = z.infer<typeof admissionSettingsSchema>

interface AdmissionSequence {
  year: number
  lastSequence: number
}

interface AdmissionSettingsData {
  school: {
    id: string
    name: string
    code: string
    admissionPrefix: string
    admissionFormat: string
    admissionSequenceStart: number
  }
  sequences: AdmissionSequence[]
  currentYear: number
  nextAdmissionNumber: string
}

interface AdmissionSettingsFormProps {
  data: AdmissionSettingsData
}

export function AdmissionSettingsForm({ data }: AdmissionSettingsFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [previewNumber, setPreviewNumber] = useState(data.nextAdmissionNumber)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const router = useRouter()

  const form = useForm<AdmissionSettingsFormValues>({
    resolver: zodResolver(admissionSettingsSchema),
    defaultValues: {
      admissionPrefix: data.school.admissionPrefix,
      admissionFormat: data.school.admissionFormat,
      admissionSequenceStart: data.school.admissionSequenceStart,
    },
  })

  const formatOptions = [
    { value: "{PREFIX}-{YEAR}-{NUMBER}", label: "PREFIX-YEAR-NUMBER (e.g., IHN-2024-0001)" },
    { value: "{PREFIX}/{YEAR}/{NUMBER}", label: "PREFIX/YEAR/NUMBER (e.g., IHN/2024/0001)" },
    { value: "{PREFIX}{YEAR}{NUMBER}", label: "PREFIXYEARNUMBER (e.g., IHN20240001)" },
    { value: "{PREFIX}-{NUMBER}-{YEAR}", label: "PREFIX-NUMBER-YEAR (e.g., IHN-0001-2024)" },
  ]

  async function onSubmit(formData: AdmissionSettingsFormValues) {
    setIsLoading(true)

    try {
      await updateAdmissionSettings({
        schoolId: data.school.id,
        ...formData,
      })
      toast.success("Admission settings updated successfully")
      router.refresh()
    } catch (error: any) {
      console.error("Failed to update admission settings:", error)
      toast.error(error.message || "Failed to update admission settings")
    } finally {
      setIsLoading(false)
    }
  }

  async function generatePreview() {
    setIsGeneratingPreview(true)
    try {
      const formValues = form.getValues()
      const result = await generateNextAdmissionNumber({
        schoolId: data.school.id,
        prefix: formValues.admissionPrefix,
        format: formValues.admissionFormat,
        year: data.currentYear,
      })

      if (result.success) {
        setPreviewNumber(result.admissionNumber)
      }
    } catch (error) {
      console.error("Failed to generate preview:", error)
    } finally {
      setIsGeneratingPreview(false)
    }
  }

  const currentSequence = data.sequences.find((seq) => seq.year === data.currentYear)

  return (
    <div className="space-y-6">
      {/* Current Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Current Admission Status
          </CardTitle>
          <CardDescription>Overview of your current admission number configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Current Format</div>
              <Badge variant="outline" className="font-mono">
                {data.school.admissionFormat}
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Next Number ({data.currentYear})</div>
              <Badge variant="default" className="font-mono">
                {data.nextAdmissionNumber}
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Last Sequence</div>
              <Badge variant="secondary">{currentSequence?.lastSequence || 0}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Form */}
      <Card>
        <CardHeader>
          <CardTitle>Admission Number Configuration</CardTitle>
          <CardDescription>Configure how admission numbers are generated for new students</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="admissionPrefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Admission Prefix <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., IHN, SCH, etc."
                        {...field}
                        className="font-mono"
                        onChange={(e) => {
                          field.onChange(e.target.value.toUpperCase())
                        }}
                      />
                    </FormControl>
                    <FormDescription>Short code that will appear at the beginning of admission numbers</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="admissionFormat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Number Format <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select format pattern" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {formatOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Choose how the admission number components are arranged</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="admissionSequenceStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Starting Sequence Number <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) => field.onChange(Number.parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormDescription>
                      The first number to use when generating admission numbers for new academic years
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Preview Section */}
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <span className="font-medium">Preview</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generatePreview}
                    disabled={isGeneratingPreview}
                  >
                    {isGeneratingPreview ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Update Preview
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Next admission number with current settings:</div>
                  <div className="font-mono text-lg font-semibold bg-background border rounded px-3 py-2">
                    {previewNumber}
                  </div>
                </div>
              </div>

              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> Changing these settings will affect all new admission numbers. Existing
                  admission numbers will not be changed. The sequence will continue from the last registered number for
                  each academic year.
                </AlertDescription>
              </Alert>
            </CardContent>
            <div className="flex justify-between p-6 pt-0">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Settings"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </Card>

      {/* Sequence History */}
      {data.sequences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sequence History</CardTitle>
            <CardDescription>Track of admission number sequences by academic year</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.sequences
                .sort((a, b) => b.year - a.year)
                .map((sequence) => (
                  <div key={sequence.year} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant={sequence.year === data.currentYear ? "default" : "secondary"}>
                        {sequence.year}
                        {sequence.year === data.currentYear && " (Current)"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Last sequence: <span className="font-mono font-medium">{sequence.lastSequence}</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
