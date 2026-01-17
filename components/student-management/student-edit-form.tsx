// components/student-management/student-edit-form.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  Plus,
  Search,
  User,
  Calendar,
  School,
  BookOpen,
  UserCheck,
  Lock,
  CheckCircle,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Stepper,
  Step,
  StepDescription,
  StepTitle,
} from "@/components/student-management/stepper";
import { ParentSearchDialog } from "@/components/student-management/parent-search-dialog";
import {
  updateStudent,
  getStudent,
  getCurrentSessionAndTerm,
  getClassesBySchool,
} from "@/app/actions/student-management";
import { FormSkeleton } from "@/components/ui/loading-skeleton";
import { Gender } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Define the form schema for student edit
const studentEditFormSchema = z.object({
  firstName: z
    .string()
    .min(2, { message: "First name must be at least 2 characters." }),
  lastName: z
    .string()
    .min(2, { message: "Last name must be at least 2 characters." }),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Please enter a valid date.",
  }),
  gender: z.nativeEnum(Gender).optional(),
  state: z.string().optional(),
  lga: z.string().optional(),
  address: z.string().optional(),
  classId: z.string().min(1, { message: "Please select a class." }),
  termId: z.string().min(1, { message: "Please select a term." }),
  year: z
    .number()
    .int()
    .min(2000)
    .max(new Date().getFullYear() + 1),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
});

type StudentEditFormValues = z.infer<typeof studentEditFormSchema>;

interface ClassOption {
  id: string;
  name: string;
  level: string;
}

interface SchoolInfo {
  id: string;
  name: string;
  code: string;
}

interface ParentOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  credentials?: unknown;
  relationship?: string;
}

interface StudentEditFormProps {
  studentId: string;
}

export default function StudentEditForm({ studentId }: StudentEditFormProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [studentData, setStudentData] = useState<any>(null);
  const [currentSession, setCurrentSession] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [currentTerm, setCurrentTerm] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  // Generate recent years for dropdown (current year and previous 10 years)
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - i);

  // Initialize form
  const form = useForm<StudentEditFormValues>({
    resolver: zodResolver(studentEditFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: undefined,
      state: "",
      lga: "",
      address: "",
      classId: "",
      termId: "",
      year: currentYear,
      phone: "",
      isActive: true,
    },
    mode: "onTouched",
    reValidateMode: "onChange",
    criteriaMode: "all",
    shouldFocusError: true,
  });

  // Fetch student data and required info
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch current session and term
        const sessionResult = await getCurrentSessionAndTerm();
        if (sessionResult.success && sessionResult.data) {
          setCurrentSession({
            id: sessionResult.data.sessionId,
            name: sessionResult.data.sessionName,
          });
          setCurrentTerm({
            id: sessionResult.data.termId,
            name: sessionResult.data.termName,
          });
          form.setValue("termId", sessionResult.data.termId);
        } else {
          toast.error("Error", {
            description:
              sessionResult.error || "Failed to fetch current session and term",
          });
        }

        // Fetch classes for the admin's school
        const classesResult = await getClassesBySchool();
        if (classesResult.success && classesResult.data) {
          setClasses(classesResult.data.classes);
          setSchoolInfo(classesResult.data.school);
        } else {
          toast.error("Error", {
            description: classesResult.error || "Failed to fetch classes",
          });
        }

        // Fetch student data
        const studentResult = await getStudent({ studentId });
        if (studentResult.success && studentResult.data) {
          setStudentData(studentResult.data);

          console.log(studentResult.data);

          // Populate form with student data
          const student = studentResult.data;
          form.reset({
            firstName: student.firstName,
            lastName: student.lastName,
            dateOfBirth: student.dateOfBirth,
            gender: student.gender as Gender,
            state: student.state || "",
            lga: student.lga || "",
            address: student.address || "",
            phone: student.phone || "",
            year: student.year,
            isActive: student.isActive,
            classId: student.currentClass?.id || "",
            termId:
              student.currentClass?.termId || sessionResult.data?.termId || "",
          });
        } else {
          toast.error("Error", {
            description: studentResult.error || "Failed to fetch student data",
          });
          router.push("/dashboard/admin/students");
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Error", {
          description: "Failed to fetch required data. Please try again.",
        });
        router.push("/dashboard/admin/students");
      } finally {
        setIsLoading(false);
      }
    };

    if (studentId) {
      fetchData();
    }
  }, [studentId, form, router]);

  // Handle form submission
  async function onSubmit(data: StudentEditFormValues) {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const updateData = {
        studentId,
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          state: data.state,
          lga: data.lga,
          address: data.address,
          phone: data.phone,
          classId: data.classId,
          termId: data.termId,
          year: data.year,
          isActive: data.isActive,
        },
      };

      const result = await updateStudent(updateData);

      if (result.success) {
        toast.success("Student Updated Successfully", {
          description: `Student information has been updated successfully.`,
        });

        // Redirect after a brief delay to show success message
        setTimeout(() => {
          router.push("/dashboard/admin/students");
          router.refresh();
        }, 1500);
      } else {
        toast.error("Update Failed", {
          description:
            result.error ||
            "There was an error updating the student. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error updating student:", error);
      toast.error("Update Failed", {
        description:
          "There was an error updating the student. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Animation variants for step transitions
  const variants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  };

  // Calculate if the current step is valid
  const isStepValid = (stepNumber: number) => {
    switch (stepNumber) {
      case 1:
        return (
          [
            "firstName",
            "lastName",
            "dateOfBirth",
          ] as (keyof StudentEditFormValues)[]
        ).every(
          (field) =>
            !form.getFieldState(field as keyof StudentEditFormValues).invalid,
        );
      case 2:
        return (["classId", "year"] as (keyof StudentEditFormValues)[]).every(
          (field) =>
            !form.getFieldState(field as keyof StudentEditFormValues).invalid,
        );
      case 3:
        return true; // Review step
      default:
        return true;
    }
  };

  // Validate current step and move to next
  const goToNextStep = async () => {
    const fieldsToValidate: (keyof StudentEditFormValues)[] =
      step === 1
        ? ([
            "firstName",
            "lastName",
            "dateOfBirth",
          ] as (keyof StudentEditFormValues)[])
        : step === 2
          ? (["classId", "year"] as (keyof StudentEditFormValues)[])
          : [];

    if (fieldsToValidate.length > 0) {
      const result = await form.trigger(fieldsToValidate);
      if (!result) return;
    }

    setStep(step + 1);
  };

  if (isLoading) {
    return <FormSkeleton />;
  }

  if (!studentData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Student not found or you don't have permission to edit.
        </p>
      </div>
    );
  }

  return (
    <div className="container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-6xl mx-auto border-0 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/20 rounded-lg">
                <UserCheck className="h-8 w-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-3xl font-bold text-foreground">
                  Edit Student
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  Update student information for {studentData?.fullName}
                </CardDescription>
                <Badge variant="secondary" className="w-fit mt-2">
                  Admission No: {studentData?.admissionNo}
                </Badge>
              </div>
            </div>

            {currentSession && currentTerm && (
              <Badge variant="secondary" className="w-fit mt-4">
                <Calendar className="h-3 w-3 mr-1" />
                Current: {currentSession.name} • {currentTerm.name}
              </Badge>
            )}
          </CardHeader>

          <CardContent className="pt-8">
            <Stepper currentStep={step} className="mb-8">
              <Step step={1}>
                <StepTitle>Personal Information</StepTitle>
                <StepDescription>
                  Update student&apos;s basic details
                </StepDescription>
              </Step>
              <Step step={2}>
                <StepTitle>Academic Details</StepTitle>
                <StepDescription>Update class and enrollment</StepDescription>
              </Step>
              <Step step={3}>
                <StepTitle>Review & Update</StepTitle>
                <StepDescription>Confirm all changes</StepDescription>
              </Step>
            </Stepper>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
              >
                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      <Alert>
                        <User className="h-4 w-4" />
                        <AlertDescription>
                          Update the student&apos;s personal information. Fields
                          marked with * are required.
                        </AlertDescription>
                      </Alert>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-1">
                                First Name{" "}
                                <span className="text-destructive">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Enter first name"
                                  {...field}
                                  className="h-11"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-1">
                                Last Name{" "}
                                <span className="text-destructive">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Enter last name"
                                  {...field}
                                  className="h-11"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="dateOfBirth"
                          render={({ field }) => (
                            <FormItem className="w-full">
                              <FormLabel className="flex items-center gap-1">
                                Date of Birth{" "}
                                <span className="text-destructive">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="date"
                                  {...field}
                                  className="w-full h-11"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="gender"
                          render={({ field }) => (
                            <FormItem className="w-full">
                              <FormLabel>Gender</FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value)}
                                value={field.value ?? ""}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select gender" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="MALE">Male</SelectItem>
                                  <SelectItem value="FEMALE">Female</SelectItem>
                                  <SelectItem value="OTHER">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Enter state"
                                  {...field}
                                  className="h-11"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="lga"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Local Government Area</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Enter LGA"
                                  {...field}
                                  className="h-11"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        <FormField
                          control={form.control}
                          name="address"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Address</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Enter full address"
                                  {...field}
                                  className="h-11"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Enter phone number"
                                  {...field}
                                  className="h-11"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div
                      key="step2"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      <Alert>
                        <School className="h-4 w-4" />
                        <AlertDescription>
                          Update the academic class and enrollment year for the
                          student.
                        </AlertDescription>
                      </Alert>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="classId"
                          render={({ field }) => (
                            <FormItem className="w-full">
                              <FormLabel className="flex items-center gap-1">
                                Class{" "}
                                <span className="text-destructive">*</span>
                              </FormLabel>
                              <FormControl className="w-full">
                                <Select
                                  onValueChange={(value) =>
                                    field.onChange(value)
                                  }
                                  defaultValue={field.value}
                                >
                                  <SelectTrigger className="w-full h-11">
                                    <SelectValue placeholder="Select class" />
                                  </SelectTrigger>
                                  <SelectContent className="w-full">
                                    {classes.map((cls) => (
                                      <SelectItem key={cls.id} value={cls.id}>
                                        <div className="flex items-center gap-2">
                                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                                          {cls.name}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormControl>
                              <FormDescription>
                                Classes available at {schoolInfo?.name}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="year"
                          render={({ field }) => (
                            <FormItem className="w-full">
                              <FormLabel className="flex items-center gap-1">
                                Admission Year{" "}
                                <span className="text-destructive">*</span>
                              </FormLabel>
                              <FormControl className="w-full">
                                <Select
                                  onValueChange={(value) =>
                                    field.onChange(parseInt(value))
                                  }
                                  defaultValue={field.value?.toString()}
                                >
                                  <SelectTrigger className="w-full h-11">
                                    <SelectValue placeholder="Select year" />
                                  </SelectTrigger>
                                  <SelectContent className="w-full">
                                    {yearOptions.map((year) => (
                                      <SelectItem
                                        key={year}
                                        value={year.toString()}
                                      >
                                        {year}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormControl>
                              <FormDescription>
                                Year the student was admitted
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                Account Status
                              </FormLabel>
                              <FormDescription>
                                Activate or deactivate the student&apos;s
                                account
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <div className="bg-muted/50 p-6 rounded-lg border">
                        <div className="flex items-center mb-4">
                          <div className="mr-3 bg-primary/10 p-2 rounded-full">
                            <Check className="h-4 w-4 text-primary" />
                          </div>
                          <h3 className="font-semibold">
                            Current Academic Period
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground">
                              Session
                            </p>
                            <p className="text-lg font-semibold">
                              {currentSession?.name || "Not set"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground">
                              Term
                            </p>
                            <p className="text-lg font-semibold">
                              {currentTerm?.name || "Not set"}
                            </p>
                          </div>
                        </div>
                        <FormDescription className="mt-3">
                          Changing the class will update the student&apos;s
                          current enrollment.
                        </FormDescription>
                      </div>
                    </motion.div>
                  )}

                  {step === 3 && (
                    <motion.div
                      key="step3"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={variants}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">
                          Review all changes before updating. Double-check for
                          accuracy.
                        </AlertDescription>
                      </Alert>

                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-green-100">
                        <h3 className="font-semibold text-lg text-foreground mb-6 text-center">
                          📋 Student Update Summary
                        </h3>

                        <div className="space-y-6">
                          {/* Personal Information Section */}
                          <div className="bg-white p-5 rounded-lg border border-green-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="bg-blue-100 p-2 rounded-lg">
                                <User className="h-5 w-5 text-blue-600" />
                              </div>
                              <h4 className="font-semibold text-foreground">
                                Personal Information
                              </h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {[
                                {
                                  label: "First Name",
                                  value: form.getValues("firstName"),
                                },
                                {
                                  label: "Last Name",
                                  value: form.getValues("lastName"),
                                },
                                {
                                  label: "Date of Birth",
                                  value: form.getValues("dateOfBirth"),
                                },
                                {
                                  label: "Gender",
                                  value:
                                    form.getValues("gender") || "Not specified",
                                },
                                {
                                  label: "State",
                                  value:
                                    form.getValues("state") || "Not specified",
                                },
                                {
                                  label: "LGA",
                                  value:
                                    form.getValues("lga") || "Not specified",
                                },
                                {
                                  label: "Address",
                                  value:
                                    form.getValues("address") ||
                                    "Not specified",
                                  colSpan: "md:col-span-2",
                                },
                                {
                                  label: "Phone",
                                  value:
                                    form.getValues("phone") || "Not specified",
                                },
                              ].map((item, index) => (
                                <div key={index} className={item.colSpan || ""}>
                                  <p className="text-sm font-medium text-muted-foreground">
                                    {item.label}
                                  </p>
                                  <p className="text-base font-semibold text-foreground">
                                    {item.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <Separator className="my-6" />

                          {/* Academic Information Section */}
                          <div className="bg-white p-5 rounded-lg border border-green-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="bg-purple-100 p-2 rounded-lg">
                                <School className="h-5 w-5 text-purple-600" />
                              </div>
                              <h4 className="font-semibold text-foreground">
                                Academic Information
                              </h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {[
                                {
                                  label: "Class",
                                  value:
                                    classes.find(
                                      (c) => c.id === form.getValues("classId"),
                                    )?.name || "Not selected",
                                },
                                {
                                  label: "Session",
                                  value: currentSession?.name || "Not set",
                                },
                                {
                                  label: "Term",
                                  value: currentTerm?.name || "Not set",
                                },
                                {
                                  label: "Admission Year",
                                  value:
                                    form.getValues("year")?.toString() ||
                                    "Not specified",
                                },
                                {
                                  label: "Account Status",
                                  value: form.getValues("isActive")
                                    ? "Active"
                                    : "Inactive",
                                },
                              ].map((item, index) => (
                                <div key={index}>
                                  <p className="text-sm font-medium text-muted-foreground">
                                    {item.label}
                                  </p>
                                  <p className="text-base font-semibold text-foreground">
                                    {item.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Final Confirmation */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mt-6">
                          <div className="flex items-center gap-3">
                            <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <p className="text-sm text-blue-800">
                              By submitting, you confirm that all information is
                              accurate and complete.
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-between pt-6 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(step - 1)}
                    disabled={step === 1}
                    className="min-w-[120px]"
                  >
                    Previous
                  </Button>

                  {step < 3 ? (
                    <Button
                      type="button"
                      onClick={goToNextStep}
                      className="min-w-[120px] bg-primary hover:bg-primary/90"
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={
                        isSubmitting || !isStepValid(1) || !isStepValid(2)
                      }
                      className="min-w-[120px] bg-primary hover:bg-primary/90"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Update Student
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
