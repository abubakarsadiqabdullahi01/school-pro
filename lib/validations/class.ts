import { z } from "zod"
import { ClassLevel } from "@prisma/client"

// Base class schema
const baseClassSchema = z.object({
  name: z.string().min(1, "Class name is required").max(50, "Class name must not exceed 50 characters"),
  level: z.nativeEnum(ClassLevel),
})

// Schema for creating a new class
export const classCreateSchema = baseClassSchema.extend({
  schoolId: z.string().min(1, "School ID is required"),
})

// Schema for updating an existing class
export const classUpdateSchema = baseClassSchema
  .extend({
    id: z.string().min(1, "Class ID is required"),
  })
  .partial()
  .extend({
    id: z.string().min(1, "Class ID is required"), // ID is always required for updates
  })

// Schema for class search and filtering
export const classSearchSchema = z.object({
  query: z.string().optional(),
  level: z.nativeEnum(ClassLevel).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "level", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
})

// Schema for class-term assignment
export const classTermAssignmentSchema = z.object({
  classId: z.string().min(1, "Class ID is required"),
  termId: z.string().min(1, "Term ID is required"),
})

// Schema for class subject assignment
export const classSubjectAssignmentSchema = z.object({
  classId: z.string().min(1, "Class ID is required"),
  subjectId: z.string().min(1, "Subject ID is required"),
  classTermId: z.string().min(1, "Class term ID is required"),
})

// Type exports
export type ClassCreateInput = z.infer<typeof classCreateSchema>
export type ClassUpdateInput = z.infer<typeof classUpdateSchema>
export type ClassSearchInput = z.infer<typeof classSearchSchema>
export type ClassTermAssignmentInput = z.infer<typeof classTermAssignmentSchema>
export type ClassSubjectAssignmentInput = z.infer<typeof classSubjectAssignmentSchema>
