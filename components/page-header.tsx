"use client"

import Link from "next/link"
import { Button, type ButtonProps } from "@/components/ui/button"

interface PageHeaderAction extends Omit<ButtonProps, "children"> {
  label: string
  href?: string
  onClick?: () => void
}

interface PageHeaderProps {
  heading: string
  description?: string
  actions?: PageHeaderAction[]
}

export function PageHeader({ heading, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && actions.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {actions.map((action, index) => {
            const { label, href, onClick, ...props } = action

            if (href) {
              return (
                <Button key={index} asChild {...props}>
                  <Link href={href}>{label}</Link>
                </Button>
              )
            }

            return (
              <Button key={index} onClick={onClick} {...props}>
                {label}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
