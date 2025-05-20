import * as z from "zod"

// Define the type for the form values
export type ProfileFormValues = z.infer<typeof profileFormSchema>

export const profileFormSchema = z.object({
    firstName: z.string().min(2, {
      message: "First name must be at least 2 characters.",
    }),
    lastName: z.string().min(2, {
      message: "Last name must be at least 2 characters.",
    }),
    avatarUrl: z.string().nullable().optional(),
    dateOfBirth: z.date().nullable().optional(),
    phone: z.string()
      .regex(/^\+?[1-9]\d{1,14}$/, {
        message: "Please enter a valid phone number.",
      })
      .nullable()
      .optional(),
    email: z.string()
      .email({
        message: "Please enter a valid email address.",
      })
      .optional(),
  })

// Add a schema for password change if needed
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(8, {
    message: "Password must be at least 8 characters.",
  }),
  newPassword: z.string().min(8, {
    message: "Password must be at least 8 characters.",
  }),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
})