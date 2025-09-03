"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  BookOpen, 
  Users, 
  GraduationCap, 
  Search, 
  Calendar,
  ChevronRight,
  FileText,
  TrendingUp,
  Clock,
  Award,
} from "lucide-react"


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"

// ==================== TYPE DEFINITIONS ====================

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
}

export interface Credential {
  id: string;
  type: string;
  value: string;
}

export interface School {
  id: string;
  name: string;
  code: string;
  logoUrl?: string | null;
}

export interface Session {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  schoolId: string;
}

export interface Term {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  sessionId: string;
  session: Session;
}

export interface Class {
  id: string;
  name: string;
  level: string;
  schoolId: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  schoolId: string;
}

export interface Student {
  id: string;
  admissionNo: string;
  year: string;
  userId: string;
  user: User;
}

export interface StudentClassTerm {
  id: string;
  studentId: string;
  classTermId: string;
  student: Student;
}

export interface ClassSubject {
  id: string;
  classTermId: string;
  subjectId: string;
  subject: Subject;
}

export interface ClassTerm {
  id: string;
  classId: string;
  termId: string;
  class: Class;
  term: Term;
  students: StudentClassTerm[];
  classSubjects: ClassSubject[];
}

export interface TeacherClassTerm {
  id: string;
  teacherId: string;
  classTermId: string;
  classTerm: ClassTerm;
}

export interface TeacherSubject {
  id: string;
  teacherId: string;
  subjectId: string;
  subject: Subject;
}

export interface Teacher {
  id: string;
  userId: string;
  staffId: string;
  department?: string | null;
  qualification?: string | null;
  schoolId: string;
  user: User;
  school: School;
}

export interface TermAssignment {
  term: Term;
  classes: ClassAssignment[];
}

export interface ClassAssignment {
  classTermId: string;
  classId: string;
  className: string;
  classLevel: string;
  studentCount: number;
  students: StudentInfo[];
}

export interface StudentInfo {
  id: string;
  studentClassTermId: string;
  admissionNo: string;
  admissionYear: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl?: string | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
}

export interface EnrichedTeacherSubject {
  id: string;
  teacherId: string;
  subjectId: string;
  subject: Subject;
  termAssignments: TermAssignment[];
  totalClasses: number;
  totalStudents: number;
  currentTermAssignment?: TeacherClassTerm;
}

export interface TeacherInfo {
  name: string;
  staffId: string;
  department?: string | null;
  qualification?: string | null;
  email: string;
  avatarUrl?: string | null;
}

export interface SummaryStats {
  totalSubjects: number;
  totalClasses: number;
  totalStudents: number;
  currentTermClasses: number;
  currentTermSubjects: number;
}

export interface TeacherSubjectsViewProps {
  teacherSubjectAssignments: EnrichedTeacherSubject[];
  allTerms: Term[];
  currentTerm: Term | null;
  teacherId: string;
  schoolId: string;
  teacherInfo: TeacherInfo;
  summaryStats: SummaryStats;
}

// ==================== MAIN COMPONENT ====================

export function TeacherSubjectsView({ 
  teacherSubjectAssignments, 
  allTerms, 
  currentTerm, 
  summaryStats
}: TeacherSubjectsViewProps) {
  const [selectedSubject, setSelectedSubject] = useState<EnrichedTeacherSubject | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<string>(currentTerm?.id || "all")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("overview")

  // Filter subjects based on selected term and search query
  const filteredSubjects = useMemo(() => {
    let filtered = teacherSubjectAssignments

    // Filter by term
    if (selectedTerm !== "all") {
      filtered = filtered.filter(subject => 
        subject.termAssignments.some((ta) => ta.term.id === selectedTerm)
      )
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(subject =>
        subject.subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subject.subject.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    return filtered
  }, [teacherSubjectAssignments, selectedTerm, searchQuery])

  // Get current term assignments for quick access
  const currentTermSubjects = useMemo(() => {
    return teacherSubjectAssignments.filter(subject => subject.currentTermAssignment)
  }, [teacherSubjectAssignments])



  return (
    <div className="space-y-8">
      {/* Quick Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-6 rounded-lg border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by term" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Terms</SelectItem>
              {allTerms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  <div className="flex items-center gap-2">
                    <span className="truncate">{term.session.name} - {term.name}</span>
                    {term.isCurrent && (
                      <Badge variant="secondary" className="text-xs shrink-0">Current</Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto justify-end mt-4 sm:mt-0">
          <Button asChild variant="outline" className="flex-1 sm:flex-initial">
            <Link href="/dashboard/teacher/compiler/subject-results/entry">
              <FileText className="h-4 w-4 mr-2" />
              Enter Scores
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="current" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Current Term
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            All Assignments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryCard 
              title="Total Subjects" 
              value={summaryStats.totalSubjects} 
              icon={BookOpen} 
              color="blue" 
            />
            <SummaryCard 
              title="Total Classes" 
              value={summaryStats.totalClasses} 
              icon={Users} 
              color="green" 
            />
            <SummaryCard 
              title="Total Students" 
              value={summaryStats.totalStudents} 
              icon={GraduationCap} 
              color="purple" 
            />
            <SummaryCard 
              title="Current Classes" 
              value={summaryStats.currentTermClasses} 
              icon={Calendar} 
              color="orange" 
            />
            <SummaryCard 
              title="Active Subjects" 
              value={summaryStats.currentTermSubjects} 
              icon={Award} 
              color="indigo" 
            />
          </div>

          {/* Current Term Quick Overview */}
          {currentTerm && currentTermSubjects.length > 0 && (
            <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <Clock className="h-5 w-5" />
                  Current Term: {currentTerm.session.name} - {currentTerm.name}
                </CardTitle>
                <CardDescription className="text-blue-700">
                  Quick overview of your current teaching assignments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {currentTermSubjects.slice(0, 6).map((subject) => (
                    <CurrentTermSubjectCard 
                      key={subject.id} 
                      subject={subject} 
                    />
                  ))}
                </div>
                {currentTermSubjects.length > 6 && (
                  <div className="mt-4 text-center">
                    <Button 
                      variant="outline" 
                      onClick={() => setActiveTab("current")}
                      className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    >
                      View All {currentTermSubjects.length} Current Subjects
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="current" className="space-y-6">
          {currentTermSubjects.length === 0 ? (
            <EmptyState 
              icon={Clock}
              title="No Current Term Assignments"
              description="You don't have any subject assignments for the current term."
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {currentTermSubjects.map((subject) => (
                <SubjectCard
                  key={subject.id}
                  subject={subject}
                  onViewStudents={setSelectedSubject}
                  showTermInfo={false}
                  currentTerm={currentTerm}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-6">
          {filteredSubjects.length === 0 ? (
            <EmptyState 
              icon={BookOpen}
              title="No Subjects Found"
              description={searchQuery ? "No subjects match your search criteria." : "You are not currently assigned to teach any subjects."}
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredSubjects.map((subject) => (
                <SubjectCard
                  key={subject.id}
                  subject={subject}
                  onViewStudents={setSelectedSubject}
                  showTermInfo={true}
                  currentTerm={currentTerm}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ==================== SUBCOMPONENTS ====================

interface SummaryCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  color: "blue" | "green" | "purple" | "orange" | "indigo";
}

function SummaryCard({ title, value, icon: Icon, color }: SummaryCardProps) {
  const colorClasses = {
    blue: "from-blue-50 to-blue-100 border-blue-200 text-blue-600",
    green: "from-green-50 to-green-100 border-green-200 text-green-600",
    purple: "from-purple-50 to-purple-100 border-purple-200 text-purple-600",
    orange: "from-orange-50 to-orange-100 border-orange-200 text-orange-600",
    indigo: "from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-600"
  };

  const textColorClasses = {
    blue: "text-blue-900",
    green: "text-green-900",
    purple: "text-purple-900",
    orange: "text-orange-900",
    indigo: "text-indigo-900"
  };

  return (
    <Card className={`bg-gradient-to-br ${colorClasses} border`}>
      <CardContent className="p-4 text-center">
        <Icon className={`h-7 w-7 mx-auto mb-2`} />
        <p className={`text-2xl font-bold ${textColorClasses[color]}`}>{value}</p>
        <p className={`text-sm ${textColorClasses[color]}`}>{title}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType, title: string, description: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Icon className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold mb-2 text-gray-900">{title}</h3>
        <p className="text-gray-600 text-center max-w-md">{description}</p>
      </CardContent>
    </Card>
  );
}

function CurrentTermSubjectCard({ subject }: { subject: EnrichedTeacherSubject }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-blue-200">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-gray-900 truncate">{subject.subject.name}</h4>
        <Badge variant="outline" className="text-xs shrink-0">{subject.subject.code}</Badge>
      </div>
      {subject.currentTermAssignment && (
        <div className="space-y-1 text-sm text-gray-600">
          <p className="flex items-center gap-1 truncate">
            <Users className="h-3 w-3 shrink-0" />
            {subject.currentTermAssignment.classTerm.class.name}
          </p>
          <p className="flex items-center gap-1">
            <GraduationCap className="h-3 w-3 shrink-0" />
            {subject.currentTermAssignment.classTerm.students.length} students
          </p>
        </div>
      )}
    </div>
  );
}

 // ==================== SUBJECT CARD COMPONENT ====================

interface SubjectCardProps {
  subject: EnrichedTeacherSubject;
  onViewStudents: (subject: EnrichedTeacherSubject) => void;
  showTermInfo: boolean;
  currentTerm: Term | null;
}

function SubjectCard({ 
  subject, 
  showTermInfo, 
  currentTerm 
}: SubjectCardProps) {
  const isCurrentlyTeaching = subject.currentTermAssignment !== undefined

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`hover:shadow-lg transition-all duration-300 ${
        isCurrentlyTeaching ? 'ring-2 ring-blue-200 bg-blue-50/30' : ''
      }`}>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl text-gray-900 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                {subject.subject.name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-mono">
                  {subject.subject.code}
                </Badge>
                {isCurrentlyTeaching && (
                  <Badge className="bg-green-100 text-green-800 text-xs">
                    Active
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="text-center">
              <p className="text-lg font-bold text-blue-600">{subject.totalClasses}</p>
              <p className="text-xs text-gray-600">Classes</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-green-600">{subject.totalStudents}</p>
              <p className="text-xs text-gray-600">Students</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-purple-600">{subject.termAssignments.length}</p>
              <p className="text-xs text-gray-600">Terms</p>
            </div>
          </div>

          {/* Current Term Info */}
          {isCurrentlyTeaching && subject.currentTermAssignment && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h5 className="font-medium text-blue-900 mb-2 flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Current Assignment
              </h5>
              <div className="space-y-1 text-sm">
                <p className="text-blue-800">
                  <span className="font-medium">Class:</span> {subject.currentTermAssignment.classTerm.class.name}
                </p>
                <p className="text-blue-800">
                  <span className="font-medium">Students:</span> {subject.currentTermAssignment.classTerm.students.length}
                </p>
              </div>
            </div>
          )}

          {/* Term Assignments Preview */}
          {showTermInfo && subject.termAssignments.length > 0 && (
            <div className="space-y-2">
              <h5 className="font-medium text-gray-900 text-sm">Teaching History</h5>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {subject.termAssignments.slice(0, 3).map((termAssignment) => (
                  <div key={termAssignment.term.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                    <span className="text-gray-700">
                      {termAssignment.term.session.name} - {termAssignment.term.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {termAssignment.classes.length} class{termAssignment.classes.length !== 1 ? 'es' : ''}
                    </Badge>
                  </div>
                ))}
                {subject.termAssignments.length > 3 && (
                  <p className="text-xs text-gray-500 text-center py-1">
                    +{subject.termAssignments.length - 3} more terms
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            
            {isCurrentlyTeaching && subject.currentTermAssignment && currentTerm && (
              <Button asChild size="sm" className="flex-1">
                <Link href={`/dashboard/teacher/compiler/subject-results/entry?subject=${subject.subject.id}&class=${subject.currentTermAssignment.classTerm.id}&term=${currentTerm.id}`}>
                  <FileText className="h-4 w-4 mr-2" />
                  Enter Scores
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}