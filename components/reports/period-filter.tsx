import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface PeriodFilterProps {
  basePath: string
  terms?: Array<{ id: string; name: string; isCurrent: boolean }>
  sessions?: Array<{ id: string; name: string; isCurrent: boolean }>
  selectedTermId?: string
  selectedSessionId?: string
}

export function PeriodFilter({
  basePath,
  terms = [],
  sessions = [],
  selectedTermId,
  selectedSessionId,
}: PeriodFilterProps) {
  return (
    <Card className="print:hidden">
      <CardContent className="flex flex-wrap items-center gap-2 p-4">
        <Button variant={!selectedTermId && !selectedSessionId ? "default" : "outline"} size="sm" asChild>
          <Link href={basePath}>All</Link>
        </Button>
        {sessions.map((session) => (
          <Button key={session.id} variant={selectedSessionId === session.id ? "default" : "outline"} size="sm" asChild>
            <Link href={`${basePath}?sessionId=${session.id}`}>{session.name}</Link>
          </Button>
        ))}
        {terms.map((term) => (
          <Button key={term.id} variant={selectedTermId === term.id ? "default" : "outline"} size="sm" asChild>
            <Link href={`${basePath}?termId=${term.id}`}>{term.name}</Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
