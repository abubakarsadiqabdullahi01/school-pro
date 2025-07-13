import { z } from "zod"
import { Gender } from "@prisma/client"

// Base student schema with common fields
const baseStudentSchema = z.object({
  firstName: z
    .string()
    .min(2, "First name must be at least 2 characters")
    .max(50, "First name must not exceed 50 characters"),
  lastName: z
    .string()
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must not exceed 50 characters"),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid date",
  }),
  gender: z.nativeEnum(Gender).optional(),
  state: z.string().max(50, "State must not exceed 50 characters").optional(),
  lga: z.string().max(50, "LGA must not exceed 50 characters").optional(),
  address: z.string().max(200, "Address must not exceed 200 characters").optional(),
  phone: z.string().max(20, "Phone number must not exceed 20 characters").optional(),
  classId: z.string().min(1, "Please select a class"),
  termId: z.string().min(1, "Please select a term"),
  year: z
    .number()
    .int()
    .min(2000)
    .max(new Date().getFullYear() + 1)
    .optional(),
})

export const studentCreateSchema = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val))),
  gender: z.nativeEnum(Gender).optional(),
  state: z.string().max(50).optional(),
  lga: z.string().max(50).optional(),
  address: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  classId: z.string().min(1),
  termId: z.string().min(1),
  year: z.number().int().min(2000).max(new Date().getFullYear() + 1).optional(),
  admissionNo: z.string().min(1).max(50),
  parentId: z.string().optional(),
  relationship: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
  credentials: z
    .array(
      z.object({
        type: z.enum(["EMAIL", "PHONE", "REGISTRATION_NUMBER", "PSN"]),
        value: z.string().min(1),
        passwordHash: z.string().min(1),
        isPrimary: z.boolean().default(true),
      })
    )
    .optional(),
});

// Schema for updating an existing student
export const studentUpdateSchema = baseStudentSchema
  .extend({
    id: z.string().min(1, "Student ID is required"),
    admissionNo: z
      .string()
      .min(1, "Admission number is required")
      .max(50, "Admission number must not exceed 50 characters")
      .optional(),
    parentId: z.string().optional(),
    relationship: z.string().max(20, "Relationship must not exceed 20 characters").optional(),
    isActive: z.boolean().optional(),
  })
  .partial()
  .extend({
    id: z.string().min(1, "Student ID is required"), // ID is always required for updates
  })

// Schema for student search and filtering
export const studentSearchSchema = z.object({
  query: z.string().optional(),
  classId: z.string().optional(),
  assignmentStatus: z.enum(["all", "assigned", "not_assigned"]).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["firstName", "lastName", "admissionNo", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
})

// Schema for student class assignment
export const studentClassAssignmentSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  classTermId: z.string().min(1, "Class term ID is required"),
})

// Schema for student parent assignment
export const studentParentAssignmentSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  parentId: z.string().min(1, "Parent ID is required"),
  relationship: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]).default("PARENT"),
})

// Schema for student transition (promotion, transfer, etc.)
export const studentTransitionSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  fromClassTermId: z.string().min(1, "From class term ID is required"),
  toClassTermId: z.string().min(1, "To class term ID is required"),
  transitionType: z.enum(["PROMOTION", "TRANSFER", "WITHDRAWAL"]),
  transitionDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Please enter a valid date",
    })
    .optional(),
  notes: z.string().max(500, "Notes must not exceed 500 characters").optional(),
})

// Schema for bulk student operations
export const bulkStudentOperationSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, "At least one student must be selected"),
  operation: z.enum(["activate", "deactivate", "promote", "transfer", "delete"]),
  targetClassTermId: z.string().optional(), // For promotion/transfer operations
  notes: z.string().max(500, "Notes must not exceed 500 characters").optional(),
})

// Schema for student credential management
export const studentCredentialSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  type: z.enum(["EMAIL", "PHONE", "REGISTRATION_NUMBER", "PSN"]),
  value: z.string().min(1, "Credential value is required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  isPrimary: z.boolean().default(false),
})

// Schema for student profile update (limited fields students can update themselves)
export const studentProfileUpdateSchema = z.object({
  phone: z.string().max(20, "Phone number must not exceed 20 characters").optional(),
  address: z.string().max(200, "Address must not exceed 200 characters").optional(),
})

// Type exports for use in components and actions
export type StudentCreateInput = z.infer<typeof studentCreateSchema>
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>
export type StudentSearchInput = z.infer<typeof studentSearchSchema>
export type StudentClassAssignmentInput = z.infer<typeof studentClassAssignmentSchema>
export type StudentParentAssignmentInput = z.infer<typeof studentParentAssignmentSchema>
export type StudentTransitionInput = z.infer<typeof studentTransitionSchema>
export type BulkStudentOperationInput = z.infer<typeof bulkStudentOperationSchema>
export type StudentCredentialInput = z.infer<typeof studentCredentialSchema>
export type StudentProfileUpdateInput = z.infer<typeof studentProfileUpdateSchema>
