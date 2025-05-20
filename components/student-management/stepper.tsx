"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface StepperProps {
  currentStep: number
  className?: string
  children: React.ReactNode
}

export function Stepper({ currentStep, className, children }: StepperProps) {
  // Filter out only Step components
  const steps = React.Children.toArray(children).filter((child) => React.isValidElement(child) && child.type === Step)

  return (
    <div className={cn("flex items-center justify-between", className)}>
      {steps.map((step, index) => {
        const stepElement = step as React.ReactElement
        const isActive = currentStep === stepElement.props.step
        const isCompleted = currentStep > stepElement.props.step

        return (
          <React.Fragment key={stepElement.props.step}>
            {index > 0 && <div className={cn("flex-1 h-1 mx-2", isCompleted ? "bg-primary" : "bg-muted")} />}
            {React.cloneElement(stepElement, { isActive, isCompleted })}
          </React.Fragment>
        )
      })}
    </div>
  )
}

interface StepProps {
  step: number
  isActive?: boolean
  isCompleted?: boolean
  children: React.ReactNode
}

export function Step({ step, isActive, isCompleted, children }: StepProps) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium border-2",
          isActive && "border-primary bg-primary text-primary-foreground",
          isCompleted && "border-primary bg-primary text-primary-foreground",
          !isActive && !isCompleted && "border-muted bg-background text-muted-foreground",
        )}
      >
        {step}
      </div>
      <div className={cn("mt-2 text-center", isActive && "text-foreground", !isActive && "text-muted-foreground")}>
        {children}
      </div>
    </div>
  )
}

export function StepTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium">{children}</div>
}

export function StepDescription({ children }: { children: React.ReactNode }) {
  return <div className="text-xs">{children}</div>
}
