import * as z from "zod"

export const loginSchema = z.object({
  email: z.string().min(4, { message: "Please enter a valid email / PSN / Phone" }),
  password: z.string().min(4, { message: "Password must be at least 4 characters" }),
})

export type LoginFormValues = z.infer<typeof loginSchema>

