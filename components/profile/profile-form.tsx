// components/profile/profile-form.tsx
"use client"

import { useState, useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Upload, X, Camera } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { updateProfile } from "@/app/actions/profile"
import { profileFormSchema } from "@/lib/validations/profile"

type ProfileFormValues = z.infer<typeof profileFormSchema>

// Constants for client-side validation
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export function ProfileForm({ user }: { user: any }) {
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl || "",
    },
  })

  async function onSubmit(data: ProfileFormValues) {
    setIsLoading(true)

    try {
      await updateProfile({
        userId: user.id,
        firstName: data.firstName,
        lastName: data.lastName,
        avatarUrl: data.avatarUrl,
      })

      toast.success("Profile updated successfully")
    } catch (error) {
      console.error("Failed to update profile:", error)
      toast.error("Failed to update profile")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAvatarUpload = async (file: File) => {
    if (!file) return
    
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error(`Please select a valid image file (JPEG, PNG, GIF, WebP)`)
      return
    }
    
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Image size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`)
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append("avatar", file)

      const response = await fetch("/api/upload/profile-avatar", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to upload avatar")
      }

      const result = await response.json()
      
      // Update form field with new avatar URL
      form.setValue("avatarUrl", result.avatarUrl)
      
      toast.success("Avatar uploaded successfully")
    } catch (error: any) {
      console.error("Avatar upload error:", error)
      toast.error(error.message || "Failed to upload avatar")
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    try {
      const response = await fetch("/api/upload/profile-avatar", {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to remove avatar")
      }

      form.setValue("avatarUrl", "")
      toast.success("Avatar removed successfully")
    } catch (error: any) {
      console.error("Avatar removal error:", error)
      toast.error(error.message || "Failed to remove avatar")
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleAvatarUpload(file)
    }
  }

  const avatarUrl = form.watch("avatarUrl")

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Information</CardTitle>
        <CardDescription>Update your personal information</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {/* Avatar Upload Section */}
            <div className="flex flex-col items-center space-y-4 sm:flex-row sm:space-x-6 sm:space-y-0">
              <div className="relative">
                <Avatar className="h-24 w-24 border-2 border-dashed border-muted-foreground/25">
                  {avatarUrl ? (
                    <>
                      <AvatarImage 
                        src={avatarUrl} 
                        alt={`${user.firstName} ${user.lastName}`}
                        className="object-cover"
                      />
                      <AvatarFallback className="text-2xl">
                        {user.firstName?.charAt(0) || ""}
                        {user.lastName?.charAt(0) || ""}
                      </AvatarFallback>
                    </>
                  ) : (
                    <AvatarFallback className="bg-muted">
                      <Camera className="h-8 w-8 text-muted-foreground" />
                    </AvatarFallback>
                  )}
                </Avatar>

                {avatarUrl && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              <div className="space-y-2 text-center sm:text-left">
                <h3 className="text-xl font-semibold">
                  {user.firstName} {user.lastName}
                </h3>
                <div className="text-sm text-muted-foreground">
                  {user.role.charAt(0) + user.role.slice(1).toLowerCase().replace("_", " ")}
                </div>
                
                <div className="space-y-2 pt-2">
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
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="gap-2"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {avatarUrl ? "Change Avatar" : "Upload Avatar"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Supported: JPG, PNG, GIF, WebP. Max 2MB.
                  </p>
                </div>
              </div>
            </div>

            {/* Name Fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your first name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your last name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Avatar URL Field (hidden but maintained for form state) */}
            <FormField
              control={form.control}
              name="avatarUrl"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
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