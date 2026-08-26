"use client"

import { memo } from "react"
import { format } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface TransitionRecord {
  id: string
  studentName: string
  admissionNo: string
  fromClass: string
  fromTerm: string
  toClass: string
  toTerm: string
  transitionType: string
  transitionDate: Date
  notes: string
  createdBy: string
}

interface TransitionHistoryTableProps {
  transitions: TransitionRecord[]
  isLoading: boolean
}

export const TransitionHistoryTable = memo(function TransitionHistoryTable({
  transitions,
  isLoading,
}: TransitionHistoryTableProps) {
  const getTransitionTypeColor = (type: string) => {
    switch (type) {
      case "PROMOTION":
        return "bg-green-500/10 text-green-700 dark:text-green-400"
      case "SAME_CLASS":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400"
      case "DEMOTION":
        return "bg-red-500/10 text-red-700 dark:text-red-400"
      case "LATERAL":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
      default:
        return "bg-muted text-foreground"
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!transitions.length) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">No transition history found.</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <Table className="min-w-full bg-card">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-bold text-foreground">Student</TableHead>
            <TableHead className="font-bold text-foreground">Admission No.</TableHead>
            <TableHead className="font-bold text-foreground">From</TableHead>
            <TableHead className="font-bold text-foreground">To</TableHead>
            <TableHead className="font-bold text-foreground">Type</TableHead>
            <TableHead className="font-bold text-foreground">Date</TableHead>
            <TableHead className="font-bold text-foreground">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transitions.map((transition) => (
            <TableRow key={transition.id} className="hover:bg-muted/50">
              <TableCell className="font-medium">{transition.studentName}</TableCell>
              <TableCell className="font-mono">{transition.admissionNo}</TableCell>
              <TableCell>
                <div className="text-sm">
                  <div className="font-medium">{transition.fromClass}</div>
                  <div className="text-muted-foreground">{transition.fromTerm}</div>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  <div className="font-medium">{transition.toClass}</div>
                  <div className="text-muted-foreground">{transition.toTerm}</div>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={getTransitionTypeColor(transition.transitionType)}>
                  {transition.transitionType.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{format(new Date(transition.transitionDate), "MMM d, yyyy")}</TableCell>
              <TableCell className="text-sm">{transition.notes || "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
})
