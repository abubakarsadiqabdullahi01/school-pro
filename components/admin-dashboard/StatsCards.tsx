"use client"

import { motion } from "framer-motion"
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

const cardVariants = {
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
      bgGradient: "from-blue-50 to-blue-100",
      iconColor: "text-blue-600",
    },
    {
      title: "Total Teachers",
      value: stats.teachersCount.toLocaleString(),
      icon: Users,
      gradient: "from-green-500 to-green-600",
      bgGradient: "from-green-50 to-green-100",
      iconColor: "text-green-600",
    },
    {
      title: "Active Classes",
      value: stats.classesCount.toLocaleString(),
      icon: BookOpen,
      gradient: "from-purple-500 to-purple-600",
      bgGradient: "from-purple-50 to-purple-100",
      iconColor: "text-purple-600",
    },
    {
      title: "Academic Sessions",
      value: stats.sessionsCount.toLocaleString(),
      icon: Calendar,
      gradient: "from-orange-500 to-orange-600",
      bgGradient: "from-orange-50 to-orange-100",
      iconColor: "text-orange-600",
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: index * 0.1 }}
          whileHover={{
            scale: 1.05,
            transition: { duration: 0.2 },
          }}
        >
          <Card
            className={`relative overflow-hidden bg-gradient-to-br ${card.bgGradient} border-0 shadow-lg hover:shadow-xl transition-shadow duration-300`}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                </div>
                <div className={`p-3 rounded-full bg-white shadow-md`}>
                  <card.icon className={`h-6 w-6 ${card.iconColor}`} />
                </div>
              </div>

              {/* Decorative gradient overlay */}
              <div
                className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${card.gradient} opacity-10 rounded-full -translate-y-16 translate-x-16`}
              />
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
