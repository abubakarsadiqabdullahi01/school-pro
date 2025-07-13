// Student validations
export * from "./student"

// Parent validations
export * from "./parent"

// Class validations
export * from "./class"

// Session and Term validations
export * from "./session"

// Common validation utilities
export { z } from "zod"

// Common validation patterns
export const phoneRegex = /^[+]?[1-9][\d]{0,15}$/
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Reusable validation schemas
export const idSchema = z.string().min(1, "ID is required")
export const optionalIdSchema = z.string().optional()
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})
export const sortSchema = z.object({
  sortBy: z.string().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
})

// Common field validations
export const nameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name must not exceed 50 characters")
export const phoneSchema = z.string().regex(phoneRegex, "Please enter a valid phone number").optional()
export const emailSchema = z.string().email("Please enter a valid email address").optional()
export const addressSchema = z.string().max(200, "Address must not exceed 200 characters").optional()
export const dateSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Please enter a valid date",
})
