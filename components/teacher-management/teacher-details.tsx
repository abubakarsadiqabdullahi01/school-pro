// components/teacher-management/teacher-details.tsx
"use client";

import { useState } from "react";
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
}

export function TeacherDetails({ teacher }: TeacherDetailsProps) {
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] =
    useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Handle password reset
  const handlePasswordReset = async () => {
    setIsResettingPassword(true);
    try {
      const result = await resetTeacherPassword(teacher.id);

      if (result.success) {
        setNewPassword(result.data?.newPassword || "");
        setShowNewPassword(true);
        toast.success("Password Reset", {
          description: "Teacher password has been successfully reset.",
        });
      } else {
        toast.error("Reset Failed", {
          description:
            result.error || "Failed to reset password. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      toast.error("Reset Failed", {
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Handle teacher deletion
  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteTeacher(teacher.id);

      if (result.success) {
        toast.success("Teacher Deleted", {
          description: `${teacher.fullName} has been successfully removed.`,
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
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {teacher.fullName}
          </h2>
          <p className="text-muted-foreground">
            <span className="font-medium">Staff ID: </span>
            {teacher.staffId} •{" "}
            <span className="font-medium">{teacher.school.name}</span>
            {currentTerm && (
              <Badge
                variant="secondary"
                className="ml-2 bg-blue-100 text-blue-800"
              >
                Current Term: {currentTerm}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/admin/teachers/${teacher.id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Teacher
            </Link>
          </Button>
          <Dialog
            open={isResetPasswordDialogOpen}
            onOpenChange={setIsResetPasswordDialogOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Key className="mr-2 h-4 w-4" />
                Reset Password
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Reset Password for {teacher.firstName}
                </DialogTitle>
                <DialogDescription>
                  This will reset the teacher's password to a temporary value.
                  They will be required to change it on their first login.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to proceed?
                  </p>
                  {showNewPassword && (
                    <div className="p-3 bg-muted rounded-md space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Temporary Password:</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(newPassword)}
                        >
                          Copy
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm bg-background px-2 py-1 rounded border">
                          {newPassword}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowNewPassword(false)}
                        >
                          Hide
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsResetPasswordDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handlePasswordReset}
                  disabled={isResettingPassword}
                  className="gap-2"
                >
                  {isResettingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reset Password
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick Stats */}
      <Card className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-muted/50">
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-primary">
              {totalClasses}
            </div>
            <p className="text-xs text-muted-foreground uppercase font-semibold">
              Total Classes
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              {currentTermClasses.length > 0 && (
                <Badge className="bg-green-100 text-green-800">
                  {currentTermClasses.length} Current
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-primary">
              {totalSubjects}
            </div>
            <p className="text-xs text-muted-foreground uppercase font-semibold">
              Total Subjects
            </p>
            {currentTermSubjects.length > 0 && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <Badge className="bg-blue-100 text-blue-800">
                  {currentTermSubjects.length} Current
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-primary">
              {teacher.assessmentsCount}
            </div>
            <p className="text-xs text-muted-foreground uppercase font-semibold">
              Assessments
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardContent className="p-6 text-center">
            <div className="text-3xl font-bold text-primary">
              {format(new Date(teacher.createdAt), "MMM yyyy")}
            </div>
            <p className="text-xs text-muted-foreground uppercase font-semibold">
              Joined
            </p>
          </CardContent>
        </Card>
      </Card>

      {/* Classes and Subjects Overview */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Classes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <CardTitle>Assigned Classes ({totalClasses})</CardTitle>
              {currentTerm && (
                <Badge variant="secondary" className="text-xs">
                  {currentTerm}
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(
                  `/dashboard/admin/teachers/${teacher.id}/assign-class`,
                )
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Manage Classes
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {teacher.classes.length > 0 ? (
              <div className="space-y-2">
                {currentTermClasses.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-sm uppercase text-muted-foreground mb-2">
                      Current Term Classes
                    </h4>
                    <div className="space-y-2">
                      {currentTermClasses.map((cls) => (
                        <div
                          key={cls.id}
                          className="flex items-center justify-between p-3 bg-green-50 border rounded-md"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{cls.className}</span>
                            <span className="text-sm text-muted-foreground">
                              {cls.termName} - {cls.sessionName}
                            </span>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive h-6 w-6"
                                  onClick={() =>
                                    handleUnassignClass(
                                      cls.id,
                                      cls.className,
                                      cls.isCurrent || false,
                                    )
                                  }
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Remove class assignment</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {teacher.classes.filter((c) => !c.isCurrent).length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm uppercase text-muted-foreground mb-2">
                      Other Terms
                    </h4>
                    <div className="space-y-2">
                      {teacher.classes
                        .filter((c) => !c.isCurrent)
                        .map((cls) => (
                          <div
                            key={cls.id}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">
                                {cls.className}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {cls.termName} - {cls.sessionName}
                              </span>
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground h-6 w-6 cursor-not-allowed"
                                    disabled
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Cannot remove past term assignments</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No classes assigned</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(
                      `/dashboard/admin/teachers/${teacher.id}/assign-class`,
                    )
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Assign Class
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subjects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <CardTitle>Assigned Subjects ({totalSubjects})</CardTitle>
              {currentTerm && (
                <Badge variant="secondary" className="text-xs">
                  {currentTerm}
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(
                  `/dashboard/admin/teachers/${teacher.id}/assign-subject`,
                )
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Manage Subjects
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {teacher.subjects.length > 0 ? (
              <div className="space-y-2">
                {currentTermSubjects.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-sm uppercase text-muted-foreground mb-2">
                      Current Term Subjects
                    </h4>
                    <div className="space-y-2">
                      {currentTermSubjects.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between p-3 bg-blue-50 border rounded-md"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{sub.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {sub.code} - {sub.termName}
                            </span>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive h-6 w-6"
                                  onClick={() =>
                                    handleUnassignSubject(
                                      sub.id,
                                      sub.name,
                                      sub.isCurrent,
                                    )
                                  }
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Remove subject assignment</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {teacher.subjects.filter((s) => !s.isCurrent).length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm uppercase text-muted-foreground mb-2">
                      Other Terms
                    </h4>
                    <div className="space-y-2">
                      {teacher.subjects
                        .filter((s) => !s.isCurrent)
                        .map((sub) => (
                          <div
                            key={sub.id}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">
                                {sub.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {sub.code} - {sub.termName}
                              </span>
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground h-6 w-6 cursor-not-allowed"
                                    disabled
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Cannot remove past term assignments</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No subjects assigned</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(
                      `/dashboard/admin/teachers/${teacher.id}/assign-subject`,
                    )
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Assign Subject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
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
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the
              teacher account and remove all associated data from our servers.
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
              {isDeleting ? "Deleting..." : "Delete Teacher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
