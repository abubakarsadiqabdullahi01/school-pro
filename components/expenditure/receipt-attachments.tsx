"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { FileText, Paperclip, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { addExpenseAttachment, removeExpenseAttachment } from "@/app/actions/expenditure"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Attachment = {
  id: string
  url: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
}

/** Bytes as something a person reads, since a receipt is usually a phone photo. */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Receipts backing an expense.
 *
 * The file goes straight from the browser to object storage using a presigned URL from
 * `/api/expenditure/receipt-upload`, so it never passes through the server. Only the
 * resulting URL is recorded against the expense.
 *
 * Receipts can be added at any point except on a cancelled or rejected expense — the paper
 * often turns up after the payment. Removing one is an admin's call.
 */
export function ReceiptAttachments({
  expenseId,
  attachments,
  canUpload,
  canRemove,
}: {
  expenseId: string
  attachments: Attachment[]
  canUpload: boolean
  canRemove: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setIsUploading(true)
    try {
      const presign = await fetch("/api/expenditure/receipt-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
      })
      const presigned = await presign.json()
      if (!presign.ok || !presigned.success) {
        throw new Error(presigned.error ?? "Could not start the upload")
      }

      const put = await fetch(presigned.presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!put.ok) throw new Error("The file could not be uploaded to storage")

      const result = await addExpenseAttachment({
        expenseId,
        url: presigned.publicUrl,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })
      if (!result.success) throw new Error(result.error)

      toast.success("Receipt attached")
      router.refresh()
    } catch (error) {
      toast.error("Could not attach the receipt", {
        description: error instanceof Error ? error.message : "Try again.",
      })
    } finally {
      setIsUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  function remove(attachmentId: string) {
    startTransition(async () => {
      const result = await removeExpenseAttachment({ attachmentId })
      if (!result.success) {
        toast.error("Could not remove the receipt", { description: result.error })
        return
      }
      toast.success("Receipt removed")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipts</CardTitle>
        <CardDescription>Images or PDFs, up to 10MB each. The paper backing for this voucher.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {attachments.length > 0 ? (
          <ul className="space-y-2">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-2 hover:underline"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{attachment.fileName}</span>
                  <span className="shrink-0 text-sm text-muted-foreground">{readableSize(attachment.sizeBytes)}</span>
                </a>
                {canRemove && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => remove(attachment.id)}
                    aria-label={`Remove ${attachment.fileName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No receipt attached yet.</p>
        )}

        {canUpload && (
          <div className="print:hidden">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip className="mr-2 h-4 w-4" />
              {isUploading ? "Uploading…" : "Attach receipt"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
