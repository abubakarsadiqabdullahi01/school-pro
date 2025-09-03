"use client"

import type React from "react"

import { motion } from "framer-motion"
import { Loader2, School } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoSpinnerProps {
  logoUrl?: string | null
  fallbackIcon?: React.ComponentType<{ className?: string }>
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  showText?: boolean
  text?: string
  variant?: "spin" | "pulse" | "bounce" | "fade"
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
}

const textSizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
}

const spinVariants = {
  spin: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Number.POSITIVE_INFINITY,
      ease: "linear",
    },
  },
}

const pulseVariants = {
  pulse: {
    scale: [1, 1.1, 1],
    opacity: [0.7, 1, 0.7],
    transition: {
      duration: 1.5,
      repeat: Number.POSITIVE_INFINITY,
      ease: "easeInOut",
    },
  },
}

const bounceVariants = {
  bounce: {
    y: [0, -10, 0],
    transition: {
      duration: 0.8,
      repeat: Number.POSITIVE_INFINITY,
      ease: "easeInOut",
    },
  },
}

const fadeVariants = {
  fade: {
    opacity: [0.3, 1, 0.3],
    transition: {
      duration: 1.2,
      repeat: Number.POSITIVE_INFINITY,
      ease: "easeInOut",
    },
  },
}

const containerVariants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
}

export function LogoSpinner({
  logoUrl,
  fallbackIcon: FallbackIcon = School,
  size = "md",
  className,
  showText = true,
  text = "Loading...",
  variant = "spin",
}: LogoSpinnerProps) {
  const getAnimationVariants = () => {
    switch (variant) {
      case "pulse":
        return pulseVariants
      case "bounce":
        return bounceVariants
      case "fade":
        return fadeVariants
      default:
        return spinVariants
    }
  }

  const getAnimationKey = () => {
    switch (variant) {
      case "pulse":
        return "pulse"
      case "bounce":
        return "bounce"
      case "fade":
        return "fade"
      default:
        return "spin"
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className={cn("flex flex-col items-center justify-center gap-3", className)}
    >
      <motion.div
        variants={getAnimationVariants()}
        animate={getAnimationKey()}
        className={cn("relative flex items-center justify-center", sizeClasses[size])}
      >
        {logoUrl ? (
            <div className={cn("relative overflow-hidden rounded-lg", sizeClasses[size])}>
            <Image
              src={logoUrl}
              alt="Loading"
              fill
              className="object-contain"
              onError={(e) => {
              console.error("Failed to load logo:", logoUrl)
              e.currentTarget.style.display = "none"
              }}
            />
            </div>
        ) : variant === "spin" ? (
          <Loader2 className={cn("text-primary", sizeClasses[size])} />
        ) : (
          <FallbackIcon className={cn("text-primary", sizeClasses[size])} />
        )}
      </motion.div>

      {showText && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className={cn("font-medium text-muted-foreground text-center", textSizeClasses[size])}
        >
          {text}
        </motion.p>
      )}

      {/* Animated dots */}
      <motion.div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 bg-primary/60 rounded-full"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Number.POSITIVE_INFINITY,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  )
}

// Preset variants for common use cases
export function SchoolLogoSpinner({ logoUrl, className, ...props }: Omit<LogoSpinnerProps, "fallbackIcon">) {
  return (
    <LogoSpinner
      logoUrl={logoUrl}
      fallbackIcon={School}
      text="Loading School Data..."
      className={className}
      {...props}
    />
  )
}

export function PageLogoSpinner({ logoUrl, className, ...props }: Omit<LogoSpinnerProps, "size" | "showText">) {
  return (
    <LogoSpinner
      logoUrl={logoUrl}
      size="lg"
      showText={true}
      text="Loading Page..."
      className={cn("min-h-[200px]", className)}
      {...props}
    />
  )
}

export function FullPageSpinner({ logoUrl, className, ...props }: Omit<LogoSpinnerProps, "size" | "showText">) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <LogoSpinner
        logoUrl={logoUrl}
        size="xl"
        showText={true}
        text="Loading Application..."
        className={className}
        {...props}
      />
    </div>
  )
}
