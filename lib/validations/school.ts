import { z } from "zod"

export const schoolFormSchema = z.object({
  name: z.string().min(2, {
    message: "School name must be at least 2 characters.",
  }),
  code: z
    .string()
    .min(2, {
      message: "School code must be at least 2 characters.",
    })
    .max(10, {
      message: "School code must not exceed 10 characters.",
    })
    .regex(/^[A-Za-z0-9]+$/, {
      message: "School code must only contain letters and numbers.",
    }),
  address: z.string().min(5, {
    message: "Address must be at least 5 characters.",
  }),
  phone: z.string().min(10, {
    message: "Phone number must be at least 10 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  website: z
    .string()
    .url({
      message: "Please enter a valid URL.",
    })
    .optional()
    .or(z.literal("")),
  logoUrl: z
    .string()
    .url({
      message: "Please enter a valid URL for the logo.",
    })
    .optional()
    .or(z.literal("")),
  isActive: z.boolean().default(true),
}) 