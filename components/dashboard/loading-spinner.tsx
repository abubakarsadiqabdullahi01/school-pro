"use client"

import { Loader2 } from "lucide-react"
import { motion } from "framer-motion"

interface LoadingSpinnerProps {
  message?: string
}

export function LoadingSpinner({ message = "Loading..." }: LoadingSpinnerProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-[70vh] w-full flex-col items-center justify-center"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-lg text-muted-foreground">{message}</p>
    </motion.div>
  )
}

