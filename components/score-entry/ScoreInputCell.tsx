"use client"

import type React from "react"

import { memo, useCallback, useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface ScoreInputCellProps {
  value: number | null
  onChange: (value: number | null) => void
  min: number
  max: number
  step?: number
  disabled?: boolean
  hasError?: boolean
  errorMessage?: string
  className?: string
  placeholder?: string
  hasExistingData?: boolean // NEW: Indicates if there's existing data
}

export const ScoreInputCell = memo(function ScoreInputCell({
  value,
  onChange,
  min,
  max,
  step = 0.5,
  disabled = false,
  hasError = false,
  errorMessage,
  className,
  placeholder = "0",
  hasExistingData = false, // NEW: Default to false
}: ScoreInputCellProps) {
  const [localValue, setLocalValue] = useState(value?.toString() ?? "0")

  // Sync local value with prop value
  useEffect(() => {
    setLocalValue(value?.toString() ?? "0")
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setLocalValue(newValue)

      if (newValue === "" || newValue === "0") {
        onChange(0)
      } else {
        const numValue = Number.parseFloat(newValue)
        if (!isNaN(numValue)) {
          onChange(numValue)
        }
      }
    },
    [onChange],
  )

  const handleBlur = useCallback(() => {
    // Validate on blur
    if (localValue !== "") {
      const numValue = Number.parseFloat(localValue)
      if (!isNaN(numValue)) {
        if (numValue < min) {
          setLocalValue(min.toString())
          onChange(min)
        } else if (numValue > max) {
          setLocalValue(max.toString())
          onChange(max)
        }
      }
    }
  }, [localValue, min, max, onChange])

  return (
    <div className="relative">
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "h-8 w-20 text-center",
          hasError && "border-red-500 focus:border-red-500",
          hasExistingData && !hasError && "border-blue-300 bg-blue-50", // NEW: Highlight existing data
          className,
        )}
        title={errorMessage}
      />
      {hasError && errorMessage && (
        <div className="absolute -bottom-5 left-0 text-xs text-red-500 whitespace-nowrap">{errorMessage}</div>
      )}
      {hasExistingData && !hasError && (
        <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" title="Has existing data" />
      )}
    </div>
  )
})
