"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { saveTraitRatings } from "@/app/actions/teacher-traits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MAX_RATING, MIN_RATING, RATING_LABELS } from "@/lib/report-traits"

type Trait = { code: string; label: string; domain: string }

type Student = {
  id: string
  admissionNo: string
  fullName: string
  ratings: Record<string, number>
}

interface TraitRatingsGridProps {
  classTermId: string
  className: string
  termName: string
  sessionName: string
  traits: Trait[]
  students: Student[]
}

const SCALE = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, index) => MAX_RATING - index)

/** "5 — Excellent", for the cell dropdowns and the key. */
const scaleLabel = (rating: number) => `${rating} — ${RATING_LABELS[rating]}`

const cellSelect =
  "h-8 w-full min-w-[3.5rem] rounded-md border border-input bg-background px-1 text-center text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"

/**
 * The termly behaviour and skills sheet: students down, traits across.
 *
 * Ratings print on the report card, so an unrated trait is left empty rather
 * than defaulted — a 3 nobody chose is worse than a dash.
 */
export function TraitRatingsGrid({
  classTermId,
  className,
  termName,
  sessionName,
  traits,
  students,
}: TraitRatingsGridProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState<Record<string, Record<string, number | null>>>({})

  const affective = useMemo(() => traits.filter((trait) => trait.domain === "AFFECTIVE"), [traits])
  const psychomotor = useMemo(() => traits.filter((trait) => trait.domain === "PSYCHOMOTOR"), [traits])

  function valueFor(student: Student, trait: string): number | null {
    const edited = draft[student.id]?.[trait]
    if (edited !== undefined) return edited
    return student.ratings[trait] ?? null
  }

  function setValue(studentId: string, trait: string, rating: number | null) {
    setDraft((current) => ({
      ...current,
      [studentId]: { ...(current[studentId] ?? {}), [trait]: rating },
    }))
  }

  /** Fills a whole column — the difference between rating 40 students and 440 cells. */
  function setColumn(trait: string, rating: number | null) {
    setDraft((current) => {
      const next = { ...current }
      for (const student of students) {
        next[student.id] = { ...(next[student.id] ?? {}), [trait]: rating }
      }
      return next
    })
  }

  const pendingChanges = Object.values(draft).reduce((total, row) => total + Object.keys(row).length, 0)

  function save() {
    const ratings = Object.entries(draft).flatMap(([studentId, row]) =>
      Object.entries(row).map(([trait, rating]) => ({ studentId, trait, rating })),
    )

    if (ratings.length === 0) {
      toast.info("Nothing to save", { description: "No ratings have been changed yet." })
      return
    }

    startTransition(async () => {
      const result = await saveTraitRatings({ classTermId, ratings })

      if (!result.success) {
        toast.error("Not saved", { description: result.error })
        return
      }

      setDraft({})
      toast.success("Ratings saved", {
        description:
          `${result.data.saved} rating${result.data.saved === 1 ? "" : "s"} recorded` +
          (result.data.cleared > 0 ? `, ${result.data.cleared} cleared.` : "."),
      })
      router.refresh()
    })
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Behaviour &amp; Skills</CardTitle>
          <CardDescription>No active students in this class yet.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Behaviour &amp; Skills</CardTitle>
            <CardDescription>
              {className} · {termName} · {sessionName} — these ratings print on each student&apos;s
              report sheet. Leave a trait empty and it prints as a dash.
            </CardDescription>
          </div>
          <Button onClick={save} disabled={isPending || pendingChanges === 0}>
            {isPending ? "Saving…" : pendingChanges > 0 ? `Save ${pendingChanges} change${pendingChanges === 1 ? "" : "s"}` : "Save"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {SCALE.map((rating) => scaleLabel(rating)).join(" · ")}
        </p>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-10 border-b bg-background p-2 text-left align-bottom font-medium"
                >
                  Student
                </th>
                <th colSpan={affective.length} className="border-b border-l p-2 text-center font-medium">
                  Affective Domain
                </th>
                <th colSpan={psychomotor.length} className="border-b border-l p-2 text-center font-medium">
                  Psychomotor
                </th>
              </tr>
              <tr>
                {traits.map((trait, index) => (
                  <th
                    key={trait.code}
                    className={`border-b p-2 align-bottom text-xs font-medium ${
                      index === 0 || trait.code === psychomotor[0]?.code ? "border-l" : ""
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="whitespace-nowrap">{trait.label}</span>
                      <select
                        aria-label={`Set ${trait.label} for the whole class`}
                        className={`${cellSelect} text-xs text-muted-foreground`}
                        value=""
                        disabled={isPending}
                        onChange={(event) =>
                          setColumn(trait.code, event.target.value === "" ? null : Number(event.target.value))
                        }
                      >
                        <option value="">All…</option>
                        {SCALE.map((rating) => (
                          <option key={rating} value={rating}>
                            {rating}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-muted/40">
                  <td className="sticky left-0 z-10 border-b bg-background p-2">
                    <div className="min-w-[10rem]">
                      <p className="font-medium leading-tight">{student.fullName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{student.admissionNo}</p>
                    </div>
                  </td>
                  {traits.map((trait, index) => (
                    <td
                      key={trait.code}
                      className={`border-b p-1 ${
                        index === 0 || trait.code === psychomotor[0]?.code ? "border-l" : ""
                      }`}
                    >
                      <select
                        aria-label={`${trait.label} for ${student.fullName}`}
                        className={cellSelect}
                        disabled={isPending}
                        value={valueFor(student, trait.code) ?? ""}
                        onChange={(event) =>
                          setValue(
                            student.id,
                            trait.code,
                            event.target.value === "" ? null : Number(event.target.value),
                          )
                        }
                      >
                        <option value="">–</option>
                        {SCALE.map((rating) => (
                          <option key={rating} value={rating}>
                            {rating}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
