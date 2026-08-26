"use server"

import { redirect } from "next/navigation"
import { auth, signIn, signOut } from "@/auth"
import { loginSchema, type LoginFormValues } from "@/lib/validations/auth"
import { AuthError } from "next-auth"
import { revokeSession } from "@/lib/sessions.server"
import { evaluateLoginThrottle, userIdForIdentifier } from "@/lib/login-throttle.server"
import { headers } from "next/headers"

/**
 * The client address, resolved the same way `auth.ts` does it — behind cPanel or Cloudflare
 * the socket address is the proxy, so the forwarding headers come first.
 */
async function requestIp(): Promise<string> {
  try {
    const header = await headers()
    const forwardedFor = header.get("x-forwarded-for")
    if (forwardedFor) {
      const client = forwardedFor.split(",")[0]?.trim()
      if (client) return client
    }
    return header.get("cf-connecting-ip") ?? header.get("x-real-ip") ?? "unknown"
  } catch {
    return "unknown"
  }
}

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

    // The throttle is enforced inside the credentials callback, which is the actual
    // control. Checking it again here is purely so the person sees why they are blocked —
    // returning null from the callback can only produce a generic "invalid credentials",
    // which sends someone who has forgotten their password into a retry loop that keeps
    // extending the block.
    const ipAddress = await requestIp()
    const throttle = await evaluateLoginThrottle(await userIdForIdentifier(email), ipAddress)

    if (throttle.blocked) {
      return { success: false, message: throttle.message }
    }

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
  // Mark this specific sign-in revoked before clearing the cookie. Done first: once the
  // session is gone we no longer know which record to end.
  const session = await auth()
  if (session?.user?.sessionRecordId) {
    await revokeSession(session.user.sessionRecordId)
  }

  await signOut({ redirect: false })
  redirect("/auth/login")
}

export async function getSession() {
  return await auth()
}

