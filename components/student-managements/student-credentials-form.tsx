"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft } from "lucide-react"

interface StudentCredentialsFormProps {
  onSubmit: (data: any) => void
  onBack: () => void
  initialData?: any
}

// Form schema
const formSchema = z
  .object({
    credentialType: z.literal("REGISTRATION_NUMBER", {
      required_error: "Credential type is required",
    }),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      ),
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export function StudentCredentialsForm({ onSubmit, onBack, initialData }: StudentCredentialsFormProps) {
  // Initialize form with default values or initial data
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      credentialType: "REGISTRATION_NUMBER",
      password: "",
      confirmPassword: "",
    },
  })

  // Handle form submission
  const handleFormSubmit = (values: z.infer<typeof formSchema>) => {
    onSubmit(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Credential Type */}
          <FormField
            control={form.control}
            name="credentialType"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Credential Type *</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value)
                  }}
                  defaultValue="REGISTRATION_NUMBER"
                  disabled
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select credential type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="REGISTRATION_NUMBER">Registration Number</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>Choose how the student will log in to the system</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

        

          {/* Password */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password *</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Enter password" {...field} />
                </FormControl>
                <FormDescription>Must be at least 8 characters with uppercase, lowercase, and number</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Confirm Password */}
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password *</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Confirm password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button type="submit">Continue to Parent/Guardian</Button>
        </div>
      </form>
    </Form>
  )
}
