"use client"

import { motion, type Variants } from "framer-motion"
import { GraduationCap, Users, BookOpen, Calendar } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface StatsCardsProps {
  stats: {
    studentsCount: number
    teachersCount: number
    classesCount: number
    sessionsCount: number
  }
}

const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: "Total Students",
      value: stats.studentsCount.toLocaleString(),
      icon: GraduationCap,
      gradient: "from-blue-500 to-blue-600",
      bgGradient: "from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Total Teachers",
      value: stats.teachersCount.toLocaleString(),
      icon: Users,
      gradient: "from-green-500 to-green-600",
      bgGradient: "from-green-50 to-green-100 dark:from-green-950 dark:to-green-900",
      iconColor: "text-green-600 dark:text-green-400",
    },
    {
      title: "Active Classes",
      value: stats.classesCount.toLocaleString(),
      icon: BookOpen,
      gradient: "from-purple-500 to-purple-600",
      bgGradient: "from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
    {
      title: "Academic Sessions",
      value: stats.sessionsCount.toLocaleString(),
      icon: Calendar,
      gradient: "from-orange-500 to-orange-600",
      bgGradient: "from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: index * 0.1 }}
          whileHover={{
            scale: 1.01,
            transition: { duration: 0.2 },
          }}
        >
          <Card
            className={`relative overflow-hidden bg-gradient-to-br ${card.bgGradient} border shadow-sm transition-shadow duration-300`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{card.value}</p>
                </div>
                <div className="rounded-md bg-card p-2 shadow-sm">
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
