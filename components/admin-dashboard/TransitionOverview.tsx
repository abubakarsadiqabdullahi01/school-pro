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
        color = "bg-green-100 text-green-800"
        break
      case TransitionType.TRANSFER:
        color = "bg-blue-100 text-blue-800"
        break
      case TransitionType.WITHDRAWAL:
        color = "bg-red-100 text-red-800"
        break
      default:
        color = "bg-gray-100 text-gray-800"
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
    <Card className="border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-purple-600" />
          Recent Student Transitions
        </CardTitle>
        <CardDescription>Latest student class transitions and movements</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {transitions.length > 0 ? (
            <div className="p-6 space-y-4">
              {/* Transition Type Distribution */}
              {transitionTypeDistribution && (
                <div className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
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
                  className="p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 p-2 bg-purple-100 rounded-full">
                      {getTransitionIcon(transition.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{transition.studentName}</p>
                        {getTransitionBadge(transition.type)}
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-2">
                        <div>
                          <span className="text-gray-500">From:</span>{" "}
                          <span className="font-medium">{transition.fromClass}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">To:</span>{" "}
                          <span className="font-medium">{transition.toClass}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Term:</span>{" "}
                          <span className="text-xs">{transition.fromTerm}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Term:</span>{" "}
                          <span className="text-xs">{transition.toTerm}</span>
                        </div>
                      </div>

                      {transition.notes && <p className="text-xs text-gray-600 italic mb-1">"{transition.notes}"</p>}

                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>By: {transition.createdBy}</span>
                        <span>{formatDistanceToNow(new Date(transition.date), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recent transitions</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
