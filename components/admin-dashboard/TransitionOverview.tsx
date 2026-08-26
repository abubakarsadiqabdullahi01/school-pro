"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ArrowRightLeft, ArrowUp, ArrowRight, LogOut } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { TransitionType } from "@prisma/client"

interface TransitionOverviewProps {
  transitions: Array<{
    id: string
    studentName: string
    fromClass: string
    fromLevel: string
    toClass: string
    toLevel: string
    fromTerm: string
    toTerm: string
    type: string
    date: Date
    notes?: string | null
    createdBy: string
  }>
  transitionTypeDistribution?: Record<string, number>
}

export function TransitionOverview({ transitions, transitionTypeDistribution }: TransitionOverviewProps) {
  const getTransitionIcon = (type: string) => {
    switch (type) {
      case TransitionType.PROMOTION:
        return <ArrowUp className="h-4 w-4" />
      case TransitionType.TRANSFER:
        return <ArrowRight className="h-4 w-4" />
      case TransitionType.WITHDRAWAL:
        return <LogOut className="h-4 w-4" />
      default:
        return <ArrowRightLeft className="h-4 w-4" />
    }
  }

  const getTransitionBadge = (type: string) => {
    let color = ""

    switch (type) {
      case TransitionType.PROMOTION:
        color = "bg-green-500/10 text-green-700 dark:text-green-400"
        break
      case TransitionType.TRANSFER:
        color = "bg-blue-500/10 text-blue-700 dark:text-blue-400"
        break
      case TransitionType.WITHDRAWAL:
        color = "bg-red-500/10 text-red-700 dark:text-red-400"
        break
      default:
        color = "bg-muted text-foreground"
    }

    return (
      <Badge className={color}>
        <span className="flex items-center gap-1">
          {getTransitionIcon(type)}
          {type.charAt(0) + type.slice(1).toLowerCase()}
        </span>
      </Badge>
    )
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightLeft className="h-4 w-4 text-purple-600" />
          Recent Student Transitions
        </CardTitle>
        <CardDescription>Latest student class transitions and movements</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          {transitions.length > 0 ? (
            <div className="space-y-3 p-4">
              {/* Transition Type Distribution */}
              {transitionTypeDistribution && (
                <div className="mb-3 flex flex-wrap gap-3 rounded-md bg-muted/50 p-3">
                  {Object.entries(transitionTypeDistribution).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-1.5">
                      {getTransitionBadge(type)}
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Transitions List */}
              {transitions.map((transition, index) => (
                <motion.div
                  key={transition.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="rounded-md p-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 rounded-md bg-purple-100 p-2">
                      {getTransitionIcon(transition.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground truncate">{transition.studentName}</p>
                        {getTransitionBadge(transition.type)}
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-2">
                        <div>
                          <span className="text-muted-foreground">From:</span>{" "}
                          <span className="font-medium">{transition.fromClass}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">To:</span>{" "}
                          <span className="font-medium">{transition.toClass}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Term:</span>{" "}
                          <span className="text-xs">{transition.fromTerm}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Term:</span>{" "}
                          <span className="text-xs">{transition.toTerm}</span>
                        </div>
                      </div>

                      {transition.notes && <p className="text-xs text-muted-foreground italic mb-1">"{transition.notes}"</p>}

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>By: {transition.createdBy}</span>
                        <span>{formatDistanceToNow(new Date(transition.date), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground">
              <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No recent transitions</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
