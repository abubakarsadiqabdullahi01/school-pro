// components/student-management/student-details.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Edit,
  Phone,
  MapPin,
  Calendar,
  User,
  GraduationCap,
  FileText,
  CreditCard,
  MoreHorizontal,
  UserCheck,
  UserX,
  BookOpen,
  Users,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getStudent,
  toggleStudentStatus,
} from "@/app/actions/student-management";
import { toast } from "sonner";
import { FormSkeleton } from "@/components/ui/loading-skeleton";

interface StudentDetailsProps {
  studentId: string;
}

interface StudentData {
  id: string;
  userId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  state: string;
  lga: string;
  address: string;
  phone: string;
  year: number | null;
  isActive: boolean;
  currentClass: {
    id: string;
    name: string;
    termId: string;
    termName: string;
    sessionName: string;
  } | null;
  parents: Array<{
    id: string;
    name: string;
    relationship: string;
    phone: string;
  }>;
  assessments: Array<{
    id: string;
    subject: string;
    ca1: number | null;
    ca2: number | null;
    ca3: number | null;
    exam: number | null;
    totalScore: string;
    term: string;
    session: string;
    isAbsent: boolean;
    isExempt: boolean;
    isPublished: boolean;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    paymentDate: string;
    receiptNo: string | null;
  }>;
  enrollmentHistory: Array<{
    id: string;
    className: string;
    termName: string;
    sessionName: string;
    action: string;
    createdAt: Date;
  }>;
  createdAt: Date;
}

export default function StudentDetails({ studentId }: StudentDetailsProps) {
  const [student, setStudent] = useState<StudentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchStudent = async () => {
      setIsLoading(true);
      try {
        // CORRECT: Pass an object with studentId property
        const result = await getStudent({ studentId });

        if (result.success && result.data) {
          setStudent(result.data as StudentData);
        } else {
          toast.error("Error", {
            description: result.error || "Failed to fetch student details",
          });
          router.push("/dashboard/admin/students");
        }
      } catch (error) {
        console.error("Error fetching student:", error);
        toast.error("Error", {
          description: "Failed to fetch student details. Please try again.",
        });
        router.push("/dashboard/admin/students");
      } finally {
        setIsLoading(false);
      }
    };

    if (studentId) {
      fetchStudent();
    }
  }, [studentId, router]);

  const handleToggleStatus = async () => {
    if (!student) return;

    setIsToggling(true);
    try {
      const result = await toggleStudentStatus(studentId);
      if (result.success) {
        setStudent((prev) =>
          prev ? { ...prev, isActive: result.data.isActive } : null,
        );
        toast.success("Success", {
          description: result.data.message,
        });
      } else {
        toast.error("Error", {
          description: result.error || "Failed to update student status",
        });
      }
    } catch (error) {
      console.error("Error toggling student status:", error);
      toast.error("Error", {
        description: "Failed to update student status. Please try again.",
      });
    } finally {
      setIsToggling(false);
    }
  };

  if (isLoading) {
    return <FormSkeleton />;
  }

  if (!student) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-muted-foreground">Student not found</p>
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/admin/students")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Students
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate total assessments
  const totalAssessments = student.assessments.length;
  const publishedAssessments = student.assessments.filter(
    (a) => a.isPublished,
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-6 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{student.fullName}</h1>
            <p className="text-muted-foreground">
              Admission No: {student.admissionNo} •{" "}
              {student.isActive ? "Active" : "Inactive"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/dashboard/admin/students/${student.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Student
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link
                  href={`/dashboard/admin/students/${student.id}/academic-records`}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Academic Records
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleToggleStatus}
                disabled={isToggling}
                className={
                  student.isActive ? "text-destructive" : "text-green-600"
                }
              >
                {student.isActive ? (
                  <>
                    <UserX className="h-4 w-4 mr-2" />
                    Deactivate Student
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Activate Student
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    First Name
                  </label>
                  <p className="text-sm">{student.firstName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Last Name
                  </label>
                  <p className="text-sm">{student.lastName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Date of Birth
                  </label>
                  <p className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {student.dateOfBirth || "Not specified"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Gender
                  </label>
                  <p className="text-sm">
                    {student.gender === "MALE"
                      ? "Male"
                      : student.gender === "FEMALE"
                        ? "Female"
                        : student.gender === "OTHER"
                          ? "Other"
                          : "Not specified"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Phone
                  </label>
                  <p className="text-sm flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {student.phone || "Not specified"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    State
                  </label>
                  <p className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {student.state || "Not specified"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    LGA
                  </label>
                  <p className="text-sm">{student.lga || "Not specified"}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Address
                  </label>
                  <p className="text-sm">
                    {student.address || "Not specified"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Academic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Academic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Current Class
                  </label>
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm">
                      {student.currentClass?.name || "Not assigned"}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Current Term
                  </label>
                  <p className="text-sm">
                    {student.currentClass?.termName || "Not assigned"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Session
                  </label>
                  <p className="text-sm">
                    {student.currentClass?.sessionName || "Not assigned"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Admission Year
                  </label>
                  <p className="text-sm">{student.year || "Not specified"}</p>
                </div>
              </div>

              {/* Assessment Stats */}
              {totalAssessments > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <label className="text-sm font-medium text-muted-foreground">
                    Assessment Summary
                  </label>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {totalAssessments} assessments
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">
                        {publishedAssessments} published
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Assessments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Assessments
              </CardTitle>
              <CardDescription>Latest assessment records</CardDescription>
            </CardHeader>
            <CardContent>
              {student.assessments.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>CA1</TableHead>
                        <TableHead>CA2</TableHead>
                        <TableHead>CA3</TableHead>
                        <TableHead>Exam</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Term</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {student.assessments.slice(0, 5).map((assessment) => (
                        <TableRow key={assessment.id}>
                          <TableCell className="font-medium">
                            {assessment.subject}
                          </TableCell>
                          <TableCell>
                            {assessment.ca1?.toFixed(1) || "-"}
                          </TableCell>
                          <TableCell>
                            {assessment.ca2?.toFixed(1) || "-"}
                          </TableCell>
                          <TableCell>
                            {assessment.ca3?.toFixed(1) || "-"}
                          </TableCell>
                          <TableCell>
                            {assessment.exam?.toFixed(1) || "-"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {assessment.totalScore}
                          </TableCell>
                          <TableCell>{assessment.term}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                assessment.isAbsent
                                  ? "destructive"
                                  : assessment.isExempt
                                    ? "secondary"
                                    : !assessment.isPublished
                                      ? "outline"
                                      : "default"
                              }
                              className="text-xs"
                            >
                              {assessment.isAbsent
                                ? "Absent"
                                : assessment.isExempt
                                  ? "Exempt"
                                  : !assessment.isPublished
                                    ? "Draft"
                                    : "Published"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No assessments found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Assessment records will appear here when added
                  </p>
                </div>
              )}

              {student.assessments.length > 5 && (
                <div className="mt-4 text-center">
                  <Button variant="ghost" size="sm" asChild>
                    <Link
                      href={`/dashboard/admin/students/${student.id}/academic-records`}
                    >
                      View All Assessments
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Student Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge
                variant={student.isActive ? "default" : "destructive"}
                className="mb-4 text-sm"
              >
                {student.isActive ? "Active" : "Inactive"}
              </Badge>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    Registration Date:
                  </span>
                  <p>
                    {new Date(student.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Admission No:</span>
                  <p className="font-mono text-sm bg-muted p-2 rounded mt-1">
                    {student.admissionNo}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Student ID:</span>
                  <p className="font-mono text-sm text-muted-foreground">
                    {student.id}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parents/Guardians */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Parents/Guardians
              </CardTitle>
            </CardHeader>
            <CardContent>
              {student.parents.length > 0 ? (
                <div className="space-y-3">
                  {student.parents.map((parent) => (
                    <div
                      key={parent.id}
                      className="p-3 border rounded-lg bg-card"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{parent.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Relationship: {parent.relationship}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {parent.relationship}
                        </Badge>
                      </div>
                      {parent.phone && (
                        <p className="text-xs flex items-center gap-1 mt-2 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {parent.phone}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No parents/guardians assigned
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add parents in student edit
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Recent Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {student.payments.length > 0 ? (
                <div className="space-y-3">
                  {student.payments.slice(0, 3).map((payment) => (
                    <div
                      key={payment.id}
                      className="p-3 border rounded-lg bg-card"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">
                            ₦{payment.amount.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {payment.paymentDate}
                          </p>
                        </div>
                        <Badge
                          variant={
                            payment.status === "COMPLETED"
                              ? "default"
                              : payment.status === "PENDING"
                                ? "secondary"
                                : payment.status === "FAILED"
                                  ? "destructive"
                                  : "outline"
                          }
                          className="text-xs"
                        >
                          {payment.status}
                        </Badge>
                      </div>
                      {payment.receiptNo && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Receipt: {payment.receiptNo}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No payments found
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Payment records will appear here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                asChild
                variant="outline"
                className="w-full justify-start"
              >
                <Link href={`/dashboard/admin/students/${student.id}/edit`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Student
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full justify-start"
              >
                <Link
                  href={`/dashboard/admin/students/${student.id}/academic-records`}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Academic Records
                </Link>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleToggleStatus}
                disabled={isToggling}
              >
                {student.isActive ? (
                  <>
                    <UserX className="h-4 w-4 mr-2" />
                    Deactivate Student
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Activate Student
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
