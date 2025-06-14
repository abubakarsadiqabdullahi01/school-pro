"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Download, MoreHorizontal, Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { getStudents } from "@/app/actions/student-management";
import { toast } from "sonner";
import { debounce } from "lodash";
import { TableSkeleton } from "@/components/ui/loading-skeleton";

interface Student {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  fullName: string;
  class: string;
  gender: string;
  state: string;
  lga: string;
  address: string;
  year: number | null;
  parentName?: string;
  registrationDate: string;
  isActive: boolean;
  recentAssessments: {
    id: string;
    subject: string;
    totalScore: string; // Can be number or "ABS", "EXM", "UNPUB"
    grade: string;
    remark: string;
    term: string;
    ca1?: number;
    ca2?: number;
    ca3?: number;
    exam?: number;
    isAbsent: boolean;
    isExempt: boolean;
    isPublished: boolean;
  }[];
  recentPayments: {
    id: string;
    amount: number;
    paymentDate: string;
    status: string;
  }[];
}

interface ClassOption {
  id: string;
  name: string;
}

interface PaginationData {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function StudentList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned" | "not_assigned">("all");
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

  // Debounced search handler
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setSearchQuery(query);
    }, 300),
    []
  );

  // Fetch students when filters or page change
  useEffect(() => {
    const fetchStudents = async () => {
      setIsLoading(true);
      try {
        const result = await getStudents({
          classId: classFilter !== "all" ? classFilter : undefined,
          assignmentStatus: assignmentFilter,
          page: pagination.page,
          pageSize: pagination.pageSize,
        });
        if (result.success && result.data) {
          setStudents(result.data.students);
          setClasses(result.data.classes);
          setPagination(result.data.pagination);
        } else {
          toast.error("Error", {
            description: result.error || "Failed to fetch students",
          });
        }
      } catch (error) {
        console.error("Error fetching students:", error);
        toast.error("Error", {
          description: "Failed to fetch students. Please try again.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudents();
  }, [classFilter, assignmentFilter, pagination.page]);

  // Filter students based on search query (client-side)
  const filteredStudents = students.filter((student) =>
    student.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.admissionNo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-6"
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Students</CardTitle>
            <CardDescription>Manage all students in the system</CardDescription>
          </div>
          <Button asChild>
            <Link href="/dashboard/admin/students/create">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Student
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or admission number..."
                className="pl-8"
                onChange={(e) => debouncedSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={assignmentFilter}
                onValueChange={(value) => setAssignmentFilter(value as "all" | "assigned" | "not_assigned")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Students</SelectItem>
                  <SelectItem value="assigned">Assigned to Class</SelectItem>
                  <SelectItem value="not_assigned">Not Assigned</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div>
              <TableSkeleton />
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Admission No.</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>LGA</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Parent/Guardian</TableHead>
                      <TableHead>Recent Assessment</TableHead>
                      <TableHead>Recent Payment</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.admissionNo}</TableCell>
                          <TableCell>
                            {student.firstName} {student.lastName}
                          </TableCell>
                          <TableCell>{student.class}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                student.gender === "MALE"
                                  ? "default"
                                  : student.gender === "FEMALE"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {student.gender}
                            </Badge>
                          </TableCell>
                          <TableCell>{student.state}</TableCell>
                          <TableCell>{student.lga}</TableCell>
                          <TableCell>{student.address}</TableCell>
                          <TableCell>{student.year || "N/A"}</TableCell>
                          <TableCell>{student.parentName || "Not Assigned"}</TableCell>
                          <TableCell>
  {student.recentAssessments.length > 0 ? (
    <div className="text-sm">
      <div className="font-medium">
        {student.recentAssessments[0].subject}: {student.recentAssessments[0].totalScore}
      </div>
      <div className="text-muted-foreground">
        Grade: {student.recentAssessments[0].grade}
      </div>
      {student.recentAssessments[0].totalScore !== "ABS" && 
       student.recentAssessments[0].totalScore !== "EXM" && 
       student.recentAssessments[0].totalScore !== "UNPUB" && (
        <div className="text-xs text-muted-foreground">
          CA: {(student.recentAssessments[0].ca1 || 0) + (student.recentAssessments[0].ca2 || 0) + (student.recentAssessments[0].ca3 || 0)} | 
          Exam: {student.recentAssessments[0].exam || 0}
        </div>
      )}
    </div>
  ) : (
    "No assessments"
  )}
</TableCell>
                          <TableCell>
                            {student.recentPayments.length > 0 ? (
                              `${student.recentPayments[0].feeName}: ${student.recentPayments[0].amount} (${student.recentPayments[0].status})`
                            ) : (
                              "N/A"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/admin/students/${student.id}`}>
                                    View Details
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/admin/students/${student.id}/edit`}>
                                    Edit Student
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/admin/students/${student.id}/academic-records`}>
                                    View Academic Records
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/admin/students/${student.id}/payments`}>
                                    View Payment History
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">
                                  Deactivate Student
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={12} className="h-24 text-center">
                          {searchQuery || classFilter !== "all" || assignmentFilter !== "all"
                            ? "No students found matching your filters."
                            : "No students found in the system."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {pagination.totalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() =>
                          setPagination((prev) => ({
                            ...prev,
                            page: Math.max(1, prev.page - 1),
                          }))
                        }
                        className={pagination.page === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() =>
                            setPagination((prev) => ({ ...prev, page }))
                          }
                          isActive={page === pagination.page}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() =>
                          setPagination((prev) => ({
                            ...prev,
                            page: Math.min(pagination.totalPages, prev.page + 1),
                          }))
                        }
                        className={pagination.page === pagination.totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}