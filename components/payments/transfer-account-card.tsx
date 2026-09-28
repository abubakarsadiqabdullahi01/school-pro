import { Landmark } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** A child's dedicated account number, as a parent sees it on the fees page. */
export function TransferAccountCard({ account }: { account: { accountNumber: string; accountName: string; bankName: string } }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Landmark className="h-5 w-5 text-primary" aria-hidden />Pay by bank transfer</CardTitle>
        <CardDescription>
          This account belongs to this child only. Transfer any amount from any bank app, at any time; it is applied to the
          oldest unpaid fees and a receipt is emailed to you once the bank confirms it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Bank</dt><dd className="font-medium">{account.bankName}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Account number</dt><dd className="select-all font-mono text-xl font-semibold tracking-wider">{account.accountNumber}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Account name</dt><dd className="font-medium">{account.accountName}</dd></div>
        </dl>
      </CardContent>
    </Card>
  )
}
