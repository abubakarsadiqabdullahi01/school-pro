"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Back navigation for a page reached from a list, a dashboard tile or a link in a receipt.
 *
 * Prefers the browser's own history so "back" returns to wherever the user actually came
 * from — a debtor opened from the debtor list should return to that list, filters intact,
 * not to a module landing page. `fallbackHref` covers the case where there is no history to
 * go back to: a receipt link pasted into a chat and opened in a fresh tab.
 */
export function BackButton({ fallbackHref, label = "Back" }: { fallbackHref: string; label?: string }) {
  const router = useRouter()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        if (window.history.length > 1) router.back()
        else router.push(fallbackHref)
      }}
      className="mb-2 print:hidden"
    >
      <ArrowLeft className="mr-2 h-4 w-4" />
      {label}
    </Button>
  )
}
