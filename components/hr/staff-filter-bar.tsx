"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"

import { FilterChips } from "@/components/reports/filter-chips"
import { FilterSelect, type FilterOption } from "@/components/reports/filter-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  EMPLOYMENT_STATUSES,
  SALARY_STATES,
  STAFF_TYPES,
  countStaffFilters,
  staffChips,
  staffFilterHref,
  type StaffFilters,
} from "@/lib/hr/staff-filters"
import { cn } from "@/lib/utils"

/**
 * What the staff directory is showing.
 *
 * Replaces a GET form with an Apply button: every select navigates as it is chosen, each
 * active filter shows as a chip that removes itself, and the table no longer carries a
 * second search box of its own. Print, PDF and CSV then carry exactly the slice on screen,
 * because the server read the same query string the table did.
 */
export function StaffFilterBar({
  basePath,
  filters,
  departments,
}: {
  basePath: string
  filters: StaffFilters
  /** The departments this school actually uses; the field is free text on the record. */
  departments: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const go = (overrides: Partial<Record<keyof StaffFilters, string | undefined>>) => {
    startTransition(() => router.push(staffFilterHref(basePath, filters, overrides)))
  }

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    go({ search: String(form.get("search") ?? "").trim() || undefined })
  }

  const departmentOptions: FilterOption[] = departments.map((department) => ({
    value: department,
    label: department,
  }))

  return (
    <Card className={cn("print:hidden", pending && "opacity-70 transition-opacity")}>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Name, staff number or job title"
            className="sm:max-w-md"
            aria-label="Search staff"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Search
            </Button>
            {countStaffFilters(filters) > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push(basePath)}>
                Clear all
              </Button>
            )}
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="staff-department"
            label="Department"
            value={filters.department}
            placeholder="Any department"
            options={departmentOptions}
            onChange={(value) => go({ department: value })}
          />
          <FilterSelect
            id="staff-type"
            label="Staff type"
            value={filters.staffType}
            placeholder="Any type"
            options={[...STAFF_TYPES]}
            onChange={(value) => go({ staffType: value })}
          />
          <FilterSelect
            id="staff-status"
            label="Status"
            value={filters.employmentStatus}
            placeholder="Any status"
            options={[...EMPLOYMENT_STATUSES]}
            onChange={(value) => go({ employmentStatus: value })}
          />
          <FilterSelect
            id="staff-salary"
            label="Salary"
            value={filters.salary}
            placeholder="Set or not"
            options={[...SALARY_STATES]}
            onChange={(value) => go({ salary: value })}
          />
        </div>

        <FilterChips
          chips={staffChips(filters)}
          onRemove={(key) => go({ [key as keyof StaffFilters]: undefined })}
        />
      </CardContent>
    </Card>
  )
}
