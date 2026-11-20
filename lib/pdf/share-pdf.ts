import { toast } from "sonner"

function download(blob: Blob, fileName: string, reason: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.info(reason, { description: "The PDF was downloaded so you can send it on any platform." })
}

// Opens the device share sheet (WhatsApp, Email, Telegram, Drive, ...) with the PDF attached.
// Browsers that can't share files get the PDF downloaded instead, so it can still be sent from the device.
export async function sharePdf(blob: Blob, fileName: string, title = fileName): Promise<void> {
  const data: ShareData = { files: [new File([blob], fileName, { type: "application/pdf" })], title }

  if (typeof navigator === "undefined" || !navigator.canShare?.(data)) {
    download(blob, fileName, "Sharing isn't available in this browser")
    return
  }

  const share = async () => {
    try {
      await navigator.share(data)
    } catch (error) {
      if ((error as Error).name !== "AbortError") download(blob, fileName, "Couldn't open the share menu")
    }
  }

  try {
    await navigator.share(data)
  } catch (error) {
    const name = (error as Error).name
    if (name === "AbortError") return // user closed the share sheet
    if (name === "NotAllowedError") {
      // The PDF took longer to build than the browser keeps the click "fresh"; one more tap re-opens the sheet.
      toast.success("PDF ready to share", { duration: 30_000, action: { label: "Share", onClick: () => void share() } })
      return
    }
    download(blob, fileName, "Couldn't open the share menu")
  }
}
