"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Calendar,
  Megaphone,
  ChevronDown,
  ClipboardList,
  DollarSign,
  FileText,
  CalendarCheck,
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
  Activity,
  CreditCard,
  Percent,
  Receipt,
  Banknote,
  Landmark,
  Wallet,
  ReceiptText,
  Scale,
  Briefcase,
  IdCard,
  Wallet2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
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
import { useEffect, useState } from "react";
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
  /**
   * Super admin only — the school currently in focus, or null for "All schools".
   *
   * Drives which half of the sidebar is shown. Everyone else is pinned to one school by
   * their own record and never sees the switcher, so this stays null for them.
   */
  activeSchool?: { id: string; name: string; code: string } | null;
}

export function AppSidebar({
  userRole,
  schoolInfo,
  permissions = [],
  activeSchool = null,
}: AppSidebarProps) {
  const pathname = usePathname();
  /**
   * The child whose pages are open, taken from the path.
   *
   * Read rather than fetched because the sidebar renders on every screen and a request per
   * navigation to name one child would be a poor trade. The id only ever produces links;
   * every page behind them re-checks that the child is actually linked to this parent.
   */
  const openChildId = pathname.match(/^\/dashboard\/parent\/children\/([^/]+)/)?.[1] ?? null

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    overview: true,
    administration: true,
    schoolManagement: true,
    teaching: true,
    children: true,
    academics: true,
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

  // Straight to the role's own dashboard rather than /dashboard, which is only a
  // client-side redirect to exactly this route. Going through it cost a spinner
  // on every click, and left the entry permanently unhighlighted, because the
  // pathname the user lands on is never the /dashboard the link pointed at.
  const dashboardHref = roleString ? `/dashboard/${roleString}` : "/dashboard";

  /**
   * A super admin looking at the whole platform rather than one school.
   *
   * Everything under School Management — and Finance, Expenditure and HR & Payroll, which
   * point at /dashboard/admin/* — needs a school to mean anything. Offering them while no
   * school is selected invites a click that lands on a page with nothing to show, or worse,
   * on another school's figures. Sessions, Terms, Schools Management, User Management,
   * System Settings and Analytics stay: those pages already aggregate across schools.
   */
  const isPlatformView = roleString === "super-admin" && !activeSchool;

  const permissionSet = new Set(permissions);
  const can = (permission: PermissionKey) => permissionSet.has(permission);
  const canAny = (...items: PermissionKey[]) => items.some((permission) => can(permission));
  const canManageSchool = canAny("students.manage", "teachers.manage", "parents.manage", "academics.manage", "school.manage", "users.manage");
  const canUseCompiler = canAny("compiler.enter_scores", "compiler.review_results", "compiler.publish_results", "compiler.lock_results", "reports.export");
  const canUseFinance = canAny("finance.setup", "finance.collect_payments", "finance.view_reports");
  const canUseExpenditure = canAny("expenditure.manage", "expenditure.approve");
  const canUsePayroll = canAny("payroll.manage", "payroll.pay");

  // Shown when something inside it will actually render, rather than to anyone
  // holding any permission at all. A teacher holds compiler.enter_scores, which
  // used to open this group and reveal Students, Compiler and Terms — every one
  // of which bounces them straight back to their own dashboard, because the
  // pages behind them need permissions a teacher does not have.
  // An accountant works Finance, Expenditure and HR & Payroll from their own menus. The
  // same three again under School Management pointed at the admin pages: two routes to one
  // job, one of them showing the admin's configuration links.
  const moneyInSchoolManagement = roleString !== "accountant";
  const canSeeSchoolManagement =
    canManageSchool ||
    (moneyInSchoolManagement && (canUseFinance || canUseExpenditure || canUsePayroll)) ||
    can("compiler.review_results");

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  // A plain GET to /api/auth/signout only renders NextAuth's own unstyled
  // confirmation page, so signing out took two clicks and left the app's
  // theming behind. signOut() POSTs the request itself and returns here.
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/auth/login" });
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
                      href={dashboardHref}
                      isActive={pathname === dashboardHref}
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
                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/super-admin/sessions", "/dashboard/super-admin/sessions/create"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/super-admin/sessions", "/dashboard/super-admin/sessions/create"])}>
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-2" />
                              <span>Academic Sessions</span>
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
                    </NavGroup>

                    {/* School money. Hidden while no school is in focus, because these
                        routes read the admin school context rather than the switcher. */}
                    {!isPlatformView && (
                      <>
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
                      </>
                    )}

                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/super-admin/terms", "/dashboard/super-admin/terms/create"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/super-admin/terms", "/dashboard/super-admin/terms/create"])}>
                            <div className="flex items-center">
                              <BookOpen className="h-4 w-4 mr-2" />
                              <span>Academic Terms</span>
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
                    </NavGroup>

                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/super-admin/schools", "/dashboard/super-admin/schools/add"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/super-admin/schools", "/dashboard/super-admin/schools/add"])}>
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
                    </NavGroup>

                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/super-admin/users/admins", "/dashboard/super-admin/users/teachers", "/dashboard/super-admin/users/parents"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/super-admin/users/admins", "/dashboard/super-admin/users/teachers", "/dashboard/super-admin/users/parents"])}>
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
                    </NavGroup>

                    {/* What DigiSchool charges a school it collects for. Deliberately here
                        rather than on the school's own payment screen: a school cannot be
                        allowed to edit the platform's cut of its own settlements. */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/super-admin/payments"
                        isActive={pathname === "/dashboard/super-admin/payments"}
                      >
                        <CreditCard className="h-4 w-4" />
                        <span>Payment Charges</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/super-admin/payments/monitor"
                        isActive={pathname === "/dashboard/super-admin/payments/monitor"}
                      >
                        <Activity className="h-4 w-4" />
                        <span>Payment Monitor</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

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

        {canSeeSchoolManagement && !isPlatformView && (
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
                    {can("school.manage") && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/admin/communications"
                        isActive={pathname.startsWith("/dashboard/admin/communications")}
                      >
                        <Megaphone className="h-4 w-4" />
                        <span>Communications</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    )}

                    {/* The Exams Officer (academics.manage) comes here to assign subjects; only
                        HR's teachers.manage is offered Add Teacher, because hiring is employment. */}
                    {canAny("teachers.manage", "academics.manage") && (
                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/admin/teachers", "/dashboard/admin/teachers/new"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/admin/teachers", "/dashboard/admin/teachers/new"])}>
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
                            {can("teachers.manage") && (
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
                            )}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </NavGroup>
                    )}

                    {can("students.manage") && (
                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/admin/students", "/dashboard/admin/students/create", "/dashboard/admin/compiler/student-transitions"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/admin/students", "/dashboard/admin/students/create", "/dashboard/admin/compiler/student-transitions"])}>
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
                            {/* Sits in the Students menu (students.manage); its page opens for
                                that, and for compiler.configure_policy, which sets its rules. */}
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
                    </NavGroup>
                    )}

                    {/* <NavGroup active={isInsideGroup(pathname, ["/dashboard/admin/school-sessions", "/dashboard/admin/school-sessions/create"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/admin/school-sessions", "/dashboard/admin/school-sessions/create"])}>
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
                    </NavGroup> */}

                    {can("compiler.review_results") && (
                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/admin/compiler/subject-results/entry", "/dashboard/admin/compiler/class-results", "/dashboard/admin/compiler/continuous-assessments", "/dashboard/admin/compiler/student-reports"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/admin/compiler/subject-results/entry", "/dashboard/admin/compiler/class-results", "/dashboard/admin/compiler/continuous-assessments", "/dashboard/admin/compiler/student-reports"])}>
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
                                  "/dashboard/admin/compiler/class-results/sessional"
                                }
                              >
                                <Link href="/dashboard/admin/compiler/class-results/sessional">
                                  Sessional Results
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/compiler/annual-results"
                                }
                              >
                                <Link href="/dashboard/admin/compiler/annual-results">
                                  Annual Results
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/compiler/promotion-policies"
                                }
                              >
                                <Link href="/dashboard/admin/compiler/promotion-policies">
                                  Promotion Rules
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname ===
                                  "/dashboard/admin/compiler/notifications"
                                }
                              >
                                <Link href="/dashboard/admin/compiler/notifications">
                                  Notifications
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
                    </NavGroup>
                    )}

                    {can("academics.manage") && (
                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/admin/school-terms", "/dashboard/admin/class-terms", "/dashboard/admin/school-terms/create"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/admin/school-terms", "/dashboard/admin/class-terms", "/dashboard/admin/school-terms/create"])}>
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
                    </NavGroup>
                    )}

                    {can("academics.manage") && (
                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/admin/classes", "/dashboard/admin/classes/create"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/admin/classes", "/dashboard/admin/classes/create"])}>
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
                    </NavGroup>
                    )}
                    {can("academics.manage") && (
                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/admin/subjects", "/dashboard/admin/subjects/create"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/admin/subjects", "/dashboard/admin/subjects/create"])}>
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
                    </NavGroup>
                    )}

                    {can("parents.manage") && (
                    <NavGroup active={isInsideGroup(pathname, ["/dashboard/admin/parents", "/dashboard/admin/parents/create"])}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="justify-between" isActive={isInsideGroup(pathname, ["/dashboard/admin/parents", "/dashboard/admin/parents/create"])}>
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
                    </NavGroup>
                    )}

                    {canUseFinance && moneyInSchoolManagement && (
                    <MoneyNavGroup
                      pathname={pathname}
                      label="Finance"
                      icon={DollarSign}
                      links={financeLinks("/dashboard/admin/finance", can("finance.setup"))}
                    />
                    )}

                    {canUseExpenditure && moneyInSchoolManagement && (
                    <MoneyNavGroup
                      pathname={pathname}
                      label="Expenditure"
                      icon={Banknote}
                      links={expenditureLinks("/dashboard/admin/expenditure", can("expenditure.approve"))}
                    />
                    )}

                    {canUsePayroll && moneyInSchoolManagement && (
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
                        href="/dashboard/admin/integrity"
                        isActive={pathname.startsWith("/dashboard/admin/integrity")}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>System Integrity</span>
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

        {/* The Academics group came back when a second student page did. It was cut
            when it held one "My Results" entry pointing at /dashboard/student, the
            page Dashboard already linked to; "My Record" is a different page, so the
            group now names something the Dashboard entry does not. */}
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
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/student/records"
                        isActive={pathname === "/dashboard/student/records"}
                      >
                        <GraduationCap className="h-4 w-4" />
                        <span>My Record</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/student/attendance"
                        isActive={pathname === "/dashboard/student/attendance"}
                      >
                        <CalendarCheck className="h-4 w-4" />
                        <span>Attendance</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/student/fees"
                        isActive={pathname === "/dashboard/student/fees"}
                      >
                        <Receipt className="h-4 w-4" />
                        <span>Fees & Receipts</span>
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
                    {/* My Children is its own page now. It used to point at
                        /dashboard/parent, the same URL as Dashboard above it, so a parent
                        had two menu entries and one page and clicking either appeared to
                        do nothing. */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        href="/dashboard/parent/children"
                        isActive={pathname === "/dashboard/parent/children"}
                      >
                        <Users className="h-4 w-4" />
                        <span>My Children</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    {/* A parent's screens all belong to one child, so there is nothing
                        useful to link to until one is open. Once a child is, their pages
                        appear here — the same three the student portal offers, reached the
                        same way, instead of going back to the list each time. */}
                    {openChildId ? (
                      <>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            href={`/dashboard/parent/children/${openChildId}`}
                            isActive={pathname === `/dashboard/parent/children/${openChildId}`}
                          >
                            <LayoutDashboard className="h-4 w-4" />
                            <span>Overview</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            href={`/dashboard/parent/children/${openChildId}/records`}
                            isActive={pathname.startsWith(
                              `/dashboard/parent/children/${openChildId}/records`,
                            )}
                          >
                            <GraduationCap className="h-4 w-4" />
                            <span>Academic Record</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            href={`/dashboard/parent/children/${openChildId}/fees`}
                            isActive={pathname.startsWith(
                              `/dashboard/parent/children/${openChildId}/fees`,
                            )}
                          >
                            <Receipt className="h-4 w-4" />
                            <span>Fees & Receipts</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </>
                    ) : null}
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

/**
 * Whether the page on screen lives inside this group of links.
 *
 * Matched by prefix, not equality: a detail page like `/classes/abc/edit` is still inside
 * Classes, and a menu that closes the moment you open a record is a menu that has stopped
 * telling you where you are.
 */
function isInsideGroup(pathname: string, hrefs: string[]): boolean {
  return hrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`))
}

/**
 * A sidebar group that opens itself around the page you are on.
 *
 * Every group used to start closed on each page load, so arriving at Discounts showed a
 * collapsed Finance and no sign of where you were. It stays controlled rather than using
 * `defaultOpen` because the sidebar is not remounted between pages — without the effect, a
 * link followed from elsewhere in the app would land inside a group that is still shut.
 * Closing one by hand still works; the next navigation into it opens it again.
 */
function NavGroup({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {children}
    </Collapsible>
  );
}

type FinanceLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Fee Setup has child routes (categories, schedules, the two new-forms), so it matches by prefix. */
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
    { href: `${basePath}/online-payments`, label: "Online Payments", icon: ShieldCheck, exact: false },
    { href: `${basePath}/dedicated-accounts`, label: "Dedicated Accounts", icon: Landmark, exact: true },
    { href: `${basePath}/unapplied-payments`, label: "Unapplied Money", icon: Wallet, exact: true },
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
 * configure. It is `expenditure.approve`, the permission that saves them; offering the
 * links on `expenditure.manage` showed a bursar forms that refused every save.
 */
function expenditureLinks(basePath: string, canManage: boolean): FinanceLink[] {
  return [
    { href: basePath, label: "Dashboard", icon: LayoutDashboard, exact: true },
    ...(canManage
      ? [
          { href: `${basePath}/categories`, label: "Categories", icon: ReceiptText, exact: false },
          { href: `${basePath}/accounts`, label: "Payment Chart", icon: Wallet, exact: false },
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
          { href: `${basePath}/onboarding`, label: "Onboarding", icon: ClipboardList, exact: true },
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
  const active = links.some((link) =>
    link.exact ? pathname === link.href : pathname.startsWith(link.href),
  );

  return (
    <NavGroup active={active}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          {/* Marked active while the group is shut, so somebody who has collapsed Finance by
              hand can still see that the page they are on is inside it. */}
          <SidebarMenuButton className="justify-between" isActive={active}>
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
    </NavGroup>
  );
}
