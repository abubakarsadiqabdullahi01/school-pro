"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  X,
  DollarSign,
  BarChart3,
  School,
  UserCog,
  BookOpenCheck,
  Presentation,
  MessageSquare,
  User,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

interface SidebarProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  userRole?: "super-admin" | "admin" | "teacher" | "student" | "parent"
  isMobile: boolean
}

export function DashboardSidebar({ isOpen, setIsOpen, userRole = "admin", isMobile }: SidebarProps) {
  const pathname = usePathname()
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})

  // Navigation items based on user role
  const navigationItems = getNavigationItems(userRole)

  // Toggle submenu
  const toggleMenu = (menuId: string) => {
    setOpenMenus((prev) => ({
      ...prev,
      [menuId]: !prev[menuId],
    }))
  }

  // Close sidebar on mobile when clicking a link
  const handleLinkClick = () => {
    if (isMobile) {
      setIsOpen(false)
    }
  }

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && isOpen && <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setIsOpen(false)} />}

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-950 border-r",
              isMobile ? "shadow-xl" : "",
            )}
          >
            <div className="flex h-full flex-col">
              <div className="flex h-14 items-center px-4 border-b">
                <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
                  <School className="h-6 w-6 text-primary" />
                  <span className="text-xl font-bold">SchoolPro</span>
                </Link>
                {isMobile && (
                  <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setIsOpen(false)}>
                    <X className="h-5 w-5" />
                    <span className="sr-only">Close</span>
                  </Button>
                )}
              </div>

              <ScrollArea className="flex-1 py-2">
                <nav className="grid gap-1 px-2">
                  {navigationItems.map((section, index) => (
                    <div key={index} className="mb-4">
                      {section.label && (
                        <h3 className="mb-2 px-4 text-xs font-semibold text-muted-foreground">{section.label}</h3>
                      )}
                      <div className="grid gap-1">
                        {section.items.map((item, itemIndex) => (
                          <div key={itemIndex}>
                            {item.children ? (
                              <div className="grid gap-1">
                                <Button
                                  variant="ghost"
                                  className={cn(
                                    "flex w-full justify-between px-4 py-2 text-sm font-medium",
                                    pathname.startsWith(item.href) && "bg-muted",
                                  )}
                                  onClick={() => toggleMenu(item.href)}
                                >
                                  <div className="flex items-center gap-3">
                                    {item.icon && <item.icon className="h-4 w-4" />}
                                    {item.label}
                                  </div>
                                  <ChevronDown
                                    className={cn("h-4 w-4 transition-transform", openMenus[item.href] && "rotate-180")}
                                  />
                                </Button>

                                <AnimatePresence>
                                  {openMenus[item.href] && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="grid gap-1 pl-10 pr-2">
                                        {item.children.map((child, childIndex) => (
                                          <Link
                                            key={childIndex}
                                            href={child.href}
                                            onClick={handleLinkClick}
                                            className={cn(
                                              "flex items-center gap-3 rounded-md px-4 py-2 text-sm font-medium",
                                              pathname === child.href
                                                ? "bg-primary text-primary-foreground"
                                                : "hover:bg-muted",
                                            )}
                                          >
                                            {child.label}
                                          </Link>
                                        ))}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            ) : (
                              <Link
                                href={item.href}
                                onClick={handleLinkClick}
                                className={cn(
                                  "flex items-center gap-3 rounded-md px-4 py-2 text-sm font-medium",
                                  pathname === item.href ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                                )}
                              >
                                {item.icon && <item.icon className="h-4 w-4" />}
                                {item.label}
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>
                      {index < navigationItems.length - 1 && <Separator className="my-4" />}
                    </div>
                  ))}
                </nav>
              </ScrollArea>

              <div className="border-t p-4">
                <Button variant="outline" className="w-full justify-start gap-2" asChild>
                  <Link href="/auth/login">
                    <LogOut className="h-4 w-4" />
                    <span>Log out</span>
                  </Link>
                </Button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}

// Helper function to get navigation items based on user role
function getNavigationItems(userRole: string) {
  const commonItems = [
    {
      label: "Overview",
      items: [
        {
          label: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          label: "Calendar",
          href: "/dashboard/calendar",
          icon: Calendar,
        },
        {
          label: "Messages",
          href: "/dashboard/messages",
          icon: MessageSquare,
        },
      ],
    },
    {
      label: "Account",
      items: [
        {
          label: "Profile",
          href: "/dashboard/profile",
          icon: User,
        },
        {
          label: "Settings",
          href: "/dashboard/settings",
          icon: Settings,
        },
      ],
    },
  ]

  // Super Admin navigation
  if (userRole === "super-admin") {
    return [
      ...commonItems,
      {
        label: "Administration",
        items: [
          {
            label: "Schools Management",
            href: "/dashboard/schools",
            icon: School,
          },
          {
            label: "User Management",
            href: "/dashboard/users",
            icon: UserCog,
            children: [
              { label: "Admins", href: "/dashboard/users/admins" },
              { label: "Teachers", href: "/dashboard/users/teachers" },
              { label: "Students", href: "/dashboard/users/students" },
              { label: "Parents", href: "/dashboard/users/parents" },
            ],
          },
          {
            label: "System Settings",
            href: "/dashboard/system",
            icon: Settings,
          },
          {
            label: "Analytics",
            href: "/dashboard/analytics",
            icon: BarChart3,
          },
        ],
      },
    ]
  }

  // Admin navigation
  if (userRole === "admin") {
    return [
      ...commonItems,
      {
        label: "School Management",
        items: [
          {
            label: "Teachers",
            href: "/dashboard/teachers",
            icon: Users,
          },
          {
            label: "Students",
            href: "/dashboard/students",
            icon: GraduationCap,
            children: [
              { label: "All Students", href: "/dashboard/students/all" },
              { label: "Admissions", href: "/dashboard/students/admissions" },
              { label: "Student Records", href: "/dashboard/students/records" },
            ],
          },
          {
            label: "Classes",
            href: "/dashboard/classes",
            icon: BookOpen,
          },
          {
            label: "Attendance",
            href: "/dashboard/attendance",
            icon: ClipboardList,
          },
          {
            label: "Examinations",
            href: "/dashboard/exams",
            icon: FileText,
          },
          {
            label: "Finance",
            href: "/dashboard/finance",
            icon: DollarSign,
            children: [
              { label: "Fees Collection", href: "/dashboard/finance/fees" },
              { label: "Expenses", href: "/dashboard/finance/expenses" },
              { label: "Reports", href: "/dashboard/finance/reports" },
            ],
          },
        ],
      },
    ]
  }

  // Teacher navigation
  if (userRole === "teacher") {
    return [
      ...commonItems,
      {
        label: "Teaching",
        items: [
          {
            label: "My Classes",
            href: "/dashboard/my-classes",
            icon: BookOpen,
          },
          {
            label: "Attendance",
            href: "/dashboard/attendance",
            icon: ClipboardList,
          },
          {
            label: "Assignments",
            href: "/dashboard/assignments",
            icon: FileText,
          },
          {
            label: "Grades",
            href: "/dashboard/grades",
            icon: BookOpenCheck,
          },
          {
            label: "Lesson Plans",
            href: "/dashboard/lesson-plans",
            icon: Presentation,
          },
        ],
      },
    ]
  }

  // Student navigation
  if (userRole === "student") {
    return [
      ...commonItems,
      {
        label: "Academics",
        items: [
          {
            label: "My Classes",
            href: "/dashboard/my-classes",
            icon: BookOpen,
          },
          {
            label: "Assignments",
            href: "/dashboard/assignments",
            icon: FileText,
          },
          {
            label: "Grades",
            href: "/dashboard/grades",
            icon: BookOpenCheck,
          },
          {
            label: "Attendance",
            href: "/dashboard/attendance",
            icon: ClipboardList,
          },
          {
            label: "Timetable",
            href: "/dashboard/timetable",
            icon: Calendar,
          },
        ],
      },
    ]
  }

  // Parent navigation
  if (userRole === "parent") {
    return [
      ...commonItems,
      {
        label: "Children",
        items: [
          {
            label: "My Children",
            href: "/dashboard/my-children",
            icon: Users,
          },
          {
            label: "Academic Progress",
            href: "/dashboard/academic-progress",
            icon: BookOpenCheck,
          },
          {
            label: "Attendance",
            href: "/dashboard/attendance",
            icon: ClipboardList,
          },
          {
            label: "Fees",
            href: "/dashboard/fees",
            icon: DollarSign,
          },
        ],
      },
    ]
  }

  // Default navigation
  return commonItems
}

