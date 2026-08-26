export const queryKeys = {
  scoreEntry: {
    classes: (termId: string, level: string) => ["score-entry", "classes", termId, level] as const,
    students: (classTermId: string) => ["score-entry", "students", classTermId] as const,
    subjects: (classTermId: string) => ["score-entry", "subjects", classTermId] as const,
    teacherAssignment: (subjectId: string, classTermId: string) =>
      ["score-entry", "teacher-assignment", subjectId, classTermId] as const,
    assessments: (classTermId: string, subjectId: string, termId: string) =>
      ["score-entry", "assessments", classTermId, subjectId, termId] as const,
  },
  teacher: {
    classes: (termId?: string) => ["teacher", "classes", termId || "all"] as const,
    subjects: (termId?: string) => ["teacher", "subjects", termId || "all"] as const,
    assessments: (classTermId: string, subjectId: string, termId: string) =>
      ["teacher", "assessments", classTermId, subjectId, termId] as const,
  },
  superAdmin: {
    schools: ["super-admin", "schools"] as const,
    sessions: ["super-admin", "sessions"] as const,
    terms: ["super-admin", "terms"] as const,
    users: (role?: string) => ["super-admin", "users", role || "all"] as const,
  },
}

export const queryTiming = {
  stable: 5 * 60 * 1000,
  interactive: 2 * 60 * 1000,
  live: 30 * 1000,
}
