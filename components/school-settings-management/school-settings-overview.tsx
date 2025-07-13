"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { GraduationCap, BarChart3, School, ChevronRight, Users, Calendar, FileText } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"

interface SchoolSettingsData {
  school: {
    id: string
    name: string
    code: string
    address: string
    phone: string
    email: string
    website?: string
    logoUrl?: string
    admissionPrefix: string
    admissionFormat: string
    admissionSequenceStart: number
  }
  gradingSystem: {
    id: string
    name: string
    description?: string
    isDefault: boolean
    passMark: number
    levelsCount: number
  } | null
  stats: {
    totalStudents: number
    totalTeachers: number
    totalClasses: number
    currentSession?: string
    currentTerm?: string
  }
}

interface SchoolSettingsOverviewProps {
  data: SchoolSettingsData
}

export function SchoolSettingsOverview({ data }: SchoolSettingsOverviewProps) {
  const settingsCards = [
    {
      title: "Admission Settings",
      description: "Configure admission number format and sequence management",
      icon: GraduationCap,
      href: "/dashboard/admin/school-settings/admission",
      status: "Active",
      details: [
        `Format: ${data.school.admissionFormat}`,
        `Prefix: ${data.school.admissionPrefix}`,
        `Starting Number: ${data.school.admissionSequenceStart}`,
      ],
    },
    {
      title: "Grading System",
      description: "Manage grading scales and assessment criteria",
      icon: BarChart3,
      href: "/dashboard/admin/school-settings/grading-systems",
      status: data.gradingSystem ? "Configured" : "Not Set",
      details: data.gradingSystem
        ? [
            `System: ${data.gradingSystem.name}`,
            `Pass Mark: ${data.gradingSystem.passMark}%`,
            `Grade Levels: ${data.gradingSystem.levelsCount}`,
          ]
        : ["No grading system configured", "Default system will be used"],
    },
    {
      title: "School Information",
      description: "Update basic school details and contact information",
      icon: School,
      href: "/dashboard/admin/school-settings/information",
      status: "Active",
      details: [
        `Code: ${data.school.code}`,
        `Students: ${data.stats.totalStudents}`,
        `Teachers: ${data.stats.totalTeachers}`,
      ],
    },
    {
      title: "Academic Calendar",
      description: "Manage sessions, terms, and academic periods",
      icon: Calendar,
      href: "/dashboard/admin/school-sessions",
      status: data.stats.currentSession ? "Active" : "Not Set",
      details: data.stats.currentSession
        ? [
            `Session: ${data.stats.currentSession}`,
            `Term: ${data.stats.currentTerm || "Not Set"}`,
            `Classes: ${data.stats.totalClasses}`,
          ]
        : ["No active session", "Please create a session"],
    },
    {
      title: "User Management",
      description: "Manage teachers, students, and parent accounts",
      icon: Users,
      href: "/dashboard/admin/teachers",
      status: "Active",
      details: [
        `Teachers: ${data.stats.totalTeachers}`,
        `Students: ${data.stats.totalStudents}`,
        `Classes: ${data.stats.totalClasses}`,
      ],
    },
    // {
    //   title: "Reports & Analytics",
    //   description: "Generate reports and view school analytics",
    //   icon: FileText,
    //   href: "/dashboard/admin/reports",
    //   status: "Available",
    //   details: ["Academic performance reports", "Attendance analytics", "Financial summaries"],
    // },
  ]

  return (
    <div className="space-y-6">
      {/* School Overview Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <School className="h-5 w-5" />
                  {data.school.name}
                </CardTitle>
                <CardDescription>
                  School Code: {data.school.code} • {data.school.address}
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{data.stats.totalStudents}</div>
                <div className="text-sm text-blue-600">Total Students</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{data.stats.totalTeachers}</div>
                <div className="text-sm text-green-600">Total Teachers</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{data.stats.totalClasses}</div>
                <div className="text-sm text-purple-600">Total Classes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Settings Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {settingsCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <card.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{card.title}</CardTitle>
                      <Badge
                        variant={card.status === "Active" || card.status === "Configured" ? "default" : "secondary"}
                        className="mt-1"
                      >
                        {card.status}
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <CardDescription className="mb-4">{card.description}</CardDescription>
                <div className="space-y-2">
                  {card.details.map((detail, idx) => (
                    <div key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full" />
                      {detail}
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Button asChild variant="outline" className="w-full">
                    <Link href={card.href}>
                      Configure
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
