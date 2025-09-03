export interface FormState {
  termId: string
  level: string
  classId: string
  subjectId: string
  searchQuery: string
}

export interface Student {
  id: string
  studentClassTermId: string
  admissionNo: string
  fullName: string
  firstName?: string
  lastName?: string
  gender?: string | null
}

export interface Subject {
  id: string
  name: string
  code: string
  classSubjectId?: string
}

export interface Assessment {
  id?: string | null
  studentId: string
  ca1?: number | null
  ca2?: number | null
  ca3?: number | null
  exam?: number | null
  totalScore?: number | null
  grade?: string | null
  remark?: string | null
  isAbsent?: boolean
  isExempt?: boolean
  isPublished?: boolean
}

export interface ScoreEntry {
  id?: string | null
  studentId: string
  ca1: number | null
  ca2: number | null
  ca3: number | null
  exam: number | null
  totalScore?: number | null
  grade?: string | null
  remark?: string | null
  isAbsent: boolean
  isExempt: boolean
  isPublished?: boolean
  isDirty: boolean
  hasError: boolean
  errorMessage?: string
}

export interface ClassTerm {
  id: string
  classId: string
  className: string
  classLevel: string
  termId: string
  termName: string
}

export interface TeacherSubject {
  id: string
  name: string
  code: string
}

export interface AssessmentStatistics {
  totalStudents: number
  studentsWithData: number
  completeAssessments: number
  partialAssessments: number
  absentStudents: number
  exemptStudents: number
  studentsWithoutData: number
  completionPercentage: number
}