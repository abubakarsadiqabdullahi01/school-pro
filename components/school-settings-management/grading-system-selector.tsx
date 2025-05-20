"use client"

import { useState, useEffect } from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface GradingSystemSelectorProps {
  gradingSystems: {
    id: string
    name: string
    isDefault: boolean
  }[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function GradingSystemSelector({
  gradingSystems,
  value,
  onValueChange,
  placeholder = "Select grading system",
  disabled = false,
}: GradingSystemSelectorProps) {
  const [open, setOpen] = useState(false)

  // Set default value if none selected and there's a default system
  useEffect(() => {
    if (!value && gradingSystems.length > 0) {
      const defaultSystem = gradingSystems.find((system) => system.isDefault)
      if (defaultSystem) {
        onValueChange(defaultSystem.id)
      }
    }
  }, [value, gradingSystems, onValueChange])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {value ? gradingSystems.find((system) => system.id === value)?.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search grading system..." />
          <CommandList>
            <CommandEmpty>No grading system found.</CommandEmpty>
            <CommandGroup>
              {gradingSystems.map((system) => (
                <CommandItem
                  key={system.id}
                  value={system.id}
                  onSelect={() => {
                    onValueChange(system.id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === system.id ? "opacity-100" : "opacity-0")} />
                  {system.name}
                  {system.isDefault && <span className="ml-2 text-xs text-muted-foreground">(Default)</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
