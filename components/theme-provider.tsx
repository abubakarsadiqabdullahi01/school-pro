"use client"

import type React from "react"

import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes"

/**
 * Wraps next-themes rather than hand-rolling theme state.
 *
 * The previous implementation initialised to "light" and corrected inside an
 * effect, so dark-mode users saw a white flash on every page load. It also read
 * the OS preference once and persisted the result, so it never followed a later
 * system change. next-themes injects a blocking script that resolves the theme
 * before first paint, and tracks the system preference properly.
 *
 * components/ui/sonner.tsx already reads useTheme from next-themes directly, so
 * mounting this provider is also what makes toasts follow the theme.
 */
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}

/**
 * Keeps the shape the existing callers expect — `{ theme, setTheme }` where
 * theme is always resolved to "light" or "dark", never "system". That matters
 * for the header toggle, which flips based on the current value.
 */
export const useTheme = () => {
  const { theme, resolvedTheme, setTheme } = useNextTheme()
  const resolved = (resolvedTheme ?? theme ?? "light") === "dark" ? "dark" : "light"

  return {
    theme: resolved as "light" | "dark",
    setTheme: (next: "light" | "dark") => setTheme(next),
  }
}
