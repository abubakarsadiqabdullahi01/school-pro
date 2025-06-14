"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Calendar,
  ChevronDown,
  ClipboardList,
  DollarSign,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  User2,
  School,
  Settings,
  User,
  UserCog,
  Users,
  
 ScreenShare,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar"
import { SidebarMenuButton } from "@/components/ui/sidebar-menu-button" 
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Role } from "@prisma/client"

export function AppSidebar({ userRole }: { userRole: Role | null }) {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    overview: true,
    administration: true,
    schoolManagement: true,
    teaching: true,
    academics: true,
    children: true,
    account: true,
    resultsCompilation: true, // Updated key
  })

  // Convert Prisma Role enum to string format used in component
  const getRoleString = (role: Role | null): string | null => {
    if (!role) return null

    switch (role) {
      case Role.SUPER_ADMIN:
        return "super-admin"
      case Role.ADMIN:
        return "admin"
      case Role.TEACHER:
        return "teacher"
      case Role.STUDENT:
        return "student"
      case Role.PARENT:
        return "parent"
      default:
        return null
    }
  }

  const roleString = getRoleString(userRole as Role)

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }))
  }

  const handleLogout = async () => {
    window.location.href = "/api/auth/signout?callbackUrl=/auth/login"
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-2">
          <School className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">SchoolPro</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Overview Group */}
        <Collapsible open={openGroups.overview} onOpenChange={() => toggleGroup("overview")}>
          <SidebarGroup>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="flex justify-between cursor-pointer">
                Overview
                <ChevronDown className={`h-4 w-4 transition-transform ${openGroups.overview ? "rotate-180" : ""}`} />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton href="/dashboard" isActive={pathname === "/dashboard"}>
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Dashboard</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* Role-specific Groups */}
        {roleString === "super-admin" && (
          <Collapsible open={openGroups.administration} onOpenChange={() => toggleGroup("administration")}>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  Administration
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openGroups.administration ? "rotate-180" : ""}`}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-2" />
                              <span>Sessions</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/sessions"}
                              >
                                <Link href="/dashboard/super-admin/sessions">All Sessions</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/sessions/create"}
                              >
                                <Link href="/dashboard/super-admin/sessions/create">Create Session</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <BookOpen className="h-4 w-4 mr-2" />
                              <span>Terms</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/terms"}
                              >
                                <Link href="/dashboard/super-admin/terms">All Terms</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/terms/create"}
                              >
                                <Link href="/dashboard/super-admin/terms/create">Create Term</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <School className="h-4 w-4 mr-2" />
                              <span>Schools Management</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/schools"}
                              >
                                <Link href="/dashboard/super-admin/schools">View All</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/schools/add"}
                              >
                                <Link href="/dashboard/super-admin/schools/add">Add School</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <UserCog className="h-4 w-4 mr-2" />
                              <span>User Management</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/users/admins"}
                              >
                                <Link href="/dashboard/super-admin/users/admins">Admins</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/users/teachers"}
                              >
                                <Link href="/dashboard/super-admin/users/teachers">Teachers</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/users/students"}
                              >
                                <Link href="/dashboard/super-admin/users/students">Students</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/users/parents"}
                              >
                                <Link href="/dashboard/super-admin/users/parents">Parents</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <BookOpenCheck className="h-4 w-4 mr-2" />
                              <span>Results Compilation</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/compiler/subject-results"}
                              >
                                <Link href="/dashboard/super-admin/compiler/subject-results">Subject Results</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/compiler/class-results"}
                              >
                                <Link href="/dashboard/super-admin/compiler/class-results">Class Results</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/compiler/continuous-assessments"}
                              >
                                <Link href="/dashboard/super-admin/compiler/continuous-assessments">Continuous Assessments</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/compiler/students-transition"}
                              >
                                <Link href="/dashboard/super-admin/compiler/students-transition">Students Transition</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/super-admin/system" isActive={pathname === "/dashboard/super-admin/system"}>
                        <Settings className="h-4 w-4" />
                        <span>System Settings</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/super-admin/analytics" isActive={pathname === "/dashboard/super-admin/analytics"}>
                        <BarChart3 className="h-4 w-4" />
                        <span>Analytics</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "admin" && (
          <Collapsible open={openGroups.schoolManagement} onOpenChange={() => toggleGroup("schoolManagement")}>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  School Management
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openGroups.schoolManagement ? "rotate-180" : ""}`}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton href="/dashboard/admin/calendar" isActive={pathname === "/dashboard/admin/calendar"}>
                      <Calendar className="h-4 w-4" />
                      <span>Calendar</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <User2 className="h-4 w-4 mr-2" />
                              <span>Teachers</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/teachers"}>
                                <Link href="/dashboard/admin/teachers">All Teachers</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/teachers/new"}>
                                <Link href="/dashboard/admin/teachers/new">Add Teacher</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <GraduationCap className="h-4 w-4 mr-2" />
                              <span>Students</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/students"}>
                                <Link href="/dashboard/admin/students">All Students</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/students/create"}>
                                <Link href="/dashboard/admin/students/create">Add Student</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-2" />
                              <span>Sessions</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/admin/school-sessions"}
                              >
                                <Link href="/dashboard/admin/school-sessions">View Sessions</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/admin/school-sessions/create"}
                              >
                                <Link href="/dashboard/admin/school-sessions/create">Create Session</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <ScreenShare className="h-4 w-4 mr-2" />
                              <span>Compiler</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/admin/compiler/subject-results/entry"}
                              >
                                <Link href="/dashboard/admin/compiler/subject-results/entry">Subject Results</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/admin/compiler/class-results"}
                              >
                                <Link href="/dashboard/admin/compiler/class-results">Class Results</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/admin/compiler/continuous-assessments"}
                              >
                                <Link href="/dashboard/admin/compiler/continuous-assessments">C. A Sheet</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/admin/compiler/student-reports"}
                              >
                                <Link href="/dashboard/admin/compiler/student-reports">Student Reports</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/admin/compiler/student-transitions"}
                              >
                                <Link href="/dashboard/admin/compiler/student-transitions">Students Transition</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <BookOpen className="h-4 w-4 mr-2" />
                              <span>Terms</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/admin/school-terms"}
                              >
                                <Link href="/dashboard/admin/school-terms">View Terms</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/admin/school-terms/create"}
                              >
                                <Link href="/dashboard/admin/school-terms/create">Create Term</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <BookOpen className="h-4 w-4 mr-2" />
                              <span>Classes</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/classes"}>
                                <Link href="/dashboard/admin/classes">View Classes</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/classes/create"}>
                                <Link href="/dashboard/admin/classes/create">Create Class</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/admin/class-terms" isActive={pathname === "/dashboard/admin/class-terms"}>
                        <ClipboardList className="h-4 w-4" />
                        <span>Class Terms</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <FileText className="h-4 w-4 mr-2" />
                              <span>Subjects</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/subjects"}>
                                <Link href="/dashboard/admin/subjects">View Subjects</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/subjects/create"}>
                                <Link href="/dashboard/admin/subjects/create">Create Subject</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <Users className="h-4 w-4 mr-2" />
                              <span>Parents</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/parents"}>
                                <Link href="/dashboard/admin/parents">All Parents</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/parents/create"}>
                                <Link href="/dashboard/admin/parents/create">Add Parent</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    {/* <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <DollarSign className="h-4 w-4 mr-2" />
                              <span>Finance</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/finance/fees"}>
                                <Link href="/dashboard/admin/finance/fees">Fees Collection</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/finance/expenses"}>
                                <Link href="/dashboard/admin/finance/expenses">Expenses</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/finance/reports"}>
                                <Link href="/dashboard/admin/finance/reports">Reports</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible> */}
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between">
                            <div className="flex items-center">
                              <Settings className="h-4 w-4 mr-2" />
                              <span>School Settings</span>
                            </div>
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/school-settings/grading-systems"}>
                                <Link href="/dashboard/admin/school-settings/grading-systems">Grading Systems</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "teacher" && (
          <Collapsible open={openGroups.teaching} onOpenChange={() => toggleGroup("teaching")}>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  Teaching
                  <ChevronDown className={`h-4 w-4 transition-transform ${openGroups.teaching ? "rotate-180" : ""}`} />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/teacher/my-classes" isActive={pathname === "/dashboard/teacher/my-classes"}>
                        <BookOpen className="h-4 w-4" />
                        <span>My Classes</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/teacher/attendance" isActive={pathname === "/dashboard/teacher/attendance"}>
                        <ClipboardList className="h-4 w-4" />
                        <span>Attendance</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/teacher/assignments" isActive={pathname === "/dashboard/teacher/assignments"}>
                        <FileText className="h-4 w-4" />
                        <span>Assignments</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/teacher/grades" isActive={pathname === "/dashboard/teacher/grades"}>
                        <BookOpenCheck className="h-4 w-4" />
                        <span>Grades</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "student" && (
          <Collapsible open={openGroups.academics} onOpenChange={() => toggleGroup("academics")}>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  Academics
                  <ChevronDown className={`h-4 w-4 transition-transform ${openGroups.academics ? "rotate-180" : ""}`} />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/student/my-classes" isActive={pathname === "/dashboard/student/my-classes"}>
                        <BookOpen className="h-4 w-4" />
                        <span>My Classes</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/student/grades" isActive={pathname === "/dashboard/student/grades"}>
                        <BookOpenCheck className="h-4 w-4" />
                        <span>Grades</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/student/attendance" isActive={pathname === "/dashboard/student/attendance"}>
                        <ClipboardList className="h-4 w-4" />
                        <span>Attendance</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/student/timetable" isActive={pathname === "/dashboard/student/timetable"}>
                        <Calendar className="h-4 w-4" />
                        <span>Timetable</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "parent" && (
          <Collapsible open={openGroups.children} onOpenChange={() => toggleGroup("children")}>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  Children
                  <ChevronDown className={`h-4 w-4 transition-transform ${openGroups.children ? "rotate-180" : ""}`} />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/parent/my-children" isActive={pathname === "/dashboard/parent/my-children"}>
                        <Users className="h-4 w-4" />
                        <span>My Children</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/parent/academic-progress" isActive={pathname === "/dashboard/parent/academic-progress"}>
                        <BookOpenCheck className="h-4 w-4" />
                        <span>Academic Progress</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/parent/attendance" isActive={pathname === "/dashboard/parent/attendance"}>
                        <ClipboardList className="h-4 w-4" />
                        <span>Attendance</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton href="/dashboard/parent/fees" isActive={pathname === "/dashboard/parent/fees"}>
                        <DollarSign className="h-4 w-4" />
                        <span>Fees</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Account Group - Common for all roles */}
        <Collapsible open={openGroups.account} onOpenChange={() => toggleGroup("account")}>
          <SidebarGroup>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="flex justify-between cursor-pointer">
                Account
                <ChevronDown className={`h-4 w-4 transition-transform ${openGroups.account ? "rotate-180" : ""}`} />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton href="/dashboard/profile" isActive={pathname === "/dashboard/profile"}>
                      <User className="h-4 w-4" />
                      <span>Profile</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton href="/dashboard/settings" isActive={pathname === "/dashboard/settings"}>
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-3 py-2">
          <Button variant="outline" className="w-full justify-start gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}