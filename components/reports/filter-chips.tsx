"use client"

import { X } from "lucide-react"

export type FilterChip = {
  /** The query key this chip owns, so removing it is a matter of clearing that key. */
  key: string
  label: string
  value: string
}

/**
 * What is currently filtered, and the way out of each one.
 *
 * The chips answer "what am I looking at?" — which a printed page and a filtered total both
 * depend on somebody knowing — and each is its own undo. Removing a single filter without
 * losing the rest is the whole point of them.
 */
export function FilterChips({ chips, onRemove }: { chips: FilterChip[]; onRemove: (key: string) => void }) {
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs transition-colors hover:bg-muted"
          aria-label={`Remove the ${chip.label.toLowerCase()} filter`}
        >
          <span className="text-muted-foreground">{chip.label}:</span>
          <span className="font-medium">{chip.value}</span>
          <X className="size-3 text-muted-foreground" aria-hidden />
        </button>
      ))}
    </div>
  )
}
