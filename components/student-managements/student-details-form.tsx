"use client"

import type React from "react"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { CalendarIcon, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface Class {
  id: string
  name: string
}

interface Term {
  id: string
  name: string
  sessionId: string
  sessionName: string
}

interface StudentDetailsFormProps {
  schoolId: string
  classes: Class[]
  terms: Term[]
  currentTerm: Term | null
  onSubmit: (data: any) => void
  initialData?: any
}

// Form schema
const formSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  dateOfBirth: z.date({
    required_error: "Date of birth is required",
  }),
  gender: z.enum(["MALE", "FEMALE", "OTHER"], {
    required_error: "Gender is required",
  }),
  phone: z.string().optional(),
  photoUrl: z.string().optional(),
  admissionNumber: z.string().min(1, "Admission number is required"),
  classId: z.string({
    required_error: "Class is required",
  }),
  termId: z.string({
    required_error: "Term is required",
  }),
})

export function StudentDetailsForm({
  schoolId,
  classes,
  terms = [],
  currentTerm,
  onSubmit,
  initialData,
}: StudentDetailsFormProps) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData?.photoUrl || null)

  // Initialize form with default values or initial data
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      firstName: "",
      lastName: "",
      dateOfBirth: undefined,
      gender: undefined,
      phone: "",
      photoUrl: "",
      admissionNumber: "",
      classId: "",
      termId: currentTerm?.id || "",
    },
  })

  // Handle photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setPhotoPreview(result)
        form.setValue("photoUrl", result)
      }
      reader.readAsDataURL(file)
    }
  }

  // Handle form submission
  const handleFormSubmit = (values: z.infer<typeof formSchema>) => {
    onSubmit(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Photo upload */}
          <div className="md:col-span-2 flex flex-col items-center justify-center gap-4">
            <Avatar className="h-32 w-32">
              {photoPreview ? <AvatarImage src={photoPreview || "/placeholder.svg"} alt="Student photo" /> : null}
              <AvatarFallback className="text-2xl">
                {form.watch("firstName") && form.watch("lastName")
                  ? `${form.watch("firstName").charAt(0)}${form.watch("lastName").charAt(0)}`
                  : "ST"}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2">
              <Label htmlFor="photo" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                  <Upload className="h-4 w-4" />
                  Upload Photo
                </div>
                <Input id="photo" type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </Label>
              {photoPreview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhotoPreview(null)
                    form.setValue("photoUrl", "")
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          {/* First name */}
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter first name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Last name */}
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter last name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Date of birth */}
          <FormField
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date of Birth *</FormLabel>
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
                      disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Gender */}
          <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gender *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Phone */}
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Enter phone number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Admission Number */}
          <FormField
            control={form.control}
            name="admissionNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Admission Number *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter admission number" {...field} />
                </FormControl>
                <FormDescription>A unique identifier for the student</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Class */}
          <FormField
            control={form.control}
            name="classId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Class *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Term */}
          <FormField
            control={form.control}
            name="termId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Term *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {terms.length > 0 ? (
                      terms.map((term) => (
                        <SelectItem key={term.id} value={term.id}>
                          {term.name} ({term.session ? term.session.name : "No Session"}){term.id === currentTerm?.id && " (Current)"}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem disabled>No terms available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit">Continue to Credentials</Button>
        </div>
      </form>
    </Form>
  )
}
