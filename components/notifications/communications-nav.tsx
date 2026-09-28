import Link from "next/link"

import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/dashboard/admin/communications", label: "Announcements" },
  { href: "/dashboard/admin/communications/fee-reminders", label: "Fee reminders" },
  { href: "/dashboard/admin/communications/annual-results", label: "Annual results" },
  { href: "/dashboard/admin/compiler/notifications", label: "Term results" },
  { href: "/dashboard/admin/communications/history", label: "Message history" },
  { href: "/dashboard/admin/school-settings/notifications", label: "Wording & controls" },
]

export function CommunicationsNav({ active }: { active: string }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Communications">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href}
          className={cn("rounded-full border px-3 py-1 text-sm transition-colors", link.href === active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
