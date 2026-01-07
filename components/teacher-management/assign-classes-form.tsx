"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Calendar, School } from "lucide-react";
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
  assignClassesToTeacher,
  getAvailableTerms,
} from "@/app/actions/teacher-assignment";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ClassTerm {
  id: string;
  className: string;
  level: string;
  termName: string;
  termId: string;
  sessionName: string;
  isCurrent: boolean;
  isAssigned: boolean;
}

interface Term {
  id: string;
  name: string;
  sessionName: string;
  isCurrent: boolean;
}

interface AssignClassesFormProps {
  teacherId: string;
  teacherName: string;
  classTerms: ClassTerm[];
}

export function AssignClassesForm({
  teacherId,
  teacherName,
  classTerms,
}: AssignClassesFormProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [availableTerms, setAvailableTerms] = useState<Term[]>([]);
  const [selectedClassTerms, setSelectedClassTerms] = useState<string[]>([]);
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

  // Update selected classes when term changes
  useEffect(() => {
    if (selectedTerm) {
      // Pre-select classes that are already assigned for this term
      const assignedClasses = classTerms
        .filter((ct) => ct.termId === selectedTerm && ct.isAssigned)
        .map((ct) => ct.id);
      setSelectedClassTerms(assignedClasses);
    }
  }, [selectedTerm, classTerms]);

  // Filter class terms based on selected term and search query
  const filteredClassTerms = classTerms.filter((ct) => {
    // If a term is selected, only show classes for that term
    const matchesTerm = !selectedTerm || ct.termId === selectedTerm;

    // Search across multiple fields
    const matchesSearch =
      !searchQuery || // If no search query, show all
      ct.className.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ct.level.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ct.termName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ct.sessionName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesTerm && matchesSearch;
  });

  // Get the selected term object
  const currentTermObject = availableTerms.find((t) => t.id === selectedTerm);

  // Handle class term selection
  const handleClassTermSelection = (classTermId: string) => {
    setSelectedClassTerms((prev) => {
      if (prev.includes(classTermId)) {
        return prev.filter((id) => id !== classTermId);
      } else {
        return [...prev, classTermId];
      }
    });
  };

  // Handle select all for current term
  const handleSelectAll = () => {
    const allCurrentTermClasses = filteredClassTerms.map((ct) => ct.id);
    setSelectedClassTerms(allCurrentTermClasses);
  };

  // Handle deselect all
  const handleDeselectAll = () => {
    setSelectedClassTerms([]);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTerm) {
      toast.error("Please select a term");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await assignClassesToTeacher({
        teacherId,
        classTermIds: selectedClassTerms,
        termId: selectedTerm,
      });

      if (result.success) {
        toast.success("Classes Assigned", {
          description:
            result.message ||
            "The classes have been successfully assigned to the teacher.",
        });
        router.push(`/dashboard/admin/teachers/${teacherId}`);
        router.refresh();
      } else {
        toast.error("Assignment Failed", {
          description:
            result.error || "Failed to assign classes. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error assigning classes:", error);
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
            <School className="h-5 w-5" />
            Assign Classes to {teacherName}
          </CardTitle>
          <CardDescription>
            Select a term and choose the classes this teacher will handle
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
                  ⚠️ You are assigning classes for a past term. This will create
                  a historical record.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Term Summary - Show which terms have classes */}
          {(() => {
            const termClassCounts = availableTerms.map((term) => ({
              term,
              count: classTerms.filter((ct) => ct.termId === term.id).length,
            }));

            const selectedTermCount =
              termClassCounts.find((tc) => tc.term.id === selectedTerm)
                ?.count || 0;

            return (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-800 mb-2">
                      📊 Classes Available by Term
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {termClassCounts.map(({ term, count }) => (
                        <div
                          key={term.id}
                          className={`flex items-center justify-between p-2 rounded ${
                            term.id === selectedTerm
                              ? "bg-blue-100 border border-blue-300"
                              : "bg-white"
                          }`}
                        >
                          <span className="font-medium">
                            {term.name} - {term.sessionName}
                            {term.isCurrent && (
                              <Badge
                                variant="secondary"
                                className="ml-2 bg-green-100 text-green-800 text-xs"
                              >
                                Current
                              </Badge>
                            )}
                          </span>
                          <Badge
                            variant={count > 0 ? "default" : "outline"}
                            className="ml-2"
                          >
                            {count} {count === 1 ? "class" : "classes"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {selectedTermCount === 0 && selectedTerm && (
                  <Alert className="mt-3 bg-yellow-50 border-yellow-200">
                    <AlertDescription className="text-xs">
                      ⚠️ The selected term has no classes. Try selecting a
                      different term or create classes for this term first.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            );
          })()}

          {/* Debug Info - Remove after testing */}
          {process.env.NODE_ENV === "development" && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 space-y-2">
              <p className="text-sm font-semibold text-yellow-800">
                Debug Info:
              </p>
              <div className="text-xs space-y-1">
                <p>Selected Term: {selectedTerm || "None"}</p>
                <p>Total Class Terms: {classTerms.length}</p>
                <p>Filtered Class Terms: {filteredClassTerms.length}</p>
                <p>Search Query: "{searchQuery}"</p>
                <p>
                  Sample Class Term IDs:{" "}
                  {classTerms
                    .slice(0, 3)
                    .map((ct) => `${ct.className}(termId: ${ct.termId})`)
                    .join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search-classes">Search Classes</Label>
            <Input
              id="search-classes"
              placeholder="Search by class name, term, or session..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Bulk Actions */}
          {filteredClassTerms.length > 0 && (
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
                {selectedClassTerms.length} of {filteredClassTerms.length}{" "}
                selected
              </span>
            </div>
          )}

          {/* Classes List */}
          {selectedTerm ? (
            filteredClassTerms.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {filteredClassTerms.map((classTerm) => (
                  <div
                    key={classTerm.id}
                    className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                      selectedClassTerms.includes(classTerm.id)
                        ? "bg-accent/50 border-primary"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <Checkbox
                        id={`class-${classTerm.id}`}
                        checked={selectedClassTerms.includes(classTerm.id)}
                        onCheckedChange={() =>
                          handleClassTermSelection(classTerm.id)
                        }
                      />
                      <div>
                        <Label
                          htmlFor={`class-${classTerm.id}`}
                          className="text-base font-medium cursor-pointer"
                        >
                          {classTerm.className}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {classTerm.termName} - {classTerm.sessionName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{classTerm.level}</Badge>
                      {classTerm.isCurrent && (
                        <Badge className="bg-green-100 text-green-800">
                          Current
                        </Badge>
                      )}
                      {classTerm.isAssigned && (
                        <Badge variant="secondary">Assigned</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <School className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-semibold">
                  {searchQuery
                    ? "No classes match your search"
                    : "No classes found for this term"}
                </p>
                {searchQuery ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm">
                      Try adjusting your search criteria or clearing the search
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchQuery("")}
                    >
                      Clear Search
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3 max-w-md mx-auto">
                    <Alert className="bg-blue-50 border-blue-200">
                      <AlertDescription className="text-sm text-left">
                        <strong>
                          No classes exist for{" "}
                          {currentTermObject?.name || "this term"}
                        </strong>
                        <br />
                        <br />
                        Classes need to be created for each term. You have two
                        options:
                        <ol className="list-decimal ml-4 mt-2 space-y-1">
                          <li>
                            Select a different term that has classes already
                            created
                          </li>
                          <li>
                            Create classes for this term first, then return here
                            to assign
                          </li>
                        </ol>
                      </AlertDescription>
                    </Alert>
                    {availableTerms.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        💡 Tip: Try selecting a different term from the dropdown
                        above
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">
                Please select a term to view available classes
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
              isSubmitting || !selectedTerm || selectedClassTerms.length === 0
            }
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? "Saving..."
              : `Save Assignments (${selectedClassTerms.length})`}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
