"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, Calendar, BarChart3, Settings, FileText, ArrowRightLeft, BookOpen } from "lucide-react"
import Link from "next/link"

export function QuickActions() {
  const actions = [
    {
      title: "Score Entry",
      description: "Enter and manage student scores",
      icon: BookOpen,
      href: "/dashboard/admin/compiler/subject-results/entry",
      color: "from-blue-500 to-blue-600",
      bgColor: "bg-blue-50 hover:bg-blue-100",
    },
    {
      title: "Student Transitions",
      description: "Manage student class transitions",
      icon: ArrowRightLeft,
      href: "/dashboard/admin/compiler/student-transitions",
      color: "from-green-500 to-green-600",
      bgColor: "bg-green-50 hover:bg-green-100",
    },
    {
      title: "School Calendar",
      description: "View academic calendar and sessions",
      icon: Calendar,
      href: "/dashboard/admin/calendar",
      color: "from-purple-500 to-purple-600",
      bgColor: "bg-purple-50 hover:bg-purple-100",
    },
    {
      title: "Class Results",
      description: "View and analyze class performance",
      icon: BarChart3,
      href: "/dashboard/admin/compiler/class-results",
      color: "from-orange-500 to-orange-600",
      bgColor: "bg-orange-50 hover:bg-orange-100",
    },
    {
      title: "Student Reports",
      description: "Generate individual student reports",
      icon: FileText,
      href: "/dashboard/admin/compiler/student-reports",
      color: "from-cyan-500 to-cyan-600",
      bgColor: "bg-cyan-50 hover:bg-cyan-100",
    },
    {
      title: "Manage Users",
      description: "Add and manage school users",
      icon: Users,
      href: "/dashboard/admin/users",
      color: "from-pink-500 to-pink-600",
      bgColor: "bg-pink-50 hover:bg-pink-100",
    },
  ]

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50">
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-gray-600" />
          Quick Actions
        </CardTitle>
        <CardDescription>Frequently used administrative functions</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {actions.map((action, index) => (
            <motion.div
              key={action.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link href={action.href}>
                <Button
                  variant="ghost"
                  className={`w-full h-auto p-4 ${action.bgColor} border border-gray-200 transition-all duration-300 hover:shadow-md`}
                >
                  <div className="flex flex-col items-center text-center space-y-2">
                    <div className={`p-3 rounded-full bg-gradient-to-br ${action.color} text-white shadow-lg`}>
                      <action.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{action.title}</h3>
                      <p className="text-xs text-gray-600 mt-1">{action.description}</p>
                    </div>
                  </div>
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
