"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { createFeeCategory, createFeeSchedule } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface FinanceFeeSetupFormProps {
  setup: {
    categories: Array<{ id: string; name: string; type: string; isActive: boolean }>
    sessions: Array<{ id: string; name: string; isCurrent: boolean }>
    terms: Array<{ id: string; name: string; sessionId: string; isCurrent: boolean }>
    classTerms: Array<{ id: string; className: string; termName: string; termId: string }>
  }
}

export function FinanceFeeSetupForm({ setup }: FinanceFeeSetupFormProps) {
  const [isPending, startTransition] = useTransition()
  const [selectedSessionId, setSelectedSessionId] = useState(
    setup.sessions.find((session) => session.isCurrent)?.id ?? setup.sessions[0]?.id ?? "",
  )
  const [selectedTermId, setSelectedTermId] = useState(
    setup.terms.find((term) => term.isCurrent)?.id ?? setup.terms[0]?.id ?? "",
  )

  const terms = useMemo(
    () => setup.terms.filter((term) => term.sessionId === selectedSessionId),
    [setup.terms, selectedSessionId],
  )
  const classTerms = useMemo(
    () => setup.classTerms.filter((classTerm) => classTerm.termId === selectedTermId),
    [setup.classTerms, selectedTermId],
  )

  function submitCategory(formData: FormData) {
    startTransition(async () => {
      const result = await createFeeCategory({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        type: String(formData.get("type") ?? "MANDATORY"),
      })

      if (result.success) {
        toast.success("Fee category created")
      } else {
        toast.error("Category not created", { description: result.error })
      }
    })
  }

  function submitSchedule(formData: FormData) {
    startTransition(async () => {
      const result = await createFeeSchedule({
        sessionId: selectedSessionId,
        termId: selectedTermId,
        classTermId: String(formData.get("classTermId") ?? ""),
        categoryId: String(formData.get("categoryId") ?? ""),
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        amount: Number(formData.get("amount") ?? 0),
        appliesTo: String(formData.get("appliesTo") ?? "ALL_STUDENTS"),
        isMandatory: formData.get("isMandatory") === "on",
        dueDate: String(formData.get("dueDate") || "") || null,
      })

      if (result.success) {
        toast.success("Fee schedule created", {
          description: `${result.data.chargesCreated} student charge(s) generated.`,
        })
      } else {
        toast.error("Schedule not created", { description: result.error })
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>New Category</CardTitle>
          <CardDescription>Start here for tuition, registration, optional services, and other fee groups.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submitCategory} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input id="category-name" name="name" placeholder="Tuition Fee" required />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select name="type" defaultValue="MANDATORY">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANDATORY">Mandatory</SelectItem>
                  <SelectItem value="OPTIONAL">Optional</SelectItem>
                  <SelectItem value="REGISTRATION">Registration</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <Textarea id="category-description" name="description" rows={3} />
            </div>
            <Button type="submit" disabled={isPending}>Create Category</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New Fee Schedule</CardTitle>
          <CardDescription>Choose the period and class. The system creates charge rows for active students.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submitSchedule} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Session</Label>
                <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    {setup.sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id}>{session.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Term</Label>
                <Select value={selectedTermId} onValueChange={setSelectedTermId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select term" />
                  </SelectTrigger>
                  <SelectContent>
                    {terms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>{term.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select name="classTermId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classTerms.map((classTerm) => (
                      <SelectItem key={classTerm.id} value={classTerm.id}>
                        {classTerm.className} · {classTerm.termName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select name="categoryId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {setup.categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fee-name">Fee Name</Label>
                <Input id="fee-name" name="name" placeholder="First Term Tuition" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" min="1" step="0.01" placeholder="50000" required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Applies To</Label>
                <Select name="appliesTo" defaultValue="ALL_STUDENTS">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_STUDENTS">All Students</SelectItem>
                    <SelectItem value="NEW_STUDENTS">New Students</SelectItem>
                    <SelectItem value="RETURNING_STUDENTS">Returning Students</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-date">Due Date</Label>
                <Input id="due-date" name="dueDate" type="date" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fee-description">Description</Label>
              <Textarea id="fee-description" name="description" rows={3} />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input name="isMandatory" type="checkbox" defaultChecked className="h-4 w-4" />
              Mandatory fee
            </label>

            <Button type="submit" disabled={isPending || setup.categories.length === 0 || classTerms.length === 0}>
              Create Schedule
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
