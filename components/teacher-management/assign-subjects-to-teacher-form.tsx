"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Calendar, BookOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignSubjectsToTeacher,
  getAvailableTerms,
} from "@/app/actions/teacher-assignment";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Subject {
  id: string;
  name: string;
  code: string;
  isAssigned: boolean;
  assignmentId?: string;
  termId?: string;
}

interface Term {
  id: string;
  name: string;
  sessionName: string;
  isCurrent: boolean;
}

interface AssignSubjectsToTeacherFormProps {
  teacherId: string;
  teacherName: string;
  subjects: Subject[];
}

export function AssignSubjectsToTeacherForm({
  teacherId,
  teacherName,
  subjects,
}: AssignSubjectsToTeacherFormProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [availableTerms, setAvailableTerms] = useState<Term[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTerms, setIsLoadingTerms] = useState(true);

  // Load available terms
  useEffect(() => {
    async function loadTerms() {
      try {
        const result = await getAvailableTerms();
        if (result.success && result.data) {
          setAvailableTerms(result.data);

          // Auto-select current term if available
          const currentTerm = result.data.find((t) => t.isCurrent);
          if (currentTerm) {
            setSelectedTerm(currentTerm.id);
          } else if (result.data.length > 0) {
            setSelectedTerm(result.data[0].id);
          }
        }
      } catch (error) {
        console.error("Error loading terms:", error);
        toast.error("Failed to load terms");
      } finally {
        setIsLoadingTerms(false);
      }
    }
    loadTerms();
  }, []);

  // Update selected subjects when term changes
  useEffect(() => {
    if (selectedTerm) {
      // Pre-select subjects that are already assigned for this term
      const assignedSubjects = subjects
        .filter((s) => s.termId === selectedTerm && s.isAssigned)
        .map((s) => s.id);
      setSelectedSubjects(assignedSubjects);
    } else {
      setSelectedSubjects([]);
    }
  }, [selectedTerm, subjects]);

  // Filter subjects based on search query
  const filteredSubjects = subjects.filter(
    (subject) =>
      subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.code.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Get the selected term object
  const currentTermObject = availableTerms.find((t) => t.id === selectedTerm);

  // Handle subject selection
  const handleSubjectSelection = (subjectId: string) => {
    setSelectedSubjects((prev) => {
      if (prev.includes(subjectId)) {
        return prev.filter((id) => id !== subjectId);
      } else {
        return [...prev, subjectId];
      }
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    const allSubjectIds = filteredSubjects.map((s) => s.id);
    setSelectedSubjects(allSubjectIds);
  };

  // Handle deselect all
  const handleDeselectAll = () => {
    setSelectedSubjects([]);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTerm) {
      toast.error("Please select a term");
      return;
    }

    if (selectedSubjects.length === 0) {
      toast.error("Please select at least one subject");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await assignSubjectsToTeacher({
        teacherId,
        subjectIds: selectedSubjects,
        termId: selectedTerm,
      });

      if (result.success) {
        toast.success("Subjects Assigned", {
          description:
            result.message ||
            "The subjects have been successfully assigned to the teacher.",
        });
        router.push(`/dashboard/admin/teachers/${teacherId}`);
        router.refresh();
      } else {
        toast.error("Assignment Failed", {
          description:
            result.error || "Failed to assign subjects. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error assigning subjects:", error);
      toast.error("Assignment Failed", {
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingTerms) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (availableTerms.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Terms Available</CardTitle>
          <CardDescription>
            There are no terms configured for this school. Please create a term
            first.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Assign Subjects to {teacherName}
          </CardTitle>
          <CardDescription>
            Select a term and choose the subjects this teacher will teach
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Term Selection */}
          <div className="space-y-2">
            <Label htmlFor="term-select" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Select Term
            </Label>
            <Select value={selectedTerm} onValueChange={setSelectedTerm}>
              <SelectTrigger id="term-select">
                <SelectValue placeholder="Choose a term" />
              </SelectTrigger>
              <SelectContent>
                {availableTerms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    <div className="flex items-center gap-2">
                      <span>
                        {term.name} - {term.sessionName}
                      </span>
                      {term.isCurrent && (
                        <Badge
                          variant="secondary"
                          className="ml-2 bg-green-100 text-green-800"
                        >
                          Current
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentTermObject && !currentTermObject.isCurrent && (
              <Alert>
                <AlertDescription className="text-sm text-muted-foreground">
                  ⚠️ You are assigning subjects for a past term. This will
                  create a historical record.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search-subjects">Search Subjects</Label>
            <Input
              id="search-subjects"
              placeholder="Search by subject name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Bulk Actions */}
          {filteredSubjects.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
              >
                Deselect All
              </Button>
              <span className="text-sm text-muted-foreground ml-auto">
                {selectedSubjects.length} of {filteredSubjects.length} selected
              </span>
            </div>
          )}

          {/* Subjects Grid */}
          {selectedTerm ? (
            filteredSubjects.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[400px] overflow-y-auto pr-2">
                {filteredSubjects.map((subject) => {
                  const isSelected = selectedSubjects.includes(subject.id);
                  const isAssignedForTerm =
                    subject.isAssigned && subject.termId === selectedTerm;

                  return (
                    <div
                      key={subject.id}
                      className={`flex items-start space-x-3 rounded-lg border p-4 transition-colors ${
                        isSelected
                          ? "bg-accent/50 border-primary"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <Checkbox
                        id={`subject-${subject.id}`}
                        checked={isSelected}
                        onCheckedChange={() =>
                          handleSubjectSelection(subject.id)
                        }
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={`subject-${subject.id}`}
                          className="text-base font-medium cursor-pointer"
                        >
                          {subject.name}
                        </Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {subject.code}
                          </Badge>
                          {isAssignedForTerm && (
                            <Badge variant="secondary" className="text-xs">
                              Assigned
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">
                  {searchQuery
                    ? "No subjects found matching your search criteria"
                    : "No subjects available"}
                </p>
                {searchQuery && (
                  <p className="text-sm mt-2">
                    Try adjusting your search criteria
                  </p>
                )}
              </div>
            )
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">
                Please select a term to view available subjects
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(`/dashboard/admin/teachers/${teacherId}`)
            }
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              isSubmitting || !selectedTerm || selectedSubjects.length === 0
            }
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? "Saving..."
              : `Save Assignments (${selectedSubjects.length})`}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
