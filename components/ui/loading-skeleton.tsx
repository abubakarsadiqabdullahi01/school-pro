"use client"

import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-4 w-2/4" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Skeleton className="h-80 w-full lg:col-span-4" />
        <Skeleton className="h-80 w-full lg:col-span-3" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-4 w-2/4" />
      </div>

      <Skeleton className="h-10 w-full" />

      <Skeleton className="h-[400px] w-full" />
    </div>
  )
}

export function TableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-4 w-2/4" />
      </div>

      <div className="flex justify-between">
        <Skeleton className="h-10 w-1/4" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <Skeleton className="h-[500px] w-full" />
    </div>
  )
}

export function FormSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-2">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-4 w-2/4" />
      </div>

      {/* Stepper (Mimicking StudentForm's Stepper) */}
      <div className="flex justify-between gap-2">
        <Skeleton className="h-8 w-1/5" />
        <Skeleton className="h-8 w-1/5" />
        <Skeleton className="h-8 w-1/5" />
        <Skeleton className="h-8 w-1/5" />
        <Skeleton className="h-8 w-1/5" />
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {/* Field Group 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Input */}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        {/* Field Group 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        {/* Field Group 3 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24" /> {/* Previous Button */}
        <Skeleton className="h-10 w-24" /> {/* Next/Submit Button */}
      </div>
    </div>
  )
}