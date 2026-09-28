"use client"

import { useMemo } from "react"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { NIGERIAN_STATE_NAMES, isLgaOfState, lgasForState } from "@/lib/nigeria"

/**
 * Paired State and Local Government Area selects, both searchable.
 *
 * One component rather than two, because the fields are not independent: the LGA list is
 * derived from the state, and changing the state has to clear an LGA that no longer belongs
 * to it. Leaving that to each of the seven forms that use these fields is how you end up
 * with a student recorded in Lagos / Yamaltu-Deba.
 *
 * Both fields were free text before. That is why a value already on the record that is not
 * in the list is still shown, as an extra option — so opening an old record to edit one
 * field does not silently discard the other.
 */
export function StateLgaFields<T extends FieldValues>({
  form,
  stateName,
  lgaName,
  disabled,
}: {
  form: UseFormReturn<T>
  /** Field path for the state — almost always "state". */
  stateName: Path<T>
  /** Field path for the LGA — almost always "lga". */
  lgaName: Path<T>
  disabled?: boolean
}) {
  const selectedState = form.watch(stateName) as string | undefined
  const selectedLga = form.watch(lgaName) as string | undefined

  const lgaOptions = useMemo(() => {
    const known = lgasForState(selectedState)
    // A record saved before these were dropdowns may hold an LGA the list does not have.
    // Without this the field would render empty and an unrelated edit would wipe the value.
    if (selectedLga && !isLgaOfState(selectedState, selectedLga)) {
      return [selectedLga, ...known]
    }
    return known
  }, [selectedState, selectedLga])

  return (
    <>
      <FormField
        control={form.control}
        name={stateName}
        render={({ field }) => (
          <FormItem>
            <FormLabel>State</FormLabel>
            <FormControl>
              <SearchableSelect
                options={NIGERIAN_STATE_NAMES}
                value={field.value}
                disabled={disabled}
                allowClear
                placeholder="Select state"
                searchPlaceholder="Search states..."
                emptyMessage="No state matches that."
                onChange={(value) => {
                  field.onChange(value)
                  // The LGA belongs to the old state. Keeping it would save a pairing that
                  // does not exist.
                  if (!isLgaOfState(value, form.getValues(lgaName) as string | undefined)) {
                    form.setValue(lgaName, "" as never, { shouldDirty: true })
                  }
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={lgaName}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Local Government Area</FormLabel>
            <FormControl>
              <SearchableSelect
                options={lgaOptions}
                value={field.value}
                onChange={field.onChange}
                disabled={disabled || lgaOptions.length === 0}
                allowClear
                placeholder={selectedState ? "Select LGA" : "Select a state first"}
                searchPlaceholder="Search local governments..."
                emptyMessage="No local government matches that."
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}
