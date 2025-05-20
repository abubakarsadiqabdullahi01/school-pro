"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion } from "framer-motion"
import { Eye, EyeOff, School, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { login } from "@/app/actions/auth"

import { cn } from "@/lib/utils"
import { loginSchema, type LoginFormValues } from "@/lib/validations/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  // Clear any existing auth-related session storage on component mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Clear any auth-related session storage that might be causing issues
      sessionStorage.removeItem("auth-redirect")
    }
  }, [])

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true)
    setFormError(null)

    try {
      const result = await login(data)

      if (result.success) {
        toast.success("Login successful", {
          description: "Welcome back to SchoolPro!",
        })

        // Set a flag to indicate we're redirecting
        setIsRedirecting(true)

        // Force a hard refresh to ensure the session is properly established
        window.location.href = "/dashboard"
      } else {
        setFormError(result.message || "Login failed. Please try again.")
        toast.error("Login failed", {
          description: result.message || "Please check your credentials and try again.",
        })
        setIsLoading(false)
      }
    } catch (error) {
      console.error("Login error:", error)
      setFormError("An unexpected error occurred. Please try again.")
      toast.error("Login failed", {
        description: "An unexpected error occurred.",
      })
      setIsLoading(false)
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeIn}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <Card className="overflow-hidden">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 md:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center text-center">
                <Link href="/">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <School className="h-6 w-6" />
                  </motion.div>
                </Link>
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-balance text-muted-foreground">Login to your SchoolPro account</p>
              </div>

              {formError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="rounded-md bg-destructive/15 p-3 text-center text-sm text-destructive"
                >
                  {formError}
                </motion.div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="email" className={cn(errors.email && "text-destructive")}>
                  Email / ID / Phone
                </Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="Email, Registration Number, or Phone"
                  {...register("email")}
                  className={cn(errors.email && "border-destructive")}
                  aria-invalid={errors.email ? "true" : "false"}
                  disabled={isLoading || isRedirecting}
                />
                {errors.email && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="text-xs text-destructive"
                  >
                    {errors.email.message}
                  </motion.p>
                )}
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password" className={cn(errors.password && "text-destructive")}>
                    Password
                  </Label>
                  <Link href="/auth/forgot-password" className="ml-auto text-sm underline-offset-2 hover:underline">
                    Forgot your password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    {...register("password")}
                    className={cn(errors.password && "border-destructive")}
                    aria-invalid={errors.password ? "true" : "false"}
                    disabled={isLoading || isRedirecting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading || isRedirecting}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                  </Button>
                </div>
                {errors.password && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="text-xs text-destructive"
                  >
                    {errors.password.message}
                  </motion.p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || isRedirecting}>
                {isLoading || isRedirecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isRedirecting ? "Redirecting..." : "Logging in..."}
                  </>
                ) : (
                  "Login"
                )}
              </Button>
            </div>
          </form>
          <div className="relative hidden bg-muted md:block">
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <div className="space-y-2">
                <School className="mx-auto h-12 w-12 text-primary" />
                <h2 className="text-2xl font-bold">SchoolPro</h2>
                <p className="text-muted-foreground">The comprehensive platform for modern school management</p>
              </div>
              <div className="mt-8 grid gap-1">
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 text-primary"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span className="text-sm">Student Management</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 text-primary"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span className="text-sm">Teacher Management</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 text-primary"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span className="text-sm">Class Scheduling</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 text-primary"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span className="text-sm">Fee Management</span>
                </div>
              </div>
            </div>
            <img
              src="/image-login.webp"
              alt="Login"
              className="absolute inset-0 h-full w-full object-cover opacity-20"
            />
          </div>
        </CardContent>
      </Card>
      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
        By clicking continue, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
      </div>
    </motion.div>
  )
}

