import { z } from "zod"
import { Gender } from "@prisma/client"

// Base parent schema with common fields
const baseParentSchema = z.object({
  firstName: z
    .string()
    .min(2, "First name must be at least 2 characters")
    .max(50, "First name must not exceed 50 characters"),
  lastName: z
    .string()
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must not exceed 50 characters"),
  email: z.string().email("Please enter a valid email address").optional(),
  phone: z.string().max(20, "Phone number must not exceed 20 characters").optional(),
  occupation: z.string().max(100, "Occupation must not exceed 100 characters").optional(),
  gender: z.nativeEnum(Gender).optional(),
  state: z.string().max(50, "State must not exceed 50 characters").optional(),
  lga: z.string().max(50, "LGA must not exceed 50 characters").optional(),
  address: z.string().max(200, "Address must not exceed 200 characters").optional(),
})

// Schema for creating a new parent
export const parentCreateSchema = baseParentSchema.extend({
  credentials: z
    .array(
      z.object({
        type: z.enum(["EMAIL", "PHONE", "REGISTRATION_NUMBER", "PSN"]),
        value: z.string().min(1, "Credential value is required"),
        passwordHash: z.string().min(1, "Password is required"),
        isPrimary: z.boolean().default(true),
      }),
    )
    .optional(),
})

// Schema for updating an existing parent
export const parentUpdateSchema = baseParentSchema
  .extend({
    id: z.string().min(1, "Parent ID is required"),
    userId: z.string().min(1, "User ID is required"),
    emailCredentialId: z.string().optional(),
  })
  .partial()
  .extend({
    id: z.string().min(1, "Parent ID is required"), // ID is always required for updates
    userId: z.string().min(1, "User ID is required"), // User ID is always required for updates
  })

// Schema for parent search and filtering
export const parentSearchSchema = z.object({
  query: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["firstName", "lastName", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
})

// Schema for linking student to parent
export const linkStudentToParentSchema = z.object({
  parentId: z.string().min(1, "Parent ID is required"),
  studentId: z.string().min(1, "Student ID is required"),
  relationship: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]).default("PARENT"),
})

// Schema for parent credential management
export const parentCredentialSchema = z.object({
  parentId: z.string().min(1, "Parent ID is required"),
  type: z.enum(["EMAIL", "PHONE"]),
  value: z.string().min(1, "Credential value is required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  isPrimary: z.boolean().default(false),
})

// Schema for parent authentication
export const parentAuthSchema = z.object({
  identifier: z.string().min(1, "Email or phone number is required"),
  password: z.string().min(1, "Password is required"),
})

// Schema for parent profile update (limited fields parents can update themselves)
export const parentProfileUpdateSchema = z.object({
  phone: z.string().max(20, "Phone number must not exceed 20 characters").optional(),
  occupation: z.string().max(100, "Occupation must not exceed 100 characters").optional(),
  address: z.string().max(200, "Address must not exceed 200 characters").optional(),
})

// Type exports for use in components and actions
export type ParentCreateInput = z.infer<typeof parentCreateSchema>
export type ParentUpdateInput = z.infer<typeof parentUpdateSchema>
export type ParentSearchInput = z.infer<typeof parentSearchSchema>
export type LinkStudentToParentInput = z.infer<typeof linkStudentToParentSchema>
export type ParentCredentialInput = z.infer<typeof parentCredentialSchema>
export type ParentAuthInput = z.infer<typeof parentAuthSchema>
export type ParentProfileUpdateInput = z.infer<typeof parentProfileUpdateSchema>
