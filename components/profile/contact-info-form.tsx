"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { updateContactInfo } from "@/app/actions/profile"

const contactFormSchema = z.object({
  email: z
    .string()
    .email({
      message: "Please enter a valid email address.",
    })
    .optional(),
  phone: z
    .string()
    .min(10, {
      message: "Phone number must be at least 10 characters.",
    })
    .optional(),
  registrationNumber: z.string().optional(),
})

type ContactFormValues = z.infer<typeof contactFormSchema>

export function ContactInfoForm({ user, credentials }: { user: any; credentials: any[] }) {
  const [isLoading, setIsLoading] = useState(false)

  // Find credentials by type
  const emailCredential = credentials.find((c) => c.type === "EMAIL")
  const phoneCredential = credentials.find((c) => c.type === "PHONE")
  const regNumberCredential = credentials.find((c) => c.type === "REGISTRATION_NUMBER")

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      email: emailCredential?.value || "",
      phone: phoneCredential?.value || "",
      registrationNumber: regNumberCredential?.value || "",
    },
  })

  async function onSubmit(data: ContactFormValues) {
    setIsLoading(true)

    try {
      await updateContactInfo({
        userId: user.id,
        email: data.email,
        phone: data.phone,
        registrationNumber: data.registrationNumber,
        emailCredentialId: emailCredential?.id,
        phoneCredentialId: phoneCredential?.id,
        regNumberCredentialId: regNumberCredential?.id,
      })

      toast.success("Contact information updated successfully")
    } catch (error) {
      console.error("Failed to update contact information:", error)
      toast.error("Failed to update contact information")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Information</CardTitle>
        <CardDescription>Update your contact details and credentials</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Credentials</h3>
                <Button variant="outline" size="sm" type="button">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Credential
                </Button>
              </div>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Email Address</FormLabel>
                        {emailCredential?.isPrimary && <Badge variant="outline">Primary</Badge>}
                      </div>
                      <FormControl>
                        <Input placeholder="Enter your email address" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Phone Number</FormLabel>
                        {phoneCredential?.isPrimary && <Badge variant="outline">Primary</Badge>}
                      </div>
                      <FormControl>
                        <Input placeholder="Enter your phone number" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {user.role === "STUDENT" && (
                  <FormField
                    control={form.control}
                    name="registrationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Registration Number</FormLabel>
                          {regNumberCredential?.isPrimary && <Badge variant="outline">Primary</Badge>}
                        </div>
                        <FormControl>
                          <Input placeholder="Enter your registration number" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className="pt-4">
                <h3 className="mb-2 text-lg font-medium">Primary Credential</h3>
                <Select defaultValue={credentials.find((c) => c.isPrimary)?.type || "EMAIL"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select primary credential" />
                  </SelectTrigger>
                  <SelectContent>
                    {emailCredential && <SelectItem value="EMAIL">Email</SelectItem>}
                    {phoneCredential && <SelectItem value="PHONE">Phone</SelectItem>}
                    {regNumberCredential && <SelectItem value="REGISTRATION_NUMBER">Registration Number</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}

