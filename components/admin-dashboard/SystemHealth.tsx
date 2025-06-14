"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Database,
  Users,
  Activity,
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  BookOpen,
  School,
  GraduationCap,
  ArrowRightLeft,
} from "lucide-react"

interface SystemHealthProps {
  data: {
    database: {
      status: string
      responseTime: number
      connections: number
    }
    users: {
      total: number
      active: number
      recentLogins: number
      teachers: number
      parents: number
    }
    assessments: {
      pending: number
      published: number
    }
    system: {
      errors: number
      uptime: string
      lastBackup: Date
    }
    statistics: {
      sessions: number
      terms: number
      classes: number
      subjects: number
      recentTransitions: number
    }
  }
}

export function SystemHealth({ data }: SystemHealthProps) {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "healthy":
        return "bg-green-100 text-green-800"
      case "warning":
        return "bg-yellow-100 text-yellow-800"
      case "error":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return <Activity className="h-4 w-4 text-gray-600" />
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-600" />
            System Health
          </CardTitle>
          <CardDescription>Real-time system status and performance metrics</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Database Status */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold">Database</h3>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(data.database.status)}
                  <Badge className={getStatusColor(data.database.status)}>{data.database.status}</Badge>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Response Time</span>
                  <span className="font-medium">{data.database.responseTime}ms</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Active Connections</span>
                  <span className="font-medium">{data.database.connections}</span>
                </div>
                <Progress value={(data.database.connections / 50) * 100} className="h-2" />
              </div>
            </motion.div>

            {/* User Activity */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold">User Activity</h3>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Users</span>
                  <span className="font-medium">{data.users.total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Active Students</span>
                  <span className="font-medium">{data.users.active.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Teachers</span>
                  <span className="font-medium">{data.users.teachers.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Parents</span>
                  <span className="font-medium">{data.users.parents.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Recent Logins (24h)</span>
                  <span className="font-medium">{data.users.recentLogins}</span>
                </div>
              </div>
            </motion.div>

            {/* Assessment Status */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold">Assessments</h3>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pending Review</span>
                  <span className="font-medium">{data.assessments.pending}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Published</span>
                  <span className="font-medium">{data.assessments.published}</span>
                </div>
                <Progress
                  value={
                    data.assessments.published + data.assessments.pending > 0
                      ? (data.assessments.published / (data.assessments.published + data.assessments.pending)) * 100
                      : 0
                  }
                  className="h-2"
                />
              </div>
            </motion.div>

            {/* System Status */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-600" />
                <h3 className="font-semibold">System Status</h3>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Uptime</span>
                  <span className="font-medium">{data.system.uptime}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">System Errors</span>
                  <span className="font-medium">{data.system.errors}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Last Backup</span>
                  <span className="font-medium">{new Date(data.system.lastBackup).toLocaleDateString()}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </CardContent>
      </Card>

      {/* Academic Statistics */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50">
          <CardTitle className="flex items-center gap-2">
            <School className="h-5 w-5 text-blue-600" />
            Academic Statistics
          </CardTitle>
          <CardDescription>Overview of academic entities in the system</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center p-4 bg-blue-50 rounded-lg"
            >
              <School className="h-8 w-8 text-blue-600 mb-2" />
              <span className="text-2xl font-bold">{data.statistics.sessions}</span>
              <span className="text-sm text-gray-600">Sessions</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex flex-col items-center p-4 bg-green-50 rounded-lg"
            >
              <Clock className="h-8 w-8 text-green-600 mb-2" />
              <span className="text-2xl font-bold">{data.statistics.terms}</span>
              <span className="text-sm text-gray-600">Terms</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col items-center p-4 bg-purple-50 rounded-lg"
            >
              <GraduationCap className="h-8 w-8 text-purple-600 mb-2" />
              <span className="text-2xl font-bold">{data.statistics.classes}</span>
              <span className="text-sm text-gray-600">Classes</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col items-center p-4 bg-orange-50 rounded-lg"
            >
              <BookOpen className="h-8 w-8 text-orange-600 mb-2" />
              <span className="text-2xl font-bold">{data.statistics.subjects}</span>
              <span className="text-sm text-gray-600">Subjects</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-col items-center p-4 bg-red-50 rounded-lg"
            >
              <ArrowRightLeft className="h-8 w-8 text-red-600 mb-2" />
              <span className="text-2xl font-bold">{data.statistics.recentTransitions}</span>
              <span className="text-sm text-gray-600">Recent Transitions</span>
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
