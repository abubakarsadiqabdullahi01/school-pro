"use client"

import { useState, type ReactNode } from "react"
import { CheckCircle2, CreditCard, Receipt, Wallet } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * One screen of fee information, split so a family reads a section rather than scrolls a page.
 *
 * The sections are rendered on the server and handed in whole, because none of them needs to
 * be a client component — only the switching between them does. Overview carries the figures
 * and then says what to do next, so the tabs are a route through the page rather than four
 * things to hunt through.
 */
export function PortalFeesTabs({
  summary,
  fees,
  payOnline,
  receipts,
  outstanding,
  unpaidCount,
  receiptCount,
  canPayOnline,
}: {
  /** The billed / paid / outstanding tiles. */
  summary: ReactNode
  fees: ReactNode
  /** The checkout, or nothing when this school does not collect online. */
  payOnline: ReactNode
  receipts: ReactNode
  /** Already formatted, so this component never does money arithmetic. */
  outstanding: string
  unpaidCount: number
  receiptCount: number
  canPayOnline: boolean
}) {
  const [tab, setTab] = useState("overview")
  const settled = unpaidCount === 0

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-6">
      <TabsList className="flex-wrap">
        <TabsTrigger value="overview">
          <Wallet className="mr-1.5 h-4 w-4" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="fees">
          Fees
          {unpaidCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">{unpaidCount}</Badge>
          )}
        </TabsTrigger>
        {canPayOnline && (
          <TabsTrigger value="pay">
            <CreditCard className="mr-1.5 h-4 w-4" />
            Pay online
          </TabsTrigger>
        )}
        <TabsTrigger value="receipts">
          Receipts
          {receiptCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">{receiptCount}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        {summary}

        {/* Figures alone leave the reader to work out what to do with them. */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            {settled ? (
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
                Everything billed so far has been paid.
              </p>
            ) : (
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{outstanding}</span> still to pay across{" "}
                {unpaidCount} {unpaidCount === 1 ? "fee" : "fees"}.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {!settled && canPayOnline && (
                <Button type="button" size="sm" onClick={() => setTab("pay")}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pay online
                </Button>
              )}
              {!settled && (
                <Button type="button" size="sm" variant="outline" onClick={() => setTab("fees")}>
                  See what is owed
                </Button>
              )}
              {receiptCount > 0 && (
                <Button type="button" size="sm" variant="outline" onClick={() => setTab("receipts")}>
                  <Receipt className="mr-2 h-4 w-4" />
                  {receiptCount === 1 ? "1 receipt" : `${receiptCount} receipts`}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="fees">{fees}</TabsContent>

      {canPayOnline && <TabsContent value="pay">{payOnline}</TabsContent>}

      <TabsContent value="receipts">{receipts}</TabsContent>
    </Tabs>
  )
}
