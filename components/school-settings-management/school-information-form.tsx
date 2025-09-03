"use client"

import type React from "react"
import { useState, useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Lock, Globe, Mail, Phone, Upload, X, Camera } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { updateSchoolInformation } from "@/app/actions/school-settings"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const schoolInformationSchema = z.object({
  address: z.string().min(5, "Address must be at least 5 characters"),
  phone: z.string().min(10, "Phone number must be at least 10 characters"),
  email: z.string().email("Please enter a valid email address"),
  website: z.string().url("Please enter a valid website URL").optional().or(z.literal("")),
})

type SchoolInformationFormValues = z.infer<typeof schoolInformationSchema>

interface SchoolInformationData {
  school: {
    id: string
    name: string
    code: string
    address: string
    phone: string
    email: string
    website?: string
    logoUrl?: string
    isActive: boolean
    createdAt: Date
  }
  canEditCode: boolean
  stats: {
    totalStudents: number
    totalTeachers: number
    totalClasses: number
    totalSessions: number
  }
}

interface SchoolInformationFormProps {
  data: SchoolInformationData
}

export function SchoolInformationForm({ data }: SchoolInformationFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>(data.school.logoUrl || "")
  const [isUploadingLogo, setIsUploadingLogo] = useState(false) 
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const form = useForm<SchoolInformationFormValues>({
    resolver: zodResolver(schoolInformationSchema),
    defaultValues: {
      address: data.school.address,
      phone: data.school.phone,
      email: data.school.email,
      website: data.school.website || "",
    },
  })

  async function onSubmit(formData: SchoolInformationFormValues) {
    setIsLoading(true)
    try {
      await updateSchoolInformation({
        schoolId: data.school.id,
        ...formData,
      })
      toast.success("School information updated successfully")
      router.refresh()
    } catch (error: any) {
      console.error("Failed to update school information:", error)
      toast.error(error.message || "Failed to update school information")
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error(`Please select a valid image file (${ALLOWED_IMAGE_TYPES.join(', ')})`);
      return;
    }
    
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Image size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      return;
    }

    setIsUploadingLogo(true);

    try {
      const formData = new FormData();
      formData.append("logo", file);
      formData.append("schoolId", data.school.id);

      const response = await fetch("/api/upload/school-logo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload logo");
      }

      const result = await response.json();
      setLogoPreview(result.logoUrl);
      toast.success("Logo uploaded successfully");
      router.refresh();
    } catch (error: any) {
      console.error("Logo upload error:", error);
      toast.error(error.message || "Failed to upload logo");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setLogoFile(file)
      handleLogoUpload(file)
    }
  }

  const removeLogo = async () => {
    try {
      setIsUploadingLogo(true);
      const response = await fetch("/api/s3/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: data.school.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove logo");
      }

      setLogoPreview("");
      toast.success("Logo removed successfully");
      router.refresh();
    } catch (error: any) {
      console.error("Logo removal error:", error);
      toast.error(error.message || "Failed to remove logo");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {data.school.name}
                <Badge variant={data.school.isActive ? "default" : "secondary"}>
                  {data.school.isActive ? "Active" : "Inactive"}
                </Badge>
              </CardTitle>
              <CardDescription>
                School Code: {data.school.code} • Established: {new Date(data.school.createdAt).getFullYear()}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatBox count={data.stats.totalStudents} label="Students" color="blue" />
            <StatBox count={data.stats.totalTeachers} label="Teachers" color="green" />
            <StatBox count={data.stats.totalClasses} label="Classes" color="purple" />
            <StatBox count={data.stats.totalSessions} label="Sessions" color="orange" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>School Information</CardTitle>
          <CardDescription>Update your school's contact information and details</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <div className="border-b pb-4 space-y-4">
                <div>
                  <FormLabel>School Logo</FormLabel>
                  <FormDescription>Upload your school logo (max 5MB, recommended: square image)</FormDescription>
                </div>

                <div className="flex items-center gap-6">
                  <div className="relative">
                    <Avatar className="h-24 w-24 border-2 border-dashed border-muted-foreground/25">
                      {logoPreview ? (
                        <AvatarImage
                          src={logoPreview}
                          alt="School Logo"
                          className="object-cover"
                          onError={() => setLogoPreview("")}
                        />
                      ) : (
                        <AvatarFallback className="bg-muted">
                          <Camera className="h-8 w-8 text-muted-foreground" />
                        </AvatarFallback>
                      )}
                    </Avatar>

                    {logoPreview && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                        onClick={removeLogo}
                        disabled={isUploadingLogo}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingLogo}
                      className="gap-2"
                    >
                      {isUploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {logoPreview ? "Change Logo" : "Upload Logo"}
                    </Button>
                    <p className="text-xs text-muted-foreground">Supported: JPG, PNG, GIF. Max 5MB.</p>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter complete school address" className="min-h-[80px]" {...field} />
                      </FormControl>
                      <FormDescription>Complete physical address of the school</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="+234 xxx xxx xxxx" className="pl-10" {...field} />
                          </div>
                        </FormControl>
                        <FormDescription>Primary contact number</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="school@example.com" className="pl-10" {...field} />
                          </div>
                        </FormControl>
                        <FormDescription>Official email address</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website (Optional)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="https://www.yourschool.com" className="pl-10" {...field} />
                        </div>
                      </FormControl>
                      <FormDescription>School website URL (if available)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
            <div className="flex justify-between mt-5 p-6 pt-0">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            System Information
          </CardTitle>
          <CardDescription>These details can only be changed by system admins</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReadOnlyInfo label="School Name" value={data.school.name} />
            <ReadOnlyInfo label="School Code" value={data.school.code} mono />
            <ReadOnlyInfo label="Registration Date" value={new Date(data.school.createdAt).toLocaleDateString()} />
            <ReadOnlyInfo
              label="Status"
              value={<Badge variant={data.school.isActive ? "default" : "secondary"}>{data.school.isActive ? "Active" : "Inactive"}</Badge>}
            />
          </div>

          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              <strong>Admin Permissions:</strong> Only contact, logo, and admission details are editable. Name, code, and status are restricted to system admins.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

function StatBox({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className={`text-center p-3 bg-${color}-50 rounded-lg`}>
      <div className={`text-xl font-bold text-${color}-600`}>{count}</div>
      <div className={`text-xs text-${color}-600`}>{label}</div>
    </div>
  )
}

function ReadOnlyInfo({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold bg-muted/50 border rounded px-3 py-2 ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  )
}
