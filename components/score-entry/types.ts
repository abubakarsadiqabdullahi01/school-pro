export interface Student {
  id: string
  studentClassTermId: string
  admissionNo: string
  fullName: string
}

export interface Subject {
  id: string
  name: string
  code: string
  classSubjectId: string
}

export interface Assessment {
  id?: string
  studentId: string
  ca1: number | null
  ca2: number | null
  ca3: number | null
  exam: number | null
  totalScore: number | null
  grade: string | null
  remark: string | null
  isAbsent: boolean
  isExempt: boolean
  isPublished: boolean
}

export interface ScoreEntry extends Assessment {
  isDirty: boolean
  hasError: boolean
  errorMessage?: string
}

export interface FormState {
  termId: string
  level: string
  classId: string
  subjectId: string
  searchQuery: string
}

export interface GradingLevel {
  minScore: number
  maxScore: number
  grade: string
  remark: string
}

export interface GradingSystem {
  levels: GradingLevel[]
  passMark: number
}
