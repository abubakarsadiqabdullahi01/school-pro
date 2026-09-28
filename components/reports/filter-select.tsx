"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ANY } from "@/lib/query-filters"

export type FilterOption = { value: string; label: string }

/**
 * One filter, as a labelled select whose first option means "don't filter by this".
 *
 * The trigger's text is rendered here rather than left to Radix to look up. Radix reads it
 * from the selected item, and the items only exist once the menu has been opened, so on a
 * freshly loaded page every filter came up as an empty box.
 */
export function FilterSelect({
  id,
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  id: string
  label: string
  value?: string
  /** What "no filter" reads as, e.g. "Any method". */
  placeholder: string
  options: FilterOption[]
  onChange: (value?: string) => void
}) {
  const selected = value ? options.find((option) => option.value === value) : undefined

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? undefined : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{selected?.label ?? placeholder}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
