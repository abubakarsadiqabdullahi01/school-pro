"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { runGatewayReconciliation } from "@/app/actions/gateway-operations-slice7"
import { Button } from "@/components/ui/button"

export function RunReconciliationButton() {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState("")
  return <div className="flex flex-col items-end gap-1"><Button disabled={pending} onClick={() => start(async () => {
    const result = await runGatewayReconciliation(); setMessage(result.success ? `${result.data.settlements} settlements checked; ${result.data.issues} exceptions found.` : result.error)
    if (result.success) router.refresh()
  })}><RefreshCw className={`mr-2 h-4 w-4 ${pending ? "animate-spin" : ""}`} />{pending ? "Reconciling…" : "Run reconciliation"}</Button>{message && <p className="max-w-sm text-right text-xs text-muted-foreground" role="status">{message}</p>}</div>
}
