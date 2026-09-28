// components/teacher-management/teacher-details.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Filter,
  Loader2,
  MoreHorizontal,
  Search,
  UserPlus,
  Calendar,
  Clock,
  Plus,
  X,
  Edit,
  Key,
  User,
  BookOpen,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ResetPasswordDialog } from "@/components/auth/reset-password-dialog";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  unassignTeacherFromClass,
  unassignTeacherFromSubject,
} from "@/app/actions/teacher-assignment";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  deleteTeacher,
  resetTeacherPassword,
} from "@/app/actions/teacher-management";
import { InfoGuide } from "@/components/ui/info-guide"

interface ClassInfo {
  id: string;
  classTermId: string;
  className: string;
  termName: string;
  sessionName: string;
  isCurrent?: boolean;
}

interface SubjectInfo {
  id: string;
  subjectId: string;
  name: string;
  code: string;
  termId: string;
  termName: string;
  sessionName: string;
  isCurrent: boolean;
}

interface Teacher {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  staffId: string;
  department: string;
  qualification: string;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth: Date | null;
  state: string;
  lga: string;
  address: string;
  school: {
    id: string;
    name: string;
    code: string;
  };
  classes: ClassInfo[];
  subjects: SubjectInfo[];
  assessmentsCount: number;
  createdAt: Date;
}

interface TeacherDetailsProps {
  teacher: Teacher;
  /** Edit and password reset are HR's; the Exams Officer comes here for assignments. */
  canManageTeachers?: boolean;
}

/** One assignment row, whether it came from a class or a subject. */
interface AssignmentRow {
  /** The id `onUnassign` is called with — a classTermId or a subject assignment id. */
  id: string;
  title: string;
  subtitle: string;
  termLabel: string;
  isCurrent: boolean;
}

const PAGE_SIZE = 5;

/**
 * A teacher's assignments, searchable, filterable by term and paged.
 *
 * Both panels used to print every row they had. A teacher carrying three terms of history
 * had 21 subject rows stacked down the page, which pushed the basic information card below
 * two screens of scrolling and made the current term — the only part anyone usually wants —
 * no easier to find than the rest.
 *
 * Current-term rows still sort to the top and keep their accent, so the default view answers
 * "what are they teaching now" without touching the controls.
 */
function AssignmentPanel({
  icon,
  title,
  rows,
  termBadge,
  manageLabel,
  onManage,
  onUnassign,
  emptyIcon,
  emptyText,
  emptyActionLabel,
  accentClass,
  searchPlaceholder,
}: {
  icon: React.ReactNode;
  title: string;
  rows: AssignmentRow[];
  termBadge?: string;
  manageLabel: string;
  onManage: () => void;
  onUnassign: (row: AssignmentRow) => void;
  emptyIcon: React.ReactNode;
  emptyText: string;
  emptyActionLabel: string;
  accentClass: string;
  searchPlaceholder: string;
}) {
  const [query, setQuery] = useState("");
  const [termFilter, setTermFilter] = useState("ALL");
  const [page, setPage] = useState(0);

  const terms = useMemo(
    () => [...new Set(rows.map((row) => row.termLabel))],
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = rows.filter((row) => {
      if (termFilter === "CURRENT" && !row.isCurrent) return false;
      if (termFilter !== "ALL" && termFilter !== "CURRENT" && row.termLabel !== termFilter) {
        return false;
      }
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.subtitle.toLowerCase().includes(needle)
      );
    });

    // Current term first, then alphabetically — so the useful rows are on page one.
    return matched.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [rows, query, termFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A filter that shortens the list can leave the cursor past the end.
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const resetTo = (fn: () => void) => {
    fn();
    setPage(0);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <CardTitle className="text-base">
            {title} ({rows.length})
          </CardTitle>
          {termBadge && (
            <Badge variant="secondary" className="text-xs">
              {termBadge}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onManage} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          {manageLabel}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {emptyIcon}
            <p className="text-lg">{emptyText}</p>
            <Button variant="outline" size="sm" onClick={onManage} className="mt-2">
              <Plus className="mr-2 h-4 w-4" />
              {emptyActionLabel}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => resetTo(() => setQuery(event.target.value))}
                  placeholder={searchPlaceholder}
                  className="h-9 pl-8"
                />
              </div>
              <Select
                value={termFilter}
                onValueChange={(value) => resetTo(() => setTermFilter(value))}
              >
                <SelectTrigger className="h-9 w-full sm:w-[190px]">
                  <Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="All terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All terms</SelectItem>
                  <SelectItem value="CURRENT">Current term only</SelectItem>
                  {terms.map((term) => (
                    <SelectItem key={term} value={term}>
                      {term}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {visible.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing matches that search.
              </p>
            ) : (
              <div className="space-y-2">
                {visible.map((row) => (
                  <div
                    key={row.id}
                    className={`flex items-center justify-between gap-2 rounded-md border p-2.5 ${
                      row.isCurrent ? accentClass : "bg-muted/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={
                              row.isCurrent
                                ? "h-6 w-6 shrink-0 text-destructive"
                                : "h-6 w-6 shrink-0 cursor-not-allowed text-muted-foreground"
                            }
                            disabled={!row.isCurrent}
                            onClick={() => onUnassign(row)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {row.isCurrent
                              ? "Remove this assignment"
                              : "Past terms are kept as history and cannot be changed"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {filtered.length === 0
                  ? "No results"
                  : `${safePage * PAGE_SIZE + 1}–${Math.min(
                      (safePage + 1) * PAGE_SIZE,
                      filtered.length,
                    )} of ${filtered.length}`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  Previous
                </Button>
                <span className="px-1 tabular-nums">
                  {safePage + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function TeacherDetails({ teacher, canManageTeachers = true }: TeacherDetailsProps) {
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle teacher deletion
  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteTeacher(teacher.id);

      if (result.success) {
        // Archiving is a real outcome here, not a failure — see deleteTeacher.
        const archived = "isArchived" in result && result.isArchived;
        toast.success(archived ? "Teacher Archived" : "Teacher Deleted", {
          description: archived
            ? ("message" in result && result.message) ||
              `${teacher.fullName} has been deactivated. Their records are kept.`
            : `${teacher.fullName} has been successfully removed.`,
        });
        setIsDeleteDialogOpen(false);
        router.push("/dashboard/admin/teachers");
      } else {
        toast.error("Delete Failed", {
          description:
            result.error || "Failed to delete teacher. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error deleting teacher:", error);
      toast.error("Delete Failed", {
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle unassigning a class
  const handleUnassignClass = async (
    classTermId: string,
    className: string,
    isCurrent: boolean,
  ) => {
    if (!isCurrent) {
      toast.error("Cannot Unassign", {
        description:
          "Cannot unassign teachers from past terms to maintain historical records.",
      });
      return;
    }

    try {
      const result = await unassignTeacherFromClass(classTermId);

      if (result.success) {
        toast.success("Class Unassigned", {
          description:
            result.message ||
            "The class has been successfully unassigned from the teacher.",
        });
        router.refresh();
      } else {
        toast.error("Unassign Failed", {
          description:
            result.error || "Failed to unassign class. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error unassigning class:", error);
      toast.error("Unassign Failed", {
        description: "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handle unassigning a subject
  const handleUnassignSubject = async (
    subjectAssignmentId: string,
    subjectName: string,
    isCurrent: boolean,
  ) => {
    if (!isCurrent) {
      toast.error("Cannot Unassign", {
        description:
          "Cannot unassign teachers from past term subjects to maintain historical records.",
      });
      return;
    }

    try {
      const result = await unassignTeacherFromSubject(subjectAssignmentId);

      if (result.success) {
        toast.success("Subject Unassigned", {
          description:
            result.message ||
            "The subject has been successfully unassigned from the teacher.",
        });
        router.refresh();
      } else {
        toast.error("Unassign Failed", {
          description:
            result.error || "Failed to unassign subject. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error unassigning subject:", error);
      toast.error("Unassign Failed", {
        description: "An unexpected error occurred. Please try again.",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // Get current term from classes
  const currentTerm = teacher.classes.find((c) => c.isCurrent)?.termName;
  const currentTermClasses = teacher.classes.filter((c) => c.isCurrent);
  const currentTermSubjects = teacher.subjects.filter((s) => s.isCurrent);

  // Get total counts
  const totalClasses = teacher.classes.length;
  const totalSubjects = teacher.subjects.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* Avatar was imported here but never rendered, so a teacher's photo could be
              uploaded and then shown nowhere on their own page. Initials keep the header
              the same shape when there is no photo. */}
          <Avatar className="h-16 w-16 border">
            <AvatarImage src={teacher.avatarUrl} alt="" />
            <AvatarFallback className="text-lg">
              {`${teacher.firstName[0] ?? ""}${teacher.lastName[0] ?? ""}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-3xl font-bold tracking-tight">
                {teacher.fullName}
              </h2>
              <InfoGuide guideKey="admin.teachers" />
            </div>
            <p className="text-muted-foreground">
              <span className="font-medium">Staff ID: </span>
              {teacher.staffId} •{" "}
              <span className="font-medium">{teacher.school.name}</span>
              {currentTerm && (
                <Badge
                  variant="secondary"
                  className="ml-2 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                >
                  Current Term: {currentTerm}
                </Badge>
              )}
            </p>
          </div>
        </div>
        {canManageTeachers && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/admin/teachers/${teacher.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Teacher
              </Link>
            </Button>
            <ResetPasswordDialog
              personName={teacher.firstName}
              onReset={() => resetTeacherPassword(teacher.id)}
              passwordKind="generated"
            />
          </div>
        )}
      </div>

      {/* Quick stats. Deliberately small: four numbers do not need a quarter of the screen,
          and the assignment panels below are what the page is actually for. The outer Card
          that used to wrap these was drawing a second border around four bordered cards. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="bg-muted/50">
          <CardContent className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Classes
              </p>
              <p className="text-xl font-bold leading-tight text-primary tabular-nums">
                {totalClasses}
              </p>
            </div>
            {currentTermClasses.length > 0 && (
              <Badge className="shrink-0 bg-green-500/10 text-xs text-green-700 dark:text-green-400">
                {currentTermClasses.length} now
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardContent className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Subjects
              </p>
              <p className="text-xl font-bold leading-tight text-primary tabular-nums">
                {totalSubjects}
              </p>
            </div>
            {currentTermSubjects.length > 0 && (
              <Badge className="shrink-0 bg-blue-500/10 text-xs text-blue-700 dark:text-blue-400">
                {currentTermSubjects.length} now
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardContent className="p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Assessments
            </p>
            <p className="text-xl font-bold leading-tight text-primary tabular-nums">
              {teacher.assessmentsCount}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardContent className="p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Joined
            </p>
            <p className="text-xl font-bold leading-tight text-primary">
              {format(new Date(teacher.createdAt), "MMM yyyy")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Classes and Subjects */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AssignmentPanel
          icon={<Calendar className="h-4 w-4" />}
          title="Assigned Classes"
          termBadge={currentTerm}
          rows={teacher.classes.map((cls) => ({
            id: cls.id,
            title: cls.className,
            subtitle: `${cls.termName} · ${cls.sessionName}`,
            termLabel: `${cls.termName} · ${cls.sessionName}`,
            isCurrent: Boolean(cls.isCurrent),
          }))}
          manageLabel="Manage Classes"
          onManage={() =>
            router.push(`/dashboard/admin/teachers/${teacher.id}/assign-class`)
          }
          onUnassign={(row) => handleUnassignClass(row.id, row.title, row.isCurrent)}
          emptyIcon={<Calendar className="mx-auto mb-4 h-12 w-12 opacity-50" />}
          emptyText="No classes assigned"
          emptyActionLabel="Assign Class"
          accentClass="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40"
          searchPlaceholder="Search classes..."
        />

        <AssignmentPanel
          icon={<BookOpen className="h-4 w-4" />}
          title="Assigned Subjects"
          termBadge={currentTerm}
          rows={teacher.subjects.map((sub) => ({
            id: sub.id,
            title: sub.name,
            subtitle: `${sub.code} · ${sub.termName} · ${sub.sessionName}`,
            termLabel: `${sub.termName} · ${sub.sessionName}`,
            isCurrent: sub.isCurrent,
          }))}
          manageLabel="Manage Subjects"
          onManage={() =>
            router.push(`/dashboard/admin/teachers/${teacher.id}/assign-subject`)
          }
          onUnassign={(row) => handleUnassignSubject(row.id, row.title, row.isCurrent)}
          emptyIcon={<BookOpen className="mx-auto mb-4 h-12 w-12 opacity-50" />}
          emptyText="No subjects assigned"
          emptyActionLabel="Assign Subject"
          accentClass="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40"
          searchPlaceholder="Search subjects..."
        />
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Full Name
              </label>
              <div className="text-lg font-semibold">{teacher.fullName}</div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Department
              </label>
              <div className="text-lg">
                {teacher.department || "Not specified"}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Qualification
              </label>
              <div className="text-lg">
                {teacher.qualification || "Not specified"}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Gender
              </label>
              <div className="text-lg">
                {teacher.gender === "MALE"
                  ? "Male"
                  : teacher.gender === "FEMALE"
                    ? "Female"
                    : teacher.gender === "OTHER"
                      ? "Other"
                      : "Not specified"}
              </div>
            </div>
            {teacher.dateOfBirth && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Date of Birth
                </label>
                <div className="text-lg">
                  {format(new Date(teacher.dateOfBirth), "MMM dd, yyyy")}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <div className="text-lg break-all">{teacher.email}</div>
            </div>
            {teacher.phone && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Phone
                </label>
                <div className="text-lg">{teacher.phone}</div>
              </div>
            )}
            {teacher.address && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Address
                </label>
                <div className="text-lg">{teacher.address}</div>
                {(teacher.state || teacher.lga) && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {teacher.state && `${teacher.state}, `}
                    {teacher.lga && ` ${teacher.lga}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this teacher?</DialogTitle>
            <DialogDescription>
              {teacher.assessmentsCount > 0
                ? `This teacher has entered ${teacher.assessmentsCount} assessment records. They will be archived rather than deleted: their login is disabled and they leave the active list, but the scores they entered stay on the students' records.`
                : "They have entered no scores, so the teacher account and login will be permanently removed. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="font-medium">{teacher.fullName}</p>
              <p className="text-sm text-muted-foreground">
                Staff ID: {teacher.staffId}
              </p>
              {teacher.email && (
                <p className="text-sm text-muted-foreground">{teacher.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm uppercase">
                Current Assignments
              </h4>
              {totalClasses > 0 && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium">Classes: {totalClasses}</p>
                  <ul className="list-disc pl-4 mt-1 space-y-1">
                    {teacher.classes.slice(0, 3).map((cls) => (
                      <li key={cls.id}>
                        {cls.className} ({cls.termName})
                      </li>
                    ))}
                    {totalClasses > 3 && (
                      <li>...and {totalClasses - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
              {totalSubjects > 0 && (
                <div className="text-sm text-muted-foreground mt-2">
                  <p className="font-medium">Subjects: {totalSubjects}</p>
                  <ul className="list-disc pl-4 mt-1 space-y-1">
                    {teacher.subjects.slice(0, 3).map((sub) => (
                      <li key={sub.id}>
                        {sub.name} ({sub.code})
                      </li>
                    ))}
                    {totalSubjects > 3 && (
                      <li>...and {totalSubjects - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
              {totalClasses === 0 && totalSubjects === 0 && (
                <p className="text-sm text-muted-foreground">
                  No current assignments - safe to delete
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="gap-1"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isDeleting
                ? "Working..."
                : teacher.assessmentsCount > 0
                  ? "Archive Teacher"
                  : "Delete Teacher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
