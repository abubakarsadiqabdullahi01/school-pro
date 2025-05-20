"use client"

import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Reset progress when navigation starts
    setIsNavigating(true)
    setProgress(0)

    // Simulate progress
    const timer1 = setTimeout(() => setProgress(30), 100)
    const timer2 = setTimeout(() => setProgress(60), 300)
    const timer3 = setTimeout(() => setProgress(80), 600)
    const timer4 = setTimeout(() => {
      setProgress(100)
      const finalTimer = setTimeout(() => setIsNavigating(false), 200)
      return () => clearTimeout(finalTimer)
    }, 1000)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearTimeout(timer4)
    }
  }, [pathname, searchParams])

  if (!isNavigating) return null

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-50 h-1 bg-primary"
      style={{ width: `${progress}%` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    />
  )
}
