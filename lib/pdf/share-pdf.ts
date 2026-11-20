import { toast } from "sonner"

// Opens the device share sheet (WhatsApp, Email, Telegram, Drive, ...) with the PDF attached.
// Browsers that can't share files get the PDF downloaded instead, so it can still be sent from the device.
export async function sharePdf(blob: Blob, fileName: string, title = fileName): Promise<void> {
  const file = new File([blob], fileName, { type: "application/pdf" })

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return
    } catch (error) {
      if ((error as Error).name === "AbortError") return // user closed the share sheet
      // NotAllowedError etc. (e.g. PDF took too long to build): fall through to download
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.info("Sharing isn't available in this browser", {
    description: "The PDF was downloaded so you can send it on any platform.",
  })
}
