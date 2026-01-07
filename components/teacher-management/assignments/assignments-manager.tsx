"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  BookOpen,
  Users,
  Plus,
  X,
  Check,
  AlertCircle,
  Clock,
  School,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

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
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  assignClassesToTeacher,
  assignSubjectsToTeacher,
  unassignTeacherFromClass,
  unassignTeacherFromSubject,
} from "@/app/actions/teacher-assignment";

interface Teacher {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  staffId: string;
  department: string;
  classes: {
    id: string;
    classTermId: string;
    className: string;
    classLevel: string;
    termName: string;
    sessionName: string;
    isCurrent?: boolean;
  }[];
  subjects: {
    id: string;
    subjectId: string;
    name: string;
    code: string;
  }[];
}

interface ClassTerm {
  id: string;
  className: string;
  classLevel: string;
  termName: string;
  termId: string;
  sessionName: string;
  isCurrent: boolean;
  studentsCount: number;
}

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface AssignmentsManagerProps {
  teacher: Teacher;
  availableClassTerms: ClassTerm[];
  availableSubjects: Subject[];
}

export function AssignmentsManager({
  teacher,
  availableClassTerms,
  availableSubjects,
}: AssignmentsManagerProps) {
  const router = useRouter();
  const [selectedTerm, setSelectedTerm] = useState<string>("current");
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false);
  const [isSubjectDialogOpen, setIsSubjectDialogOpen] = useState(false);
  const [selectedClassTerms, setSelectedClassTerms] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    currentClasses: true,
    otherClasses: false,
    subjects: true,
  });

  // Get unique terms from available class terms
  const availableTerms = Array.from(
    new Set(
      availableClassTerms.map((ct) => `${ct.termName} - ${ct.sessionName}`),
    ),
  );

  // Filter class terms based on selected term
  const filteredClassTerms = availableClassTerms.filter((ct) => {
    if (selectedTerm === "current") return ct.isCurrent;
    if (selectedTerm === "all") return true;
    return `${ct.termName} - ${ct.sessionName}` === selectedTerm;
  });

  // Get teacher's current assignments for the filtered terms
  const currentClassAssignments = teacher.classes.filter((tc) => {
    if (selectedTerm === "current") return tc.isCurrent;
    if (selectedTerm === "all") return true;
    return `${tc.termName} - ${tc.sessionName}` === selectedTerm;
  });

  // Separate current and other term classes based on the selected term filter
  const currentTermClasses = teacher.classes.filter((tc) => {
    if (selectedTerm === "current") return tc.isCurrent;
    if (selectedTerm === "all") return tc.isCurrent;
    return (
      tc.isCurrent && `${tc.termName} - ${tc.sessionName}` === selectedTerm
    );
  });

  const otherTermClasses = teacher.classes.filter((tc) => {
    if (selectedTerm === "current") return !tc.isCurrent;
    if (selectedTerm === "all") return !tc.isCurrent;
    return (
      !tc.isCurrent && `${tc.termName} - ${tc.sessionName}` === selectedTerm
    );
  });

  const handleClassAssignment = async () => {
    try {
      setIsAssigning(true);
      const result = await assignClassesToTeacher({
        teacherId: teacher.id,
        classTermIds: selectedClassTerms,
      });

      if (result.success) {
        toast.success("Success", {
          description: "Class assignments updated successfully",
        });
        setIsClassDialogOpen(false);
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error || "Failed to update assignments",
        });
      }
    } catch (error) {
      console.error("Error updating class assignments:", error);
      toast.error("Error", {
        description: "An unexpected error occurred",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSubjectAssignment = async () => {
    try {
      setIsAssigning(true);

      // Get current term ID from available class terms
      const currentClassTerm = availableClassTerms.find((ct) => ct.isCurrent);
      if (!currentClassTerm) {
        toast.error("Error", {
          description: "No current term found. Please select a term.",
        });
        setIsAssigning(false);
        return;
      }

      const result = await assignSubjectsToTeacher({
        teacherId: teacher.id,
        subjectIds: selectedSubjects,
        termId: currentClassTerm.termId,
      });

      if (result.success) {
        toast.success("Success", {
          description: "Subject assignments updated successfully",
        });
        setIsSubjectDialogOpen(false);
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error || "Failed to update assignments",
        });
      }
    } catch (error) {
      console.error("Error updating subject assignments:", error);
      toast.error("Error", {
        description: "An unexpected error occurred",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassignClass = async (assignmentId: string) => {
    try {
      const result = await unassignTeacherFromClass(assignmentId);

      if (result.success) {
        toast.success("Success", {
          description: "Class unassigned successfully",
        });
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error || "Failed to unassign class",
        });
      }
    } catch (error) {
      console.error("Error unassigning class:", error);
      toast.error("Error", {
        description: "An unexpected error occurred",
      });
    }
  };

  const handleUnassignSubject = async (assignmentId: string) => {
    try {
      const result = await unassignTeacherFromSubject(assignmentId);

      if (result.success) {
        toast.success("Success", {
          description: "Subject unassigned successfully",
        });
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error || "Failed to unassign subject",
        });
      }
    } catch (error) {
      console.error("Error unassigning subject:", error);
      toast.error("Error", {
        description: "An unexpected error occurred",
      });
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Assignments for {teacher.fullName}
          </h2>
          <p className="text-muted-foreground">
            Manage class and subject assignments for this teacher
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger className="w-[200px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Term Only</SelectItem>
              <SelectItem value="all">All Terms</SelectItem>
              {availableTerms.map((term) => (
                <SelectItem key={term} value={term}>
                  {term}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Class Assignments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <School className="h-5 w-5" />
                Class Assignments
              </CardTitle>
              <CardDescription>
                Classes assigned to {teacher.firstName}
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setSelectedClassTerms(
                  currentClassAssignments.map((tc) => tc.classTermId),
                );
                setIsClassDialogOpen(true);
              }}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Manage Classes
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Term Classes */}
            {currentTermClasses.length > 0 && (
              <Collapsible
                open={expandedSections.currentClasses}
                onOpenChange={() => toggleSection("currentClasses")}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="font-medium">Current Term</span>
                    <Badge
                      variant="secondary"
                      className="bg-green-100 text-green-800"
                    >
                      {currentTermClasses.length}
                    </Badge>
                  </div>
                  {expandedSections.currentClasses ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  <AnimatePresence>
                    {currentTermClasses.map((classAssignment) => (
                      <motion.div
                        key={classAssignment.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center justify-between p-3 border rounded-lg bg-green-50 border-green-200"
                      >
                        <div className="flex-1">
                          <div className="font-medium">
                            {classAssignment.className}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {classAssignment.classLevel} •{" "}
                            {classAssignment.termName} •{" "}
                            {classAssignment.sessionName}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleUnassignClass(classAssignment.id)
                          }
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Other Term Classes */}
            {otherTermClasses.length > 0 && (
              <Collapsible
                open={expandedSections.otherClasses}
                onOpenChange={() => toggleSection("otherClasses")}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-gray-500" />
                    <span className="font-medium">Other Terms</span>
                    <Badge variant="outline">{otherTermClasses.length}</Badge>
                  </div>
                  {expandedSections.otherClasses ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  <AnimatePresence>
                    {otherTermClasses.map((classAssignment) => (
                      <motion.div
                        key={classAssignment.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="font-medium">
                            {classAssignment.className}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {classAssignment.classLevel} •{" "}
                            {classAssignment.termName} •{" "}
                            {classAssignment.sessionName}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleUnassignClass(classAssignment.id)
                          }
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </CollapsibleContent>
              </Collapsible>
            )}

            {teacher.classes.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <School className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No class assignments yet</p>
                <p className="text-sm">
                  Click &quot;Manage Classes&quot; to assign classes
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subject Assignments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Subject Assignments
              </CardTitle>
              <CardDescription>
                Subjects taught by {teacher.firstName}
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setSelectedSubjects(teacher.subjects.map((ts) => ts.subjectId));
                setIsSubjectDialogOpen(true);
              }}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Manage Subjects
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {teacher.subjects.length > 0 ? (
              <Collapsible
                open={expandedSections.subjects}
                onOpenChange={() => toggleSection("subjects")}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span className="font-medium">Assigned Subjects</span>
                    <Badge variant="secondary">{teacher.subjects.length}</Badge>
                  </div>
                  {expandedSections.subjects ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  <AnimatePresence>
                    {teacher.subjects.map((subjectAssignment) => (
                      <motion.div
                        key={subjectAssignment.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="font-medium">
                            {subjectAssignment.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Code: {subjectAssignment.code}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleUnassignSubject(subjectAssignment.id)
                          }
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No subject assignments yet</p>
                <p className="text-sm">
                  Click &quot;Manage Subjects&quot; to assign subjects
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Class Assignment Dialog */}
      <Dialog open={isClassDialogOpen} onOpenChange={setIsClassDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Classes to {teacher.fullName}</DialogTitle>
            <DialogDescription>
              Select which classes this teacher should be assigned to.
              {selectedTerm !== "all" && (
                <span className="block mt-1 text-sm font-medium">
                  Showing classes for:{" "}
                  {selectedTerm === "current" ? "Current Term" : selectedTerm}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredClassTerms.length > 0 ? (
              filteredClassTerms.map((classTerm) => (
                <div
                  key={classTerm.id}
                  className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50"
                >
                  <Checkbox
                    id={classTerm.id}
                    checked={selectedClassTerms.includes(classTerm.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedClassTerms([
                          ...selectedClassTerms,
                          classTerm.id,
                        ]);
                      } else {
                        setSelectedClassTerms(
                          selectedClassTerms.filter(
                            (id) => id !== classTerm.id,
                          ),
                        );
                      }
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={classTerm.id}
                        className="font-medium cursor-pointer"
                      >
                        {classTerm.className}
                      </label>
                      <div className="flex items-center gap-2">
                        {classTerm.isCurrent && (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800"
                          >
                            Current
                          </Badge>
                        )}
                        <Badge variant="outline">
                          <Users className="h-3 w-3 mr-1" />
                          {classTerm.studentsCount}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {classTerm.classLevel} • {classTerm.termName} •{" "}
                      {classTerm.sessionName}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No classes available for the selected term</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsClassDialogOpen(false)}
              disabled={isAssigning}
            >
              Cancel
            </Button>
            <Button onClick={handleClassAssignment} disabled={isAssigning}>
              {isAssigning ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Update Assignments
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subject Assignment Dialog */}
      <Dialog open={isSubjectDialogOpen} onOpenChange={setIsSubjectDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Subjects to {teacher.fullName}</DialogTitle>
            <DialogDescription>
              Select which subjects this teacher should teach.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-96 overflow-y-auto space-y-2">
            {availableSubjects.length > 0 ? (
              availableSubjects.map((subject) => (
                <div
                  key={subject.id}
                  className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50"
                >
                  <Checkbox
                    id={subject.id}
                    checked={selectedSubjects.includes(subject.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedSubjects([...selectedSubjects, subject.id]);
                      } else {
                        setSelectedSubjects(
                          selectedSubjects.filter((id) => id !== subject.id),
                        );
                      }
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={subject.id}
                        className="font-medium cursor-pointer"
                      >
                        {subject.name}
                      </label>
                      <Badge variant="outline">{subject.code}</Badge>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No subjects available</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSubjectDialogOpen(false)}
              disabled={isAssigning}
            >
              Cancel
            </Button>
            <Button onClick={handleSubjectAssignment} disabled={isAssigning}>
              {isAssigning ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Update Assignments
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
