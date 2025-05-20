"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Edit, Loader2, Mail, MapPin, Phone, Trash2, Unlink, User, Book, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactSelect from "react-select"; // Renamed to avoid conflict
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { unlinkStudentFromParent, deleteParent, linkStudentToParent, getUnlinkedStudents } from "@/app/actions/parent-management";

// Form schema for linking a student
const linkStudentSchema = z.object({
  studentId: z.string().min(1, "Please select a student"),
  relationship: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"], {
    message: "Please select a relationship",
  }),
});

type LinkStudentFormValues = z.infer<typeof linkStudentSchema>;

interface ParentDetailsProps {
  parent: {
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    emailCredentialId: string;
    phone: string;
    occupation: string;
    gender: "MALE" | "FEMALE" | "OTHER" | null;
    state: string;
    lga: string;
    address: string;
    school: {
      id: string;
      name: string;
      code: string;
    };
    students: Array<{
      linkId: string;
      studentId: string;
      name: string;
      admissionNo: string;
      gender: "MALE" | "FEMALE" | "OTHER" | null;
      dateOfBirth?: string;
      relationship: string;
      class: {
        name: string;
        term: string;
        session: string;
      } | null;
      assessments: Array<{
        id: string;
        subject: string;
        totalScore: number;
        grade: string;
        date: string;
      }>;
      payments: Array<{
        id: string;
        amount: number;
        status: string;
        date: string;
      }>;
    }>;
    createdAt: string;
  };
}

export function ParentDetails({ parent: initialParent }: ParentDetailsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isUnlinkDialogOpen, setIsUnlinkDialogOpen] = useState(false);
  const [studentToUnlink, setStudentToUnlink] = useState<{
    linkId: string;
    name: string;
    admissionNo: string;
  } | null>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [activeStudentTab, setActiveStudentTab] = useState<{ [key: string]: string }>({}); // Added state

  const { data: parent = initialParent } = useQuery({
    queryKey: ["parent-details", initialParent.id],
    queryFn: async () => {
      const response = await fetch(`/api/admin/parents/${initialParent.id}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialParent,
  });

  // Fetch unlinked students
  const { data: students = [], isLoading: isStudentsLoading } = useQuery({
    queryKey: ["unlinked-students", parent.school.id, studentSearch],
    queryFn: async () => {
      const result = await getUnlinkedStudents(parent.school.id, studentSearch);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  // Form setup
  const form = useForm<LinkStudentFormValues>({
    resolver: zodResolver(linkStudentSchema),
    defaultValues: {
      studentId: "",
      relationship: undefined,
    },
  });

  // Mutations
  const unlinkMutation = useMutation({
    mutationFn: unlinkStudentFromParent,
    onSuccess: async (result) => {
      if (result.success) {
        toast.success("Student Unlinked", {
          description: "The student has been successfully unlinked from this parent.",
        });
        setIsUnlinkDialogOpen(false);
        setStudentToUnlink(null);
        await queryClient.invalidateQueries({ queryKey: ["parent-details", parent.id] });
      } else {
        toast.error("Unlink Failed", { description: result.error });
      }
    },
    onError: () => {
      toast.error("Unlink Failed", { description: "An unexpected error occurred." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteParent,
    onSuccess: async (result) => {
      if (result.success) {
        toast.success("Parent Deleted", {
          description: "The parent has been successfully deleted.",
        });
        router.push("/dashboard/admin/parents");
      } else {
        toast.error("Delete Failed", { description: result.error });
      }
    },
    onError: () => {
      toast.error("Delete Failed", { description: "An unexpected error occurred." });
    },
  });

  const linkMutation = useMutation({
    mutationFn: linkStudentToParent,
    onSuccess: async (result) => {
      if (result.success) {
        toast.success("Student Linked", {
          description: "The student has been successfully linked to the parent.",
        });
        setIsLinkDialogOpen(false);
        form.reset();
        await queryClient.invalidateQueries({ queryKey: ["parent-details", parent.id] });
        await queryClient.invalidateQueries({ queryKey: ["unlinked-students", parent.school.id] });
      } else {
        toast.error("Link Failed", { description: result.error });
      }
    },
    onError: () => {
      toast.error("Link Failed", { description: "An unexpected error occurred." });
    },
  });

  const handleUnlinkClick = (student: { linkId: string; name: string; admissionNo: string }) => {
    setStudentToUnlink(student);
    setIsUnlinkDialogOpen(true);
  };

  const handleLinkSubmit = (values: LinkStudentFormValues) => {
    linkMutation.mutate({
      parentId: parent.id,
      studentId: values.studentId,
      relationship: values.relationship,
    });
  };

  return (
    <>
      <div className="flex flex-col md:flex-row gap-6">
        <motion.div
          className="md:w-1/3 space-y-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Parent Information</CardTitle>
              <CardDescription>Basic details about the parent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center mb-6">
                <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <User size={40} />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Full Name</h3>
                <p>{parent.fullName}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Gender</h3>
                <p>
                  {parent.gender === "MALE"
                    ? "Male"
                    : parent.gender === "FEMALE"
                    ? "Female"
                    : parent.gender === "OTHER"
                    ? "Other"
                    : "Not specified"}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Occupation</h3>
                <p>{parent.occupation || "Not specified"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Registration Date</h3>
                <p>{format(new Date(parent.createdAt), "MMMM d, yyyy")}</p>
              </div>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Contact Information</h3>
                {parent.email && (
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{parent.email}</span>
                  </div>
                )}
                {parent.phone && (
                  <div className="flex items-center gap-2 mb-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{parent.phone}</span>
                  </div>
                )}
                {parent.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p>{parent.address}</p>
                      {(parent.state || parent.lga) && (
                        <p className="text-sm text-muted-foreground">
                          {parent.lga && `${parent.lga}, `}
                          {parent.state}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href={`/dashboard/admin/parents/${parent.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Parent
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(parent.id)}
              disabled={parent.students.length > 0 || deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Parent
            </Button>
            {parent.students.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                * Parent cannot be deleted while they have linked students
              </p>
            )}
          </div>
        </motion.div>
        <motion.div
          className="md:w-2/3"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Linked Students</CardTitle>
                  <CardDescription>Students associated with this parent</CardDescription>
                </div>
                <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">Link a Student</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                      <DialogTitle>Link Student to Parent</DialogTitle>
                      <DialogDescription>
                        Select a student and specify their relationship to {parent.fullName}.
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleLinkSubmit)} className="space-y-6">
                        <FormField
                          control={form.control}
                          name="studentId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Student</FormLabel>
                              <FormControl>
                                <ReactSelect
                                  isLoading={isStudentsLoading}
                                  options={students.map((student) => ({
                                    value: student.id,
                                    label: `${student.name} (Adm: ${student.admissionNo})`,
                                    student,
                                  }))}
                                  onInputChange={(input) => setStudentSearch(input)}
                                  onChange={(option) => field.onChange(option?.value || "")}
                                  placeholder="Search students..."
                                  isClearable
                                  formatOptionLabel={({ student }) => (
                                    <div className="flex flex-col">
                                      <span className="font-medium">{student.name}</span>
                                      <span className="text-sm text-muted-foreground">
                                        Adm: {student.admissionNo}
                                      </span>
                                      <span className="text-sm text-muted-foreground">
                                        Class: {student.className} ({student.term})
                                      </span>
                                    </div>
                                  )}
                                  classNamePrefix="react-select"
                                  noOptionsMessage={() =>
                                    isStudentsLoading
                                      ? "Loading students..."
                                      : "No unlinked students found"
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="relationship"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Relationship to Student</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select relationship" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="FATHER">Father</SelectItem>
                                  <SelectItem value="MOTHER">Mother</SelectItem>
                                  <SelectItem value="GUARDIAN">Guardian</SelectItem>
                                  <SelectItem value="OTHER">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsLinkDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" disabled={linkMutation.isPending}>
                            {linkMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Linking...
                              </>
                            ) : (
                              "Link Student"
                            )}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {parent.students.length > 0 ? (
                parent.students.map((student) => (
                  <Card key={student.studentId} className="mb-4">
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>{student.name}</CardTitle>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/dashboard/admin/students/${student.studentId}`}>
                              <User className="h-4 w-4" />
                              <span className="sr-only">View Student</span>
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleUnlinkClick({
                                linkId: student.linkId,
                                name: student.name,
                                admissionNo: student.admissionNo,
                              })
                            }
                          >
                            <Unlink className="h-4 w-4" />
                            <span className="sr-only">Unlink Student</span>
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Tabs
                        value={activeStudentTab[student.studentId] || "profile"}
                        onValueChange={(value) =>
                          setActiveStudentTab((prev) => ({ ...prev, [student.studentId]: value }))
                        }
                      >
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="profile">
                            <User className="h-4 w-4 mr-2" />
                            Profile
                          </TabsTrigger>
                          <TabsTrigger value="academics">
                            <Book className="h-4 w-4 mr-2" />
                            Academics
                          </TabsTrigger>
                          <TabsTrigger value="payments">
                            <DollarSign className="h-4 w-4 mr-2" />
                            Payments
                          </TabsTrigger>
                        </TabsList>
                        <motion.div
                          key={activeStudentTab[student.studentId] || "profile"}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <TabsContent value="profile">
                            <div className="space-y-4">
                              <div>
                                <h3 className="text-sm font-medium text-muted-foreground">
                                  Admission Number
                                </h3>
                                <p>{student.admissionNo}</p>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-muted-foreground">Gender</h3>
                                <p>
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
                                <h3 className="text-sm font-medium text-muted-foreground">
                                  Date of Birth
                                </h3>
                                <p>
                                  {student.dateOfBirth
                                    ? format(new Date(student.dateOfBirth), "MMMM d, yyyy")
                                    : "Not specified"}
                                </p>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-muted-foreground">
                                  Relationship
                                </h3>
                                <Badge variant="outline">{student.relationship}</Badge>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-muted-foreground">Class</h3>
                                <p>
                                  {student.class ? (
                                    <>
                                      {student.class.name}
                                      <span className="text-xs text-muted-foreground">
                                        {" "}
                                        ({student.class.term}, {student.class.session})
                                      </span>
                                    </>
                                  ) : (
                                    "Not assigned"
                                  )}
                                </p>
                              </div>
                            </div>
                          </TabsContent>
                          <TabsContent value="academics">
                            {student.assessments.length > 0 ? (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Subject</TableHead>
                                    <TableHead>Score</TableHead>
                                    <TableHead>Grade</TableHead>
                                    <TableHead>Date</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {student.assessments.map((assessment) => (
                                    <TableRow key={assessment.id}>
                                      <TableCell>{assessment.subject}</TableCell>
                                      <TableCell>{assessment.totalScore}</TableCell>
                                      <TableCell>{assessment.grade}</TableCell>
                                      <TableCell>
                                        {format(new Date(assessment.date), "MMM d, yyyy")}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <p className="text-muted-foreground">No assessments available.</p>
                            )}
                          </TabsContent>
                          <TabsContent value="payments">
                            {student.payments.length > 0 ? (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {student.payments.map((payment) => (
                                    <TableRow key={payment.id}>
                                      <TableCell>{payment.amount}</TableCell>
                                      <TableCell>
                                        <Badge
                                          variant={
                                            payment.status === "PAID"
                                              ? "default"
                                              : payment.status === "PENDING"
                                              ? "secondary"
                                              : "destructive"
                                          }
                                        >
                                          {payment.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        {format(new Date(payment.date), "MMM d, yyyy")}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <p className="text-muted-foreground">No payments recorded.</p>
                            )}
                          </TabsContent>
                        </motion.div>
                      </Tabs>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No students linked to this parent.</p>
                  <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="mt-4">
                        Link a Student
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px]">
                      <DialogHeader>
                        <DialogTitle>Link Student to Parent</DialogTitle>
                        <DialogDescription>
                          Select a student and specify their relationship to {parent.fullName}.
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleLinkSubmit)} className="space-y-6">
                          <FormField
                            control={form.control}
                            name="studentId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Student</FormLabel>
                                <FormControl>
                                  <ReactSelect
                                    isLoading={isStudentsLoading}
                                    options={students.map((student) => ({
                                      value: student.id,
                                      label: `${student.name} (Adm: ${student.admissionNo})`,
                                      student,
                                    }))}
                                    onInputChange={(input) => setStudentSearch(input)}
                                    onChange={(option) => field.onChange(option?.value || "")}
                                    placeholder="Search students..."
                                    isClearable
                                    formatOptionLabel={({ student }) => (
                                      <div className="flex flex-col">
                                        <span className="font-medium">{student.name}</span>
                                        <span className="text-sm text-muted-foreground">
                                          Adm: {student.admissionNo}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                          Class: {student.className} ({student.term})
                                        </span>
                                      </div>
                                    )}
                                    classNamePrefix="react-select"
                                    noOptionsMessage={() =>
                                      isStudentsLoading
                                        ? "Loading students..."
                                        : "No unlinked students found"
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="relationship"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Relationship to Student</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Select relationship" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="FATHER">Father</SelectItem>
                                    <SelectItem value="MOTHER">Mother</SelectItem>
                                    <SelectItem value="GUARDIAN">Guardian</SelectItem>
                                    <SelectItem value="OTHER">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setIsLinkDialogOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" disabled={linkMutation.isPending}>
                              {linkMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Linking...
                                </>
                              ) : (
                                "Link Student"
                              )}
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Dialog open={isUnlinkDialogOpen} onOpenChange={setIsUnlinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Student</DialogTitle>
            <DialogDescription>
              Are you sure you want to unlink this student from the parent? This action can be reversed by linking them again.
            </DialogDescription>
          </DialogHeader>
          {studentToUnlink && (
            <div className="py-4">
              <p className="font-medium">{studentToUnlink.name}</p>
              <p className="text-sm text-muted-foreground">Admission No: {studentToUnlink.admissionNo}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUnlinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => unlinkMutation.mutate(studentToUnlink?.linkId || "")}
              disabled={unlinkMutation.isPending}
              className="gap-1"
            >
              {unlinkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Unlink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}