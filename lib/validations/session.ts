import { z } from "zod"

// Base session schema
const baseSessionSchema = z.object({
  name: z.string().min(1, "Session name is required").max(50, "Session name must not exceed 50 characters"),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid start date",
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid end date",
  }),
})

// Schema for creating a new session
export const sessionCreateSchema = baseSessionSchema
  .extend({
    schoolId: z.string().min(1, "School ID is required"),
    isCurrent: z.boolean().default(false),
  })
  .refine(
    (data) => {
      const startDate = new Date(data.startDate)
      const endDate = new Date(data.endDate)
      return startDate < endDate
    },
    {
      message: "End date must be after start date",
      path: ["endDate"],
    },
  )

// Schema for updating an existing session
export const sessionUpdateSchema = baseSessionSchema
  .extend({
    id: z.string().min(1, "Session ID is required"),
    isCurrent: z.boolean().optional(),
  })
  .partial()
  .extend({
    id: z.string().min(1, "Session ID is required"), // ID is always required for updates
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        const startDate = new Date(data.startDate)
        const endDate = new Date(data.endDate)
        return startDate < endDate
      }
      return true
    },
    {
      message: "End date must be after start date",
      path: ["endDate"],
    },
  )

// Base term schema
const baseTermSchema = z.object({
  name: z.string().min(1, "Term name is required").max(50, "Term name must not exceed 50 characters"),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid start date",
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid end date",
  }),
})

// Schema for creating a new term
export const termCreateSchema = baseTermSchema
  .extend({
    sessionId: z.string().min(1, "Session ID is required"),
    isCurrent: z.boolean().default(false),
  })
  .refine(
    (data) => {
      const startDate = new Date(data.startDate)
      const endDate = new Date(data.endDate)
      return startDate < endDate
    },
    {
      message: "End date must be after start date",
      path: ["endDate"],
    },
  )

// Schema for updating an existing term
export const termUpdateSchema = baseTermSchema
  .extend({
    id: z.string().min(1, "Term ID is required"),
    isCurrent: z.boolean().optional(),
  })
  .partial()
  .extend({
    id: z.string().min(1, "Term ID is required"), // ID is always required for updates
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        const startDate = new Date(data.startDate)
        const endDate = new Date(data.endDate)
        return startDate < endDate
      }
      return true
    },
    {
      message: "End date must be after start date",
      path: ["endDate"],
    },
  )

// Type exports
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>
export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>
export type TermCreateInput = z.infer<typeof termCreateSchema>
export type TermUpdateInput = z.infer<typeof termUpdateSchema>
