"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * A select you can type into.
 *
 * Built on Popover rather than pulling in `cmdk`, because the only thing missing from a
 * plain select here is a filter box, and a new dependency is a poor trade for that.
 *
 * It exists because some of these lists are long enough that scrolling is the wrong
 * interaction: 37 states is borderline, and Kano's 44 local governments is not. Typing
 * three letters should be enough.
 *
 * Keyboard behaviour is the part people notice when it is missing — the search box takes
 * focus on open, arrows move the highlight, Enter picks it, Escape closes. The highlighted
 * option is tracked as an index into the *filtered* list, so it always points at something
 * visible.
 */
/**
 * An option with a value distinct from its label — a subject id against its name, say —
 * plus an optional second line such as a subject code.
 */
export interface SearchableOption {
  value: string
  label: string
  hint?: string
  /**
   * Shown but not selectable. The option stays in the list on purpose — an ended session
   * disappearing from the dropdown reads as a bug, where a greyed one with a reason reads
   * as a rule.
   */
  disabled?: boolean
  /** Why it cannot be picked. Shown in place of the hint. */
  disabledReason?: string
}

export interface SearchableSelectProps {
  /** Plain strings when value and label are the same, objects when they differ. */
  options: readonly (string | SearchableOption)[]
  value: string | null | undefined
  onChange: (value: string) => void
  placeholder?: string
  /** Shown in the filter box. */
  searchPlaceholder?: string
  /** Shown when the filter matches nothing. */
  emptyMessage?: string
  disabled?: boolean
  /** Lets the caller offer a "clear" affordance for an optional field. */
  allowClear?: boolean
  className?: string
  /** Wired to the FormControl so the label and error messages stay associated. */
  id?: string
  "aria-invalid"?: boolean
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No match found.",
  disabled,
  allowClear,
  className,
  id,
  ...aria
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [highlight, setHighlight] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  // One internal shape, so the rest of the component does not care which form the caller used.
  const items: SearchableOption[] = React.useMemo(
    () => options.map((option) => (typeof option === "string" ? { value: option, label: option } : option)),
    [options],
  )

  const selected = React.useMemo(
    () => items.find((item) => item.value === value) ?? null,
    [items, value],
  )

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    // `includes`, not `startsWith`: somebody looking for "Ikot Ekpene" may well type "ekpene",
    // and for a slash-joined name like "Yamaltu/Deba" either half is a fair thing to type.
    // The hint is searched too, so a subject code like "BSC" finds Basic Science.
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.hint?.toLowerCase().includes(needle),
    )
  }, [items, query])

  // A fresh filter invalidates the old highlight position.
  React.useEffect(() => {
    setHighlight(0)
  }, [query])

  // Opening should start on the current selection, not at the top of the list.
  React.useEffect(() => {
    if (!open) {
      setQuery("")
      return
    }
    const index = items.findIndex((item) => item.value === value && !item.disabled)
    setHighlight(index >= 0 ? index : items.findIndex((item) => !item.disabled))
  }, [open, items, value])

  // Keep the highlighted row in view while arrowing through a long list.
  React.useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
    node?.scrollIntoView({ block: "nearest" })
  }, [highlight, open])

  const commit = (item: SearchableOption) => {
    if (item.disabled) return
    onChange(item.value)
    setOpen(false)
  }

  /** Walks past disabled options so the highlight always lands on something selectable. */
  const step = (from: number, direction: 1 | -1): number => {
    const count = filtered.length
    if (count === 0) return 0
    for (let i = 1; i <= count; i++) {
      const index = (((from + direction * i) % count) + count) % count
      if (!filtered[index].disabled) return index
    }
    return from
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlight((prev) => step(prev, 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlight((prev) => step(prev, -1))
    } else if (event.key === "Enter") {
      // Inside a form, Enter here must not reach the form and submit it.
      event.preventDefault()
      const choice = filtered[highlight]
      if (choice) commit(choice)
    } else if (event.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={aria["aria-invalid"]}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected?.label || placeholder}</span>
          <span className="flex shrink-0 items-center gap-1">
            {allowClear && value && (
              // A span, not a button: a button inside a button is invalid markup and React
              // will warn. The trigger's own click is suppressed so clearing does not open.
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear selection"
                className="rounded-sm opacity-60 hover:opacity-100"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onChange("")
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(event) => {
          // Focus the filter box rather than the first option, so typing just works.
          event.preventDefault()
          searchRef.current?.focus()
        }}
      >
        <div className="flex items-center border-b px-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            filtered.map((item, index) => {
              const isSelected = item.value === value
              return (
                <div
                  key={item.value}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={item.disabled || undefined}
                  onClick={() => commit(item)}
                  onMouseEnter={() => !item.disabled && setHighlight(index)}
                  className={cn(
                    "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                    item.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    index === highlight && !item.disabled && "bg-accent text-accent-foreground",
                  )}
                >
                  <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {(item.disabled ? item.disabledReason : item.hint) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.disabled ? item.disabledReason : item.hint}
                      </span>
                    )}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
