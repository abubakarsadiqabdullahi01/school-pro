"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Activity, Clock, User } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface RecentActivitiesProps {
  activities: Array<{
    id: string
    type: string
    user: {
      name: string
      role: string
    }
    action: string
    target: string
    date: Date
    score?: number
  }>
}

export function RecentActivities({ activities }: RecentActivitiesProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case "assessment":
        return <Activity className="h-4 w-4" />
      default:
        return <User className="h-4 w-4" />
    }
  }

  const getScoreBadge = (score?: number) => {
    if (score === undefined) return null

    const variant: "default" | "secondary" | "destructive" | "outline" = "default"
    let color = "bg-muted text-foreground"

    if (score >= 80) color = "bg-green-500/10 text-green-700 dark:text-green-400"
    else if (score >= 70) color = "bg-blue-500/10 text-blue-700 dark:text-blue-400"
    else if (score >= 60) color = "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
    else if (score >= 50) color = "bg-orange-500/10 text-orange-700 dark:text-orange-400"
    else color = "bg-red-500/10 text-red-700 dark:text-red-400"

    return <Badge className={`${color} text-xs`}>{score.toFixed(0)}%</Badge>
  }

  return (
    <Card className="h-fit border shadow-sm">
      <CardHeader className="bg-gradient-to-r from-cyan-50 to-blue-50 p-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-cyan-600" />
          Recent Activities
        </CardTitle>
        <CardDescription>Latest system activities and updates</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          {activities.length > 0 ? (
            <div className="space-y-3 p-4">
              {activities.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="flex items-start gap-3 rounded-md p-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex-shrink-0 rounded-md bg-blue-100 p-2">{getActivityIcon(activity.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-foreground truncate">{activity.user.name}</p>
                      <Badge variant="outline" className="text-xs">
                        {activity.user.role}
                      </Badge>
                      {getScoreBadge(activity.score)}
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      {activity.action} <span className="font-medium">{activity.target}</span>
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground">
              <Activity className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No recent activities</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
