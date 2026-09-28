import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { getMyChildren } from "@/app/actions/parent-portal"
import { PageTransition } from "@/components/dashboard/page-transition"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoGuide } from "@/components/ui/info-guide"

export default async function ParentChildrenPage() {
  const result = await getMyChildren()

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight">My Children</h1>
            <InfoGuide guideKey="parent.children" />
          </div>
          <p className="text-muted-foreground">
            Open a child to see their class, subjects, released results, fees and receipts.
          </p>
        </div>

        {!result.success ? (
          <p className="text-destructive">{result.error}</p>
        ) : result.data.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No children linked</CardTitle>
              <CardDescription>
                Ask the school office to link your account to your child&apos;s record.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.data.map((child) => (
              <Card key={child.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{child.name}</CardTitle>
                  <CardDescription className="tabular-nums">
                    {child.admissionNo}
                    {child.className ? ` · ${child.className}` : ""}
                    {child.termName ? ` · ${child.termName}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</p>
                    <p className="font-medium tabular-nums">{child.balance}</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/parent/children/${child.id}`}>
                      Open
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
