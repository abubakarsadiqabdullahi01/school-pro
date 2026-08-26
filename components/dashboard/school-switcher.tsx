"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, Check, ChevronsUpDown, Globe, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { setActiveSchool } from "@/app/actions/school-context"
import { ALL_SCHOOLS, type SchoolOption } from "@/lib/school-context"

interface SchoolSwitcherProps {
  schools: SchoolOption[]
  activeSchool: { id: string; name: string; code: string } | null
}

export function SchoolSwitcher({ schools, activeSchool }: SchoolSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // With only one school there is nothing to switch between, and a dropdown that never
  // changes anything is just noise. Show it as a plain label instead.
  const isSwitchable = schools.length > 1

  const filtered = schools.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.code.toLowerCase().includes(query.toLowerCase()),
  )

  const select = (schoolId: string) => {
    setOpen(false)
    setQuery("")
    startTransition(async () => {
      const result = await setActiveSchool(schoolId)
      if (!result.success) {
        toast.error(result.error ?? "Could not switch school")
        return
      }
      router.refresh()
    })
  }

  const label = activeSchool ? activeSchool.name : "All schools"
  const sublabel = activeSchool ? activeSchool.code : `${schools.length} schools`

  if (!isSwitchable) {
    const only = schools[0]
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-medium">{only ? only.name : "No schools yet"}</div>
          {only && <div className="text-xs text-muted-foreground">{only.code}</div>}
        </div>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Switch school"
          className="h-auto max-w-[16rem] justify-between gap-2 px-3 py-1.5"
          disabled={isPending}
        >
          <span className="flex min-w-0 items-center gap-2">
            {isPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : activeSchool ? (
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 text-left leading-tight">
              <span className="block truncate text-sm font-medium">{label}</span>
              <span className="block text-xs font-normal text-muted-foreground">{sublabel}</span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[18rem] p-0" align="end">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search schools..."
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[18rem] overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => select(ALL_SCHOOLS)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">All schools</span>
            {!activeSchool && <Check className="h-4 w-4 shrink-0" />}
          </button>

          <div className="my-1 h-px bg-border" />

          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No schools found</div>
          ) : (
            filtered.map((school) => (
              <button
                key={school.id}
                type="button"
                onClick={() => select(school.id)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{school.name}</span>
                  {/* Names are not unique, so the code is what actually identifies a school. */}
                  <span className="block text-xs text-muted-foreground">{school.code}</span>
                </span>
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    activeSchool?.id === school.id ? "opacity-100" : "opacity-0",
                  )}
                />
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
