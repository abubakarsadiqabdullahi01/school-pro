"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
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
  User2,
  School,
  Settings,
  User,
  UserCog,
  Users,
  ScreenShare,
  ComputerIcon,
  CreditCard,
  Percent,
  Receipt,
  Banknote,
  Wallet,
  ReceiptText,
  Scale,
  Briefcase,
  IdCard,
  Wallet2,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";
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
} from "@/components/ui/sidebar";
import { SidebarMenuButton } from "@/components/ui/sidebar-menu-button";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface AppSidebarProps {
  userRole: string | null; // Change from Role to string
  schoolInfo?: {
    name: string;
    code: string;
    logoUrl?: string | null;
  } | null;
  permissions?: PermissionKey[];
}

export function AppSidebar({ userRole, schoolInfo, permissions = [] }: AppSidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    overview: true,
    administration: true,
    schoolManagement: true,
    teaching: true,
    academics: true,
    children: true,
    account: true,
    resultsCompilation: true,
    finance: true,
    expenditure: true,
    hr: true,
  });

  // Convert string role to the format used in component
  const getRoleString = (role: string | null): string | null => {
    if (!role) return null;
    // Convert to lowercase and replace underscores with hyphens
    return role.toLowerCase().replace("_", "-");
  };

  const roleString = getRoleString(userRole);
  const permissionSet = new Set(permissions);
  const can = (permission: PermissionKey) => permissionSet.has(permission);
  const canAny = (...items: PermissionKey[]) => items.some((permission) => can(permission));
  const canManageSchool = canAny("students.manage", "teachers.manage", "parents.manage", "academics.manage", "school.manage", "users.manage");
  const canUseCompiler = canAny("compiler.enter_scores", "compiler.review_results", "compiler.publish_results", "compiler.lock_results", "reports.export");
  const canUseFinance = canAny("finance.setup", "finance.collect_payments", "finance.view_reports");
  const canUseExpenditure = canAny("expenditure.manage", "expenditure.approve");
  const canUsePayroll = canAny("payroll.manage", "payroll.pay");

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  const handleLogout = async () => {
    window.location.href = "/api/auth/signout?callbackUrl=/auth/login";
  };

  // Generate school abbreviation from school name
  const getSchoolAbbreviation = (schoolName: string): string => {
    return schoolName
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase())
      .join("")
      .slice(0, 3); // Limit to 3 characters
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-4 py-2">
          {/* School Logo and Info for non-super-admin roles */}
          {roleString !== "super-admin" && schoolInfo ? (
            <>
              {schoolInfo.logoUrl ? (
                <div className="flex-shrink-0 relative h-8 w-8">
                  <Image
                    src={schoolInfo.logoUrl as string}
                    alt={`${schoolInfo.name} Logo`}
                    width={32}
                    height={32}
                    className="rounded-md object-contain h-8 w-8"
                    onError={(e) => {
                      console.error(
                        "Failed to load school logo:",
                        schoolInfo.logoUrl,
                      );
                      // hide the broken image
                      e.currentTarget.style.display = "none";
                      // reveal the fallback icon element
                      const fallback =
                        e.currentTarget.parentElement?.querySelector(
                          ".fallback-icon",
                        );
                      if (fallback) fallback.classList.remove("invisible");
                    }}
                  />
                  <div className="fallback-icon invisible h-8 w-8 bg-primary/10 rounded-md flex items-center justify-center absolute inset-0">
                    <School className="h-4 w-4 text-primary" />
                  </div>
                </div>
              ) : (
                <div className="flex-shrink-0 h-8 w-8 bg-primary/10 rounded-md flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">
                    {getSchoolAbbreviation(schoolInfo.name)}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">
                  {schoolInfo.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {schoolInfo.code}
                </div>
              </div>
            </>
          ) : (
            /* Default DigiSchool-Pro branding for super-admin */
            <>
              <School className="h-6 w-6 text-primary flex-shrink-0" />
              <span className="text-xl font-bold">DigiSchool-Pro</span>
            </>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Overview Group */}
        <Collapsible
          open={openGroups.overview}
          onOpenChange={() => toggleGroup("overview")}
        >
          <SidebarGroup>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="flex justify-between cursor-pointer">
                Overview
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${openGroups.overview ? "rotate-180" : ""}`}
                />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      href="/dashboard"
                      isActive={pathname === "/dashboard"}
                    >
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
          <Collapsible
            open={openGroups.administration}
            onOpenChange={() => toggleGroup("administration")}
          >
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
                                isActive={
                                  pathname === "/dashboard/super-admin/sessions"
                                }
                              >
                                <Link href="/dashboard/super-admin/sessions">
                                  All Sessions
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/super-admin/sessions/create"
                                }
                              >
                                <Link href="/dashboard/super-admin/sessions/create">
                                  Create Session
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>

                    <MoneyNavGroup
                      pathname={pathname}
                      label="Finance"
                      icon={DollarSign}
                      links={financeLinks("/dashboard/admin/finance", true)}
                    />

                    <MoneyNavGroup
                      pathname={pathname}
                      label="Expenditure"
                      icon={Banknote}
                      links={expenditureLinks("/dashboard/admin/expenditure", true)}
                    />

                    <MoneyNavGroup
                      pathname={pathname}
                      label="HR & Payroll"
                      icon={Briefcase}
                      links={hrLinks("/dashboard/admin/hr", true)}
                    />

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
                                isActive={
                                  pathname === "/dashboard/super-admin/terms"
                                }
                              >
                                <Link href="/dashboard/super-admin/terms">
                                  All Terms
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/super-admin/terms/create"
                                }
                              >
                                <Link href="/dashboard/super-admin/terms/create">
                                  Create Term
                                </Link>
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
                                isActive={
                                  pathname === "/dashboard/super-admin/schools"
                                }
                              >
                                <Link href="/dashboard/super-admin/schools">
                                  View All
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/super-admin/schools/add"
                                }
                              >
                                <Link href="/dashboard/super-admin/schools/add">
                                  Add School
                                </Link>
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
                                isActive={
                                  pathname ===
                                  "/dashboard/super-admin/users/admins"
                                }
                              >
                                <Link href="/dashboard/super-admin/users/admins">
                                  Admins
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            {/* <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/users/teachers"}
                              >
                                <Link href="/dashboard/super-admin/users/teachers">Teachers</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem> */}
                            {/* <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === "/dashboard/super-admin/users/parents"}
                              >
                                <Link href="/dashboard/super-admin/users/parents">Parents</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem> */}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>

                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/super-admin/system"
                        isActive={pathname === "/dashboard/super-admin/system"}
                      >
                        <Settings className="h-4 w-4" />
                        <span>System Settings</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/super-admin/analytics"
                        isActive={
                          pathname === "/dashboard/super-admin/analytics"
                        }
                      >
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

        {(roleString === "admin" || (roleString === "teacher" && (canManageSchool || canUseCompiler || canUseFinance || canUseExpenditure || canUsePayroll))) && (
          <Collapsible
            open={openGroups.schoolManagement}
            onOpenChange={() => toggleGroup("schoolManagement")}
          >
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
                    {can("academics.manage") && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/admin/calendar"
                        isActive={pathname === "/dashboard/admin/calendar"}
                      >
                        <Calendar className="h-4 w-4" />
                        <span>Calendar</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    )}

                    {can("teachers.manage") && (
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
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === "/dashboard/admin/teachers"
                                }
                              >
                                <Link href="/dashboard/admin/teachers">
                                  All Teachers
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === "/dashboard/admin/teachers/new"
                                }
                              >
                                <Link href="/dashboard/admin/teachers/new">
                                  Add Teacher
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    )}

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
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === "/dashboard/admin/students"
                                }
                              >
                                <Link href="/dashboard/admin/students">
                                  All Students
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/students/create"
                                }
                              >
                                <Link href="/dashboard/admin/students/create">
                                  Add Student
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={
                                pathname ===
                                "/dashboard/admin/compiler/student-transitions"
                              }
                            >
                              <Link href="/dashboard/admin/compiler/student-transitions">
                                Class Configuration
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>

                    {/* <Collapsible>
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
                              <SidebarMenuSubButton asChild isActive={pathname === "/dashboard/admin/school-sessions"}>
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
                    </Collapsible> */}

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
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/compiler/subject-results/entry"
                                }
                              >
                                <Link href="/dashboard/admin/compiler/subject-results/entry">
                                  Results Entry
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/compiler/class-results"
                                }
                              >
                                <Link href="/dashboard/admin/compiler/class-results">
                                  Class Results
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/compiler/continuous-assessments"
                                }
                              >
                                <Link href="/dashboard/admin/compiler/continuous-assessments">
                                  C. A Sheet
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/compiler/student-reports"
                                }
                              >
                                <Link href="/dashboard/admin/compiler/student-reports">
                                  Student Termly Result
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem></SidebarMenuSubItem>
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
                                isActive={
                                  pathname === "/dashboard/admin/school-terms"
                                }
                              >
                                <Link href="/dashboard/admin/school-terms">
                                  View Terms
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuItem>
                              <SidebarMenuButton
                                href="/dashboard/admin/class-terms"
                                isActive={
                                  pathname === "/dashboard/admin/class-terms"
                                }
                              >
                                {/* <ClipboardList className="h-4 w-4" /> */}
                                <span>Class Terms</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/school-terms/create"
                                }
                              >
                                <Link href="/dashboard/admin/school-terms/create">
                                  Create Term
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>

                    {can("academics.manage") && (
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
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === "/dashboard/admin/classes"
                                }
                              >
                                <Link href="/dashboard/admin/classes">
                                  View Classes
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === "/dashboard/admin/classes/create"
                                }
                              >
                                <Link href="/dashboard/admin/classes/create">
                                  Create Class
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    )}
                    {can("academics.manage") && (
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
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === "/dashboard/admin/subjects"
                                }
                              >
                                <Link href="/dashboard/admin/subjects">
                                  View Subjects
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/subjects/create"
                                }
                              >
                                <Link href="/dashboard/admin/subjects/create">
                                  Create Subject
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    )}

                    {can("parents.manage") && (
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
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === "/dashboard/admin/parents"
                                }
                              >
                                <Link href="/dashboard/admin/parents">
                                  All Parents
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === "/dashboard/admin/parents/create"
                                }
                              >
                                <Link href="/dashboard/admin/parents/create">
                                  Add Parent
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                    )}

                    {canUseFinance && (
                    <MoneyNavGroup
                      pathname={pathname}
                      label="Finance"
                      icon={DollarSign}
                      links={financeLinks("/dashboard/admin/finance", can("finance.setup"))}
                    />
                    )}

                    {canUseExpenditure && (
                    <MoneyNavGroup
                      pathname={pathname}
                      label="Expenditure"
                      icon={Banknote}
                      links={expenditureLinks("/dashboard/admin/expenditure", can("expenditure.manage"))}
                    />
                    )}

                    {canUsePayroll && (
                    <MoneyNavGroup
                      pathname={pathname}
                      label="HR & Payroll"
                      icon={Briefcase}
                      links={hrLinks("/dashboard/admin/hr", can("payroll.manage"))}
                    />
                    )}

                    {can("users.manage") && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/admin/permissions"
                        isActive={pathname.startsWith("/dashboard/admin/permissions")}
                      >
                        <UserCog className="h-4 w-4" />
                        <span>Permissions</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    )}

                    {can("school.manage") && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/admin/school-settings"
                        isActive={pathname.startsWith(
                          "/dashboard/admin/school-settings",
                        )}
                      >
                        <Settings className="h-4 w-4" />
                        <span>School Settings</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "accountant" && (
          <Collapsible
            open={openGroups.finance}
            onOpenChange={() => toggleGroup("finance")}
          >
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  Finance
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openGroups.finance ? "rotate-180" : ""}`}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {financeLinks("/dashboard/accountant", false).map((link) => (
                      <SidebarMenuItem key={link.href}>
                        <SidebarMenuButton
                          href={link.href}
                          isActive={
                            link.exact
                              ? pathname === link.href
                              : pathname.startsWith(link.href)
                          }
                        >
                          <link.icon className="h-4 w-4" />
                          <span>{link.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "accountant" && (
          <Collapsible
            open={openGroups.expenditure}
            onOpenChange={() => toggleGroup("expenditure")}
          >
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  Expenditure
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openGroups.expenditure ? "rotate-180" : ""}`}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {expenditureLinks("/dashboard/accountant/expenditure", false).map(
                      (link) => (
                        <SidebarMenuItem key={link.href}>
                          <SidebarMenuButton
                            href={link.href}
                            isActive={
                              link.exact
                                ? pathname === link.href
                                : pathname.startsWith(link.href)
                            }
                          >
                            <link.icon className="h-4 w-4" />
                            <span>{link.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ),
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "accountant" && (
          <Collapsible open={openGroups.hr} onOpenChange={() => toggleGroup("hr")}>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  HR &amp; Payroll
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openGroups.hr ? "rotate-180" : ""}`}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {hrLinks("/dashboard/accountant/hr", false).map((link) => (
                      <SidebarMenuItem key={link.href}>
                        <SidebarMenuButton
                          href={link.href}
                          isActive={
                            link.exact
                              ? pathname === link.href
                              : pathname.startsWith(link.href)
                          }
                        >
                          <link.icon className="h-4 w-4" />
                          <span>{link.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "teacher" && (
          <Collapsible
            open={openGroups.teaching}
            onOpenChange={() => toggleGroup("teaching")}
          >
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  Teaching
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openGroups.teaching ? "rotate-180" : ""}`}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/teacher/my-classes"
                        isActive={pathname === "/dashboard/teacher/my-classes"}
                      >
                        <BookOpen className="h-4 w-4" />
                        <span>My Classes</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/teacher/attendance"
                        isActive={pathname === "/dashboard/teacher/attendance"}
                      >
                        <ClipboardList className="h-4 w-4" />
                        <span>Attendance</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/teacher/subjects"
                        isActive={pathname === "/dashboard/teacher/subjects"}
                      >
                        <BookOpenCheck className="h-4 w-4" />
                        <span>Subjects</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/teacher/compiler"
                        isActive={pathname === "/dashboard/teacher/compiler"}
                      >
                        <ComputerIcon className="h-4 w-4" />
                        <span>Compiler</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "student" && (
          <Collapsible
            open={openGroups.academics}
            onOpenChange={() => toggleGroup("academics")}
          >
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  Academics
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openGroups.academics ? "rotate-180" : ""}`}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {/* One entry, because there is one page. This group previously listed
                        My Classes, Grades, Attendance and Timetable — four links that all
                        resolved to this same route, which read as a half-built product.
                        Timetable is gone entirely: there is no timetable model, action or
                        page behind it. Add entries back as real pages are built. */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/student"
                        isActive={pathname === "/dashboard/student"}
                      >
                        <BookOpenCheck className="h-4 w-4" />
                        <span>My Results</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {roleString === "parent" && (
          <Collapsible
            open={openGroups.children}
            onOpenChange={() => toggleGroup("children")}
          >
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex justify-between cursor-pointer">
                  Children
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openGroups.children ? "rotate-180" : ""}`}
                  />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {/* One entry, because there is one page. This group previously listed
                        My Children, Academic Progress, Attendance and Fees, all resolving
                        here. Fees especially: finance exists now, but nothing in it is
                        parent-facing, and pointing a Fees link at a dashboard is the worst
                        way to promise one. */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/parent"
                        isActive={pathname === "/dashboard/parent"}
                      >
                        <Users className="h-4 w-4" />
                        <span>My Children</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Account Group - Common for all roles */}
        <Collapsible
          open={openGroups.account}
          onOpenChange={() => toggleGroup("account")}
        >
          <SidebarGroup>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="flex justify-between cursor-pointer">
                Account
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${openGroups.account ? "rotate-180" : ""}`}
                />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      href="/dashboard/profile"
                      isActive={pathname === "/dashboard/profile"}
                    >
                      <User className="h-4 w-4" />
                      <span>Profile</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* <SidebarMenuItem>
                    <SidebarMenuButton href="/dashboard/settings" isActive={pathname === "/dashboard/settings"}>
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem> */}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-3 py-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 bg-transparent"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

type FinanceLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Fee Setup has child routes (/fees/create), so it matches by prefix. */
  exact: boolean;
};

/**
 * The finance menu, in the order a term is actually worked: see the position, set the
 * fees, take the money, chase what is left, then report on it.
 *
 * `basePath` differs by role. Admins and super admins own the whole school and work under
 * /dashboard/admin/finance; an assigned accountant works under /dashboard/accountant.
 * Each tree has a layout guard, so pointing one role at the other's URLs bounces them.
 *
 * `canManageFees` drops fee setup, discounts, and exemptions. Configuring fees and
 * approving adjustments belong to the admin, and the actions behind those pages require a
 * finance manager whatever link is shown — this only keeps the menu honest.
 */
function financeLinks(basePath: string, canManageFees: boolean): FinanceLink[] {
  return [
    { href: basePath, label: "Dashboard", icon: LayoutDashboard, exact: true },
    ...(canManageFees
      ? [{ href: `${basePath}/fees`, label: "Fee Setup", icon: Settings, exact: false }]
      : []),
    {
      href: `${basePath}/student-payments`,
      label: "Student Payments",
      icon: CreditCard,
      exact: true,
    },
    { href: `${basePath}/receipts`, label: "Receipts", icon: Receipt, exact: false },
    { href: `${basePath}/debtors`, label: "Debtors", icon: Users, exact: true },
    {
      href: `${basePath}/class-summary`,
      label: "Class Summary",
      icon: BarChart3,
      exact: true,
    },
    {
      href: `${basePath}/accumulated-fund`,
      label: "Accumulated Fund",
      icon: FileText,
      exact: true,
    },
    ...(canManageFees
      ? [
          { href: `${basePath}/discounts`, label: "Discounts", icon: Percent, exact: true },
          { href: `${basePath}/exemptions`, label: "Exemptions", icon: Receipt, exact: true },
          { href: `${basePath}/staff`, label: "Finance Staff", icon: UserCog, exact: true },
        ]
      : []),
  ];
}

/**
 * The expenditure menu — the spending side, in the order it is worked: see the position,
 * record a payment, work the approval queue, then report on it.
 *
 * `canManage` drops the payment chart and category setup, which are the admin's to
 * configure. The actions behind those pages require a manager whatever link is shown.
 */
function expenditureLinks(basePath: string, canManage: boolean): FinanceLink[] {
  return [
    { href: basePath, label: "Dashboard", icon: LayoutDashboard, exact: true },
    ...(canManage
      ? [
          { href: `${basePath}/categories`, label: "Categories", icon: ReceiptText, exact: true },
          { href: `${basePath}/accounts`, label: "Payment Chart", icon: Wallet, exact: true },
        ]
      : []),
    { href: `${basePath}/new`, label: "Record Expense", icon: Banknote, exact: true },
    { href: `${basePath}/transactions`, label: "Transactions", icon: FileText, exact: false },
    { href: `${basePath}/reports/termly`, label: "Termly Report", icon: BarChart3, exact: true },
    { href: `${basePath}/reports/session`, label: "Session Report", icon: BarChart3, exact: true },
    { href: `${basePath}/budget-summary`, label: "Budget Summary", icon: Scale, exact: true },
  ];
}

/**
 * The HR and payroll menu.
 *
 * `canManage` drops staff creation and the whole configuration surface — settings, scales,
 * allowances, deductions — which belong to the admin. An accountant generates and pays
 * payroll and reads everything, but must not be able to change what anybody earns.
 */
function hrLinks(basePath: string, canManage: boolean): FinanceLink[] {
  return [
    { href: basePath, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: `${basePath}/staff`, label: "Staff", icon: IdCard, exact: false },
    ...(canManage
      ? [
          { href: `${basePath}/salary-scales`, label: "Salary Scales", icon: Scale, exact: true },
          { href: `${basePath}/allowances`, label: "Allowances", icon: Wallet2, exact: true },
          { href: `${basePath}/deductions`, label: "Deductions", icon: Percent, exact: true },
        ]
      : []),
    { href: `${basePath}/payroll`, label: "Payroll", icon: Banknote, exact: false },
    { href: `${basePath}/reports`, label: "HR Reports", icon: BarChart3, exact: true },
    ...(canManage ? [{ href: `${basePath}/config`, label: "HR Settings", icon: Settings, exact: true }] : []),
  ];
}

/** One collapsible money menu, for roles whose sidebar covers more than money. */
function MoneyNavGroup({
  pathname,
  label,
  icon: Icon,
  links,
}: {
  pathname: string;
  label: string;
  icon: LucideIcon;
  links: FinanceLink[];
}) {
  return (
    <Collapsible>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="justify-between">
            <div className="flex items-center">
              <Icon className="h-4 w-4 mr-2" />
              <span>{label}</span>
            </div>
            <ChevronDown className="h-4 w-4 ml-2" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {links.map((link) => (
              <SidebarMenuSubItem key={link.href}>
                <SidebarMenuSubButton
                  asChild
                  isActive={
                    link.exact
                      ? pathname === link.href
                      : pathname.startsWith(link.href)
                  }
                >
                  <Link href={link.href}>{link.label}</Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
