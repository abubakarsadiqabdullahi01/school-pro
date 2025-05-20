"use server"

import { redirect } from "next/navigation"
import { auth, signIn, signOut } from "@/auth"
import { loginSchema, type LoginFormValues } from "@/lib/validations/auth"
import { AuthError } from "next-auth"

export async function login(data: LoginFormValues) {
  // Validate form data
  const validatedFields = loginSchema.safeParse(data)

  if (!validatedFields.success) {
    return {
      success: false,
      message: "Invalid form data",
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  const { email, password } = validatedFields.data

  try {
    console.log("Login attempt with:", email)

    // Use the signIn function with redirect: false to prevent automatic redirects
    const result = await signIn("credentials", {
      identifier: email,
      password,
      redirect: false,
    })

    console.log("SignIn result:", result)

    // Check if there was an error or if the login was successful
    if (result?.error) {
      console.error("Login error:", result.error)
      return {
        success: false,
        message: "Invalid credentials. Please check your email and password.",
      }
    }

    return { success: true }
  } catch (error) {
    console.error("Login error:", error)

    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return {
            success: false,
            message: "Invalid credentials. Please check your email and password.",
          }
        default:
          return { success: false, message: "An error occurred during sign in." }
      }
    }

    return { success: false, message: "Something went wrong. Please try again." }
  }
}

export async function logout() {
  await signOut({ redirect: false })
  redirect("/auth/login")
}

export async function getSession() {
  return await auth()
}

