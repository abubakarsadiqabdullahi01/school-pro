"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Link2, Loader2, Search, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"

import {
  completeStaffOnboarding,
  deleteStaffDocument,
  getOnboardingQueue,
  getStaffOnboarding,
  linkAllUnlinkedTeachers,
  linkTeacherToHr,
  verifyStaffDocument,
  type OnboardingQueue as QueueData,
  type StaffOnboardingView,
} from "@/app/actions/hr-onboarding"
import { StaffDocumentUpload } from "@/components/hr/staff-document-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

/**
 * Who has arrived and what HR still needs from them.
 *
 * Two lists, because there are two distinct problems and conflating them would hide the
 * worse one:
 *
 *  - **Not in HR at all.** A teacher with no `Staff` record — created before provisioning
 *    existed, or during a failure. They cannot be paid and nothing else would say so.
 *  - **In HR but incomplete.** A record with a name and little else. Payroll would happily
 *    treat it as finished, which is exactly why `onboardingStatus` exists.
 */
export function OnboardingQueue() {
  const [data, setData] = useState<QueueData | null>(null)
  const [detail, setDetail] = useState<StaffOnboardingView | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  function refresh() {
    setLoading(true)
    void getOnboardingQueue().then((result) => {
      setLoading(false)
      if (!result.success) {
        toast.error("Could not load the queue", { description: result.error })
        return
      }
      setData(result.data)
    })
  }

  useEffect(refresh, [])

  function openDetail(staffId: string) {
    setBusy(staffId)
    void getStaffOnboarding(staffId).then((result) => {
      setBusy(null)
      if (!result.success) {
        toast.error("Could not open that record", { description: result.error })
        return
      }
      setDetail(result.data)
    })
  }

  function link(teacherId: string, name: string) {
    setBusy(teacherId)
    startTransition(async () => {
      const result = await linkTeacherToHr({ teacherId })
      setBusy(null)
      if (!result.success) {
        toast.error("Could not link", { description: result.error })
        return
      }
      toast.success(`${name} added to HR as ${result.data.staffNo}`, {
        description: "Their file is not complete yet — it is now in the second list.",
      })
      refresh()
    })
  }

  function linkAll() {
    setBusy("all")
    startTransition(async () => {
      const result = await linkAllUnlinkedTeachers()
      setBusy(null)
      if (!result.success) {
        toast.error("Could not link them", { description: result.error })
        return
      }
      toast.success(`Created ${result.data.linked} HR record(s)`, {
        description: result.data.failed ? `${result.data.failed} could not be created.` : undefined,
      })
      refresh()
    })
  }

  function verify(documentId: string, staffId: string) {
    startTransition(async () => {
      const result = await verifyStaffDocument(documentId)
      if (!result.success) {
        toast.error("Could not verify", { description: result.error })
        return
      }
      toast.success("Document verified")
      openDetail(staffId)
    })
  }

  function remove(documentId: string, staffId: string, title: string) {
    startTransition(async () => {
      const result = await deleteStaffDocument(documentId)
      if (!result.success) {
        toast.error("Could not remove", { description: result.error })
        return
      }
      toast.success(`Removed "${title}"`)
      openDetail(staffId)
      refresh()
    })
  }

  function complete(staffId: string, name: string) {
    setBusy(staffId)
    startTransition(async () => {
      const result = await completeStaffOnboarding(staffId)
      setBusy(null)
      if (!result.success) {
        toast.error(`${name}'s file is not complete`, { description: result.error })
        return
      }
      toast.success(`${name}'s onboarding is complete`)
      setDetail(null)
      refresh()
    })
  }

  /**
   * One box over both lists.
   *
   * The queue is longest on the day a school upgrades - every teacher who predates HR
   * arrives in it at once - which is exactly when somebody needs to find one person in it.
   */
  const needle = search.trim().toLowerCase()
  const matchingUnlinked = useMemo(() => {
    const list = data?.unlinked ?? []
    if (!needle) return list
    return list.filter(
      (teacher) =>
        teacher.name.toLowerCase().includes(needle) ||
        teacher.staffId.toLowerCase().includes(needle) ||
        (teacher.department ?? "").toLowerCase().includes(needle),
    )
  }, [data, needle])

  const matchingIncomplete = useMemo(() => {
    const list = data?.incomplete ?? []
    if (!needle) return list
    return list.filter(
      (staff) =>
        staff.name.toLowerCase().includes(needle) ||
        staff.staffNo.toLowerCase().includes(needle) ||
        (staff.jobTitle ?? "").toLowerCase().includes(needle),
    )
  }, [data, needle])

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  const unlinked = data?.unlinked ?? []
  const incomplete = data?.incomplete ?? []
  const showing = search.trim().length > 0

  return (
    <div className="space-y-6">
      {(unlinked.length > 0 || incomplete.length > 0) && (
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            className="pl-8"
            placeholder="Search by name, staff number or role"
            aria-label="Search the onboarding queue"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Not in HR at all (
                {showing && matchingUnlinked.length !== unlinked.length
                  ? `${matchingUnlinked.length} of ${unlinked.length}`
                  : unlinked.length}
                )
              </CardTitle>
              <CardDescription>
                Teachers with no staff record. They have no staff number and cannot be put on
                payroll until one exists.
              </CardDescription>
            </div>
            {unlinked.length > 0 && (
              <Button onClick={linkAll} disabled={pending}>
                {busy === "all" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Add all {unlinked.length} to HR
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {unlinked.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Every teacher has a staff record.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {matchingUnlinked.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">
                  Nobody here matches &ldquo;{search.trim()}&rdquo;.
                </li>
              )}
              {matchingUnlinked.map((teacher) => (
                <li
                  key={teacher.teacherId}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{teacher.name}</span>
                      {!teacher.isActive && <Badge variant="outline">Inactive login</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Staff ID {teacher.staffId}
                      {teacher.department ? ` · ${teacher.department}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => link(teacher.teacherId, teacher.name)}
                  >
                    {busy === teacher.teacherId ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="mr-2 h-4 w-4" />
                    )}
                    Add to HR
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Documentation outstanding (
            {showing && matchingIncomplete.length !== incomplete.length
              ? `${matchingIncomplete.length} of ${incomplete.length}`
              : incomplete.length}
            )
          </CardTitle>
          <CardDescription>
            Staff records that exist but are not finished. A record here is not ready for
            payroll, whatever else has been set up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {incomplete.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Every staff file is complete.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {matchingIncomplete.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">
                  Nobody here matches &ldquo;{search.trim()}&rdquo;.
                </li>
              )}
              {matchingIncomplete.map((staff) => (
                <li key={staff.staffId} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{staff.name}</span>
                        <Badge variant="outline">{staff.staffNo}</Badge>
                        {staff.autoProvisioned && (
                          <Badge variant="secondary">Added from teachers</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{staff.summary}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => openDetail(staff.staffId)}
                      >
                        {busy === staff.staffId ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Checklist
                      </Button>
                    </div>
                  </div>
                  <Progress value={staff.percentComplete} className="h-1.5" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {detail && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {detail.name} · {detail.staffNo}
                </CardTitle>
                <CardDescription>
                  {detail.percentComplete}% complete. Required items must all be satisfied
                  before this file can be marked done.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
                  Close
                </Button>
                <Button
                  size="sm"
                  disabled={pending || !detail.canComplete}
                  onClick={() => complete(detail.staffId, detail.name)}
                >
                  Mark complete
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y rounded-md border">
              {detail.items.map((item) => (
                <li key={item.key} className="flex items-start gap-3 p-3">
                  <span
                    className={
                      item.satisfied
                        ? "mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                        : item.severity === "REQUIRED"
                          ? "mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive"
                          : "mt-0.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40"
                    }
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={item.satisfied ? "text-muted-foreground" : "font-medium"}>
                        {item.label}
                      </span>
                      {item.severity === "RECOMMENDED" && (
                        <Badge variant="outline" className="text-xs">
                          Optional
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.hint}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">
                Documents on file ({detail.documents.length})
              </h4>

              {detail.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing uploaded yet. The appointment letter and an ID are both required
                  before this file can be marked complete.
                </p>
              ) : (
                <ul className="divide-y rounded-md border text-sm">
                  {detail.documents.map((document) => (
                    <li key={document.id} className="flex items-center justify-between gap-3 p-2">
                      <span className="min-w-0 truncate">
                        {document.title}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {document.type.toLowerCase().replace(/_/g, " ")}
                        </span>
                        {document.expiresAt && (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-500">
                            expires {new Date(document.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {document.verifiedAt ? (
                          <Badge variant="outline" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Verified
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => verify(document.id, detail.staffId)}
                          >
                            Verify
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => remove(document.id, detail.staffId, document.title)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove {document.title}</span>
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <StaffDocumentUpload
                staffId={detail.staffId}
                onUploaded={() => {
                  // Re-read both the checklist and the queue: uploading the first document
                  // also moves the record out of NOT_STARTED.
                  openDetail(detail.staffId)
                  refresh()
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
