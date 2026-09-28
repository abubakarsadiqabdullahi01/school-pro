"use client"

import * as React from "react"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { TermRuleVerdict } from "@/lib/term-rules"

/**
 * One row of a term's action menu, greyed out with its reason when the rules in
 * `lib/term-rules.ts` say the server would refuse it.
 *
 * Dropping the row entirely would be less code, but an admin who has deleted terms before
 * would conclude the menu was broken rather than that the term is now history. The refusal
 * is worth a sentence, and it belongs here rather than in a toast that arrives after the
 * red confirmation dialog.
 *
 * Shared by the four term tables so a rule cannot be applied in one and forgotten in
 * another — which is how the school admin ended up being offered Delete on a closed term.
 */
export function TermActionItem({
  verdict,
  onSelect,
  busy,
  destructive,
  children,
}: {
  verdict: TermRuleVerdict
  onSelect: () => void
  /** Allowed, but already in flight. */
  busy?: boolean
  destructive?: boolean
  children: React.ReactNode
}) {
  if (!verdict.allowed) {
    return (
      <>
        <DropdownMenuItem disabled>{children}</DropdownMenuItem>
        {/* Capped so a long reason wraps instead of stretching the whole menu. */}
        <p className="max-w-64 px-2 pb-1.5 pl-8 text-xs leading-snug text-muted-foreground">
          {verdict.reason}
        </p>
      </>
    )
  }

  return (
    <DropdownMenuItem
      onClick={onSelect}
      disabled={busy}
      className={cn(destructive && "text-destructive focus:text-destructive")}
    >
      {children}
    </DropdownMenuItem>
  )
}
