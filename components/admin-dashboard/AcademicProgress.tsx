"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Users, BookOpen, School } from "lucide-react"
import { ClassLevel } from "@prisma/client"
import { RecentActivities } from "./RecentActivities"

interface AcademicProgressProps {
  gradeDistribution: Record<string, number>
  classStats: Array<{
    id: string
    name: string
    level: string
    studentCount: number
    totalCapacity: number
  }>
  levelDistribution?: Record<string, number>
  gradingSystem?: {
    name: string
    passMark: number
    levels: Array<{
      grade: string
      minScore: number
      maxScore: number
      remark: string
    }>
  } | null
  recentActivities?: Array<{
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

export function AcademicProgress({
  gradeDistribution,
  classStats,
  levelDistribution,
  gradingSystem,
  recentActivities,
}: AcademicProgressProps) {
  const totalGrades = Object.values(gradeDistribution).reduce((sum, count) => sum + count, 0)

  // Default grade colors if no grading system
  const defaultGradeColors: Record<string, string> = {
    A: "bg-green-500",
    B: "bg-blue-500",
    C: "bg-yellow-500",
    D: "bg-orange-500",
    F: "bg-red-500",
  }

  const defaultGradeBgColors: Record<string, string> = {
    A: "bg-green-500/10 text-green-700 dark:text-green-400",
    B: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    C: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    D: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    F: "bg-red-500/10 text-red-700 dark:text-red-400",
  }

  // Generate colors for all grades in the grading system
  const getGradeBgColor = (grade: string) => {
    if (defaultGradeBgColors[grade]) return defaultGradeBgColors[grade]

    // Generate background colors based on grade position
    if (gradingSystem) {
      const index = gradingSystem.levels.findIndex((level) => level.grade === grade)
      const total = gradingSystem.levels.length

      if (index === 0) return "bg-green-500/10 text-green-700 dark:text-green-400" // Top grade
      if (index === total - 1) return "bg-red-500/10 text-red-700 dark:text-red-400" // Bottom grade

      // Generate colors in between
      const position = index / (total - 1)
      if (position < 0.25) return "bg-green-500/10 text-green-700 dark:text-green-400"
      if (position < 0.5) return "bg-blue-500/10 text-blue-700 dark:text-blue-400"
      if (position < 0.75) return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400"
    }

    return "bg-muted text-foreground" // Default
  }

  // Get class level display name
  const getLevelName = (level: string) => {
    switch (level) {
      case ClassLevel.PRIMARY:
        return "Primary"
      case ClassLevel.JSS:
        return "Junior Secondary"
      case ClassLevel.SSS:
        return "Senior Secondary"
      default:
        return level
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {/* Grade Distribution */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            Grade Distribution
          </CardTitle>
          <CardDescription>
            {gradingSystem
              ? `Based on ${gradingSystem.name} (Pass Mark: ${gradingSystem.passMark}%)`
              : "Recent assessment performance across all subjects"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {totalGrades > 0 ? (
            <div className="space-y-3">
              {Object.entries(gradeDistribution)
                .sort((a, b) => {
                  // Sort by grade position in grading system if available
                  if (gradingSystem) {
                    const aIndex = gradingSystem.levels.findIndex((level) => level.grade === a[0])
                    const bIndex = gradingSystem.levels.findIndex((level) => level.grade === b[0])
                    return aIndex - bIndex
                  }
                  // Default sort for A, B, C, D, F
                  return a[0].localeCompare(b[0])
                })
                .map(([grade, count]) => {
                  if (count === 0) return null // Skip grades with zero count

                  const percentage = (count / totalGrades) * 100
                  const remark = gradingSystem?.levels.find((level) => level.grade === grade)?.remark

                  return (
                    <motion.div
                      key={grade}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5 }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-10 text-center">
                        <Badge className={getGradeBgColor(grade)}>{grade}</Badge>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>{remark ? `${grade} - ${remark}` : `Grade ${grade}`}</span>
                          <span className="font-medium">
                            {count} students ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    </motion.div>
                  )
                })}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No assessment data available yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Class Level Distribution */}
      {levelDistribution && (
        <Card className="border shadow-sm">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <School className="h-4 w-4 text-blue-600" />
              Class Section Distribution
            </CardTitle>
            <CardDescription>Distribution of classes by educational section</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {Object.entries(levelDistribution).map(([level, count]) => {
                if (count === 0) return null

                const totalClasses = Object.values(levelDistribution).reduce((sum, c) => sum + c, 0)
                const percentage = (count / totalClasses) * 100

                let color = "bg-muted-foreground"
                let bgColor = "bg-muted text-foreground"

                switch (level) {
                  case ClassLevel.PRIMARY:
                    color = "bg-green-500"
                    bgColor = "bg-green-500/10 text-green-700 dark:text-green-400"
                    break
                  case ClassLevel.JSS:
                    color = "bg-blue-500"
                    bgColor = "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                    break
                  case ClassLevel.SSS:
                    color = "bg-purple-500"
                    bgColor = "bg-purple-500/10 text-purple-700 dark:text-purple-400"
                    break
                }

                return (
                  <motion.div
                    key={level}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-24 text-center">
                      <Badge className={bgColor}>{getLevelName(level)}</Badge>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span>{getLevelName(level)}</span>
                        <span className="font-medium">
                          {count} classes ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Class Statistics */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-green-50 to-teal-50 p-4">
          <CardTitle className="flex items-center gap-2 text-base">
        <Users className="h-4 w-4 text-green-600" />
        Class Enrollment
          </CardTitle>
          <CardDescription>Current student enrollment by class</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {classStats.length > 0 ? (
        <div className="space-y-3">
          {/* Show only top N classes, with a details expander for the rest */}
          {classStats.slice(0, 5).map((cls, index) => {
            const enrollmentPercentage = (cls.studentCount / cls.totalCapacity) * 100

            let progressColor = "bg-green-500"
            if (enrollmentPercentage > 90) progressColor = "bg-red-500"
            else if (enrollmentPercentage > 75) progressColor = "bg-orange-500"
            else if (enrollmentPercentage > 50) progressColor = "bg-blue-500"

            return (
          <motion.div
            key={cls.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.08 }}
            className="flex items-center gap-3 rounded-md bg-muted/50 p-3 transition-colors hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-foreground">{cls.name}</h4>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {getLevelName(cls.level)}
              </Badge>
              <span className="text-sm font-medium">
                {cls.studentCount}/{cls.totalCapacity}
              </span>
            </div>
              </div>
              <Progress value={enrollmentPercentage} className="h-2" />
            </div>
          </motion.div>
            )
          })}

          {classStats.length > 5 && (
            <details className="group">
          <summary className="cursor-pointer text-sm text-blue-600 hover:underline mt-2">
            Show all {classStats.length} classes
          </summary>
          <div className="mt-3 space-y-3">
            {classStats.slice(5).map((cls, idx) => {
              const enrollmentPercentage = (cls.studentCount / cls.totalCapacity) * 100

              let progressColor = "bg-green-500"
              if (enrollmentPercentage > 90) progressColor = "bg-red-500"
              else if (enrollmentPercentage > 75) progressColor = "bg-orange-500"
              else if (enrollmentPercentage > 50) progressColor = "bg-blue-500"

              return (
            <motion.div
              key={cls.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.06 }}
              className="flex items-center gap-3 rounded-md bg-muted/50 p-3 transition-colors hover:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-foreground">{cls.name}</h4>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {getLevelName(cls.level)}
                </Badge>
                <span className="text-sm font-medium">
                  {cls.studentCount}/{cls.totalCapacity}
                </span>
              </div>
                </div>
                <Progress value={enrollmentPercentage} className="h-2" />
              </div>
            </motion.div>
              )
            })}
          </div>
            </details>
          )}
        </div>
          ) : (
        <div className="text-center py-6 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No class data available</p>
        </div>
          )}
        </CardContent>
      </Card>

      {recentActivities && (
        <RecentActivities activities={recentActivities} />
      )}
    </div>
  )
}
