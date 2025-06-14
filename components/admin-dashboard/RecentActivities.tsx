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
    let color = "bg-gray-100 text-gray-800"

    if (score >= 80) color = "bg-green-100 text-green-800"
    else if (score >= 70) color = "bg-blue-100 text-blue-800"
    else if (score >= 60) color = "bg-yellow-100 text-yellow-800"
    else if (score >= 50) color = "bg-orange-100 text-orange-800"
    else color = "bg-red-100 text-red-800"

    return <Badge className={`${color} text-xs`}>{score.toFixed(0)}%</Badge>
  }

  return (
    <Card className="border-0 shadow-lg h-fit">
      <CardHeader className="bg-gradient-to-r from-cyan-50 to-blue-50">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-cyan-600" />
          Recent Activities
        </CardTitle>
        <CardDescription>Latest system activities and updates</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          {activities.length > 0 ? (
            <div className="p-6 space-y-4">
              {activities.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-shrink-0 p-2 bg-blue-100 rounded-full">{getActivityIcon(activity.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{activity.user.name}</p>
                      <Badge variant="outline" className="text-xs">
                        {activity.user.role}
                      </Badge>
                      {getScoreBadge(activity.score)}
                    </div>
                    <p className="text-sm text-gray-600 mb-1">
                      {activity.action} <span className="font-medium">{activity.target}</span>
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recent activities</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
