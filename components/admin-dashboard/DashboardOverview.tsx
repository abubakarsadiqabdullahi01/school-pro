"use client"

import { motion } from "framer-motion"
import { StatsCards } from "./StatsCards"
import { AcademicProgress } from "./AcademicProgress"
import { SessionOverview } from "./SessionOverview"
import { TransitionOverview } from "./TransitionOverview"

interface DashboardOverviewProps {
  data: any
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
}

export function DashboardOverview({ data }: DashboardOverviewProps) {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">
      {/* Stats Cards */}
      <motion.div variants={itemVariants}>
        <StatsCards stats={data.stats} />
      </motion.div>

      {/* Session Overview */}
      {data.currentSession && (
        <motion.div variants={itemVariants}>
          <SessionOverview session={data.currentSession} term={data.currentTerm} />
        </motion.div>
      )}

      {/* Main Content Grid */}
      <div className="space-y-5">
        <motion.div variants={itemVariants}>
          <AcademicProgress
            gradeDistribution={data.gradeDistribution}
            classStats={data.classStats}
            levelDistribution={data.levelDistribution}
            gradingSystem={data.gradingSystem}
            recentActivities={data.recentActivities}
          />
        </motion.div>

        {data.recentTransitions && data.recentTransitions.length > 0 && (
          <motion.div variants={itemVariants}>
            <TransitionOverview
              transitions={data.recentTransitions}
              transitionTypeDistribution={data.transitionTypeDistribution}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
