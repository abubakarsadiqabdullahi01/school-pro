"use client"

import { useEffect } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  useEffect(() => {
    if (!value && gradingSystems.length > 0) {
      const defaultSystem = gradingSystems.find((system) => system.isDefault)
      if (defaultSystem) {
        onValueChange(defaultSystem.id)
      }
    }
  }, [value, gradingSystems, onValueChange])

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {gradingSystems.map((system) => (
          <SelectItem key={system.id} value={system.id}>
            {system.name}
            {system.isDefault ? " (Default)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
