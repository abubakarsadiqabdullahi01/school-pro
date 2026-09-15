"use client"

import { createElement, isValidElement, type ReactNode } from "react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  title: string
  value: string
  /**
   * A Lucide component from a client component, or a rendered element.
   *
   * A server component cannot pass the component itself — React refuses to send
   * a function across the boundary, and the student and parent dashboards threw
   * "Functions cannot be passed directly to Client Components" on every load
   * because of it. Those pages pass `<BookOpen />` instead; elements serialize.
   */
  icon: LucideIcon | ReactNode
  description?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
  delay?: number
}

export function StatsCard({ title, value, icon, description, trend, className, delay = 0 }: StatsCardProps) {
  const iconNode = isValidElement(icon)
    ? icon
    : createElement(icon as LucideIcon, { className: "h-4 w-4 text-muted-foreground" })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: delay * 0.1 }}
    >
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {iconNode}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          {trend && (
            <div className="mt-1 flex items-center text-xs">
              <span className={cn("mr-1", trend.isPositive ? "text-emerald-500" : "text-rose-500")}>
                {trend.isPositive ? "↑" : "↓"} {trend.value}%
              </span>
              <span className="text-muted-foreground">from last month</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

