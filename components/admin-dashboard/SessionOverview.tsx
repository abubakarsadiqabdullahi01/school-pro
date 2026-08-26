"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, BookOpen } from "lucide-react"
import { format, differenceInWeeks } from "date-fns"

interface SessionOverviewProps {
  session: {
    id: string
    name: string
    startDate: Date
    endDate: Date
    progress: number
    terms: Array<{
      id: string
      name: string
      startDate: Date
      endDate: Date
      isCurrent: boolean
    }>
  }
  term: {
    id: string
    name: string
    startDate: Date
    endDate: Date
    progress: number
  } | null
}

export function SessionOverview({ session, term }: SessionOverviewProps) {
  const sessionWeeks = differenceInWeeks(new Date(session.endDate), new Date(session.startDate))
  const termWeeks = term ? differenceInWeeks(new Date(term.endDate), new Date(term.startDate)) : 0

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Current Session */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
        <Card className="h-full border shadow-sm bg-gradient-to-br from-indigo-50 to-blue-50">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-indigo-600" />
              Current Session
            </CardTitle>
            <CardDescription>Academic session progress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{session.name}</h3>
                <Badge className="bg-indigo-100 text-indigo-800">{sessionWeeks} weeks</Badge>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {format(new Date(session.startDate), "MMM dd, yyyy")} -{" "}
                  {format(new Date(session.endDate), "MMM dd, yyyy")}
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Progress</span>
                <span className="font-medium">{session.progress.toFixed(1)}%</span>
              </div>
              <Progress value={session.progress} className="h-2" />
            </div>

            <div className="pt-2">
              <p className="text-sm text-muted-foreground mb-2">Terms in this session:</p>
              <div className="space-y-1">
                {session.terms.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className={t.isCurrent ? "font-medium text-indigo-600" : "text-muted-foreground"}>{t.name}</span>
                    {t.isCurrent && (
                      <Badge variant="outline" className="text-xs">
                        Current
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Current Term */}
      {term && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="h-full border shadow-sm bg-gradient-to-br from-green-50 to-emerald-50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-green-600" />
                Current Term
              </CardTitle>
              <CardDescription>Active term progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-2">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{term.name}</h3>
                  <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">{termWeeks} weeks</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {format(new Date(term.startDate), "MMM dd, yyyy")} -{" "}
                    {format(new Date(term.endDate), "MMM dd, yyyy")}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress</span>
                  <span className="font-medium">{term.progress.toFixed(1)}%</span>
                </div>
                <Progress value={term.progress} className="h-2" />
              </div>

              <div className="pt-2 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">Active</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-medium">{(100 - term.progress).toFixed(1)}% left</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
