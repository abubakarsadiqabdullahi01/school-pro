"use client"

import { useRef, useState } from "react"
import { Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * Putting a document on a staff member's file.
 *
 * Posts to `app/api/hr/staff-document-upload`, which stores the bytes and records the row,
 * rather than going through a server action: a server action cannot take a `File`, and the
 * route already mirrors how expense receipts are handled — one place that knows about disk.
 *
 * Two of these documents are required before onboarding can be completed, so without this
 * control the checklist is unsatisfiable from the UI. It is the reason this component
 * exists rather than being a nicety.
 */

const TYPES = [
  { value: "APPOINTMENT_LETTER", label: "Appointment letter", required: true },
  { value: "IDENTIFICATION", label: "Identification", required: true },
  { value: "QUALIFICATION_CERTIFICATE", label: "Qualification certificate", required: false },
  { value: "BIRTH_CERTIFICATE", label: "Birth certificate", required: false },
  { value: "MEDICAL_REPORT", label: "Medical report", required: false },
  { value: "REFERENCE_LETTER", label: "Reference letter", required: false },
  { value: "GUARANTOR_FORM", label: "Guarantor form", required: false },
  { value: "CONTRACT", label: "Contract", required: false },
  { value: "OTHER", label: "Other", required: false },
] as const

export function StaffDocumentUpload({
  staffId,
  onUploaded,
}: {
  staffId: string
  /** Called after a successful upload so the checklist can be re-read. */
  onUploaded: () => void
}) {
  const [type, setType] = useState<string>("APPOINTMENT_LETTER")
  const [title, setTitle] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      toast.error("Choose a file first")
      return
    }

    const form = new FormData()
    form.append("document", file)
    form.append("staffId", staffId)
    form.append("type", type)
    // The route falls back to the file's own name when this is blank.
    if (title.trim()) form.append("title", title.trim())
    if (expiresAt) form.append("expiresAt", expiresAt)

    setBusy(true)
    try {
      const response = await fetch("/api/hr/staff-document-upload", {
        method: "POST",
        body: form,
      })
      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        toast.error("Could not upload", { description: payload.error ?? "Please try again." })
        return
      }

      toast.success("Document added")
      setTitle("")
      setExpiresAt("")
      if (fileRef.current) fileRef.current.value = ""
      onUploaded()
    } catch (error) {
      toast.error("Could not upload", {
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`doc-type-${staffId}`}>Document type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id={`doc-type-${staffId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  {option.required ? " — required" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`doc-title-${staffId}`}>Title</Label>
          <Input
            id={`doc-title-${staffId}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Defaults to the file name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`doc-file-${staffId}`}>File</Label>
          <Input
            id={`doc-file-${staffId}`}
            type="file"
            ref={fileRef}
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          />
          <p className="text-xs text-muted-foreground">A scan or a PDF, up to 10MB.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`doc-expiry-${staffId}`}>Expires (optional)</Label>
          <Input
            id={`doc-expiry-${staffId}`}
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">For a contract or a work permit.</p>
        </div>
      </div>

      <Button size="sm" onClick={() => void upload()} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        Add document
      </Button>
    </div>
  )
}
