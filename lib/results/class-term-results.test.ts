import { describe, expect, it } from "vitest"
import {
  assignPositions,
  buildClassTermResults,
  gradeForScore,
  subjectTotal,
  type ScoreBand,
  type ResultAssessment,
  type ResultStudent,
} from "@/lib/results/class-term-results"

/**
 * These tests pin down the class-term aggregation as it behaves today, before the
 * `Assessment` unique-key migration. Their purpose is to prove that migration changes no
 * grade, so treat a failure as a regression until proven otherwise.
 *
 * Two cases are marked KNOWN DEFECT. Those assert current behaviour that is wrong; when
 * the behaviour is fixed, the assertion changes and the marker goes.
 */

/** WAEC bands as `getClassTermResults` loads them — ordered by minScore descending. */
const WAEC: ScoreBand[] = [
  { minScore: 80, maxScore: 100, grade: "A1" },
  { minScore: 70, maxScore: 79, grade: "B2" },
  { minScore: 65, maxScore: 69, grade: "B3" },
  { minScore: 60, maxScore: 64, grade: "C4" },
  { minScore: 55, maxScore: 59, grade: "C5" },
  { minScore: 50, maxScore: 54, grade: "C6" },
  { minScore: 45, maxScore: 49, grade: "D7" },
  { minScore: 40, maxScore: 44, grade: "E8" },
  { minScore: 0, maxScore: 39, grade: "F9" },
]

const MATHS = "subject-maths"
const ENGLISH = "subject-english"
const BIOLOGY = "subject-biology"
const SUBJECTS = [MATHS, ENGLISH, BIOLOGY]

function student(id: string, name = `Student ${id}`): ResultStudent {
  return { studentId: id, studentName: name, admissionNo: `AHN-2026-${id}`, gender: null }
}

/** A complete entry under the 10/10/10/70 scheme, summing to `total`. */
function scored(studentId: string, subjectId: string, total: number): ResultAssessment {
  return {
    studentId,
    subjectId,
    ca1: 10,
    ca2: 10,
    ca3: 10,
    exam: total - 30,
    isAbsent: false,
    isExempt: false,
  }
}

function flagged(
  studentId: string,
  subjectId: string,
  flag: "absent" | "exempt",
): ResultAssessment {
  return {
    studentId,
    subjectId,
    ca1: 0,
    ca2: 0,
    ca3: 0,
    exam: 0,
    isAbsent: flag === "absent",
    isExempt: flag === "exempt",
  }
}

describe("subjectTotal", () => {
  it("sums the three CAs and the exam when every component is present", () => {
    expect(subjectTotal(scored("s1", MATHS, 72))).toBe(72)
  })

  it("returns null when any component is missing", () => {
    const partial: ResultAssessment = { ...scored("s1", MATHS, 72), exam: null }
    expect(subjectTotal(partial)).toBeNull()
  })

  it("returns null when there is no assessment row at all", () => {
    expect(subjectTotal(undefined)).toBeNull()
  })

  it("returns null for an absent student even though the stored scores are zero", () => {
    expect(subjectTotal(flagged("s1", MATHS, "absent"))).toBeNull()
  })

  it("returns null for an exempt student", () => {
    expect(subjectTotal(flagged("s1", MATHS, "exempt"))).toBeNull()
  })
})

describe("gradeForScore", () => {
  it("maps a score to the band containing it", () => {
    expect(gradeForScore(85, WAEC)).toBe("A1")
    expect(gradeForScore(70, WAEC)).toBe("B2")
    expect(gradeForScore(39, WAEC)).toBe("F9")
  })

  it("floors before matching, so a fractional score grades on its whole part", () => {
    expect(gradeForScore(79.9, WAEC)).toBe("B2")
    expect(gradeForScore(80.0, WAEC)).toBe("A1")
  })

  it("returns null for a missing score rather than inventing a fail", () => {
    expect(gradeForScore(null, WAEC)).toBeNull()
  })

  it("returns null when the school has no bands configured", () => {
    expect(gradeForScore(72, [])).toBeNull()
  })

  it("matches on band boundaries inclusively at both ends", () => {
    expect(gradeForScore(45, WAEC)).toBe("D7")
    expect(gradeForScore(49, WAEC)).toBe("D7")
  })
})

describe("assignPositions", () => {
  it("orders by descending total and numbers from one", () => {
    const ranked = assignPositions([
      { studentId: "c", totalScore: 180 },
      { studentId: "a", totalScore: 240 },
      { studentId: "b", totalScore: 210 },
    ])

    expect(ranked.map((r) => [r.studentId, r.position])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ])
  })

  it("shares a position across ties and skips the places they consumed", () => {
    const ranked = assignPositions([
      { studentId: "a", totalScore: 240 },
      { studentId: "b", totalScore: 210 },
      { studentId: "c", totalScore: 210 },
      { studentId: "d", totalScore: 150 },
    ])

    expect(ranked.map((r) => r.position)).toEqual([1, 2, 2, 4])
  })

  it("handles a three-way tie at the top", () => {
    const ranked = assignPositions([
      { studentId: "a", totalScore: 200 },
      { studentId: "b", totalScore: 200 },
      { studentId: "c", totalScore: 200 },
      { studentId: "d", totalScore: 100 },
    ])

    expect(ranked.map((r) => r.position)).toEqual([1, 1, 1, 4])
  })

  it("returns an empty list unchanged", () => {
    expect(assignPositions([])).toEqual([])
  })
})

describe("buildClassTermResults", () => {
  it("totals, averages and grades a fully entered sheet", () => {
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: SUBJECTS,
      assessments: [
        scored("s1", MATHS, 80),
        scored("s1", ENGLISH, 70),
        scored("s1", BIOLOGY, 60),
      ],
      gradeBands: WAEC,
    })

    expect(results).toHaveLength(1)
    expect(results[0].totalScore).toBe(210)
    expect(results[0].averageScore).toBe(70)
    expect(results[0].grade).toBe("B2")
    expect(results[0].subjects[MATHS]).toEqual({ score: 80, grade: "A1" })
    expect(results[0].subjects[ENGLISH]).toEqual({ score: 70, grade: "B2" })
    expect(results[0].subjects[BIOLOGY]).toEqual({ score: 60, grade: "C4" })
  })

  it("leaves an exempt subject out of both the total and the divisor", () => {
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: SUBJECTS,
      assessments: [
        scored("s1", MATHS, 80),
        scored("s1", ENGLISH, 70),
        flagged("s1", BIOLOGY, "exempt"),
      ],
      gradeBands: WAEC,
    })

    // 150 over two subjects, not three — exemption is not a zero.
    expect(results[0].totalScore).toBe(150)
    expect(results[0].averageScore).toBe(75)
    expect(results[0].grade).toBe("B2")
    expect(results[0].subjects[BIOLOGY]).toEqual({ score: null, grade: null })
  })

  it("treats an absence the same way", () => {
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: SUBJECTS,
      assessments: [
        scored("s1", MATHS, 80),
        scored("s1", ENGLISH, 70),
        flagged("s1", BIOLOGY, "absent"),
      ],
      gradeBands: WAEC,
    })

    expect(results[0].averageScore).toBe(75)
  })

  it("does not depress averages when only some subjects have been entered", () => {
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: SUBJECTS,
      assessments: [scored("s1", MATHS, 80)],
      gradeBands: WAEC,
    })

    // Mid-term, one of three subjects entered. The average is that subject's score,
    // not 80/3 — this is the behaviour the earlier audit flagged as broken and which
    // has since been fixed. It must stay fixed.
    expect(results[0].averageScore).toBe(80)
    expect(results[0].grade).toBe("A1")
  })

  it("excludes a subject with a missing exam from the average", () => {
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: SUBJECTS,
      assessments: [
        scored("s1", MATHS, 80),
        { ...scored("s1", ENGLISH, 70), exam: null },
        scored("s1", BIOLOGY, 60),
      ],
      gradeBands: WAEC,
    })

    expect(results[0].totalScore).toBe(140)
    expect(results[0].averageScore).toBe(70)
    expect(results[0].subjects[ENGLISH]).toEqual({ score: null, grade: null })
  })

  it("returns a column for every class subject even when nothing was entered", () => {
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: SUBJECTS,
      assessments: [],
      gradeBands: WAEC,
    })

    expect(Object.keys(results[0].subjects).sort()).toEqual([...SUBJECTS].sort())
  })

  it("returns rows in position order, not enrolment order", () => {
    const results = buildClassTermResults({
      students: [student("s1"), student("s2"), student("s3")],
      subjectIds: [MATHS],
      assessments: [
        scored("s1", MATHS, 50),
        scored("s2", MATHS, 90),
        scored("s3", MATHS, 70),
      ],
      gradeBands: WAEC,
    })

    expect(results.map((r) => [r.studentId, r.position])).toEqual([
      ["s2", 1],
      ["s3", 2],
      ["s1", 3],
    ])
  })

  it("carries student identity through untouched", () => {
    const results = buildClassTermResults({
      students: [{ ...student("s1", "Amina Yusuf"), gender: "FEMALE" }],
      subjectIds: [MATHS],
      assessments: [scored("s1", MATHS, 72)],
      gradeBands: WAEC,
    })

    expect(results[0].studentName).toBe("Amina Yusuf")
    expect(results[0].admissionNo).toBe("AHN-2026-s1")
    expect(results[0].gender).toBe("FEMALE")
  })

  it("ranks on total score, so a student with fewer subjects entered ranks lower than their average implies", () => {
    // KNOWN DEFECT — position uses totalScore while the displayed grade uses
    // averageScore. Mid-term, a student with one excellent subject sits below a student
    // with three mediocre ones. Ranking should use averageScore, or positions should be
    // withheld until the sheet is complete.
    const results = buildClassTermResults({
      students: [student("strong-partial"), student("weak-complete")],
      subjectIds: SUBJECTS,
      assessments: [
        scored("strong-partial", MATHS, 95),
        scored("weak-complete", MATHS, 40),
        scored("weak-complete", ENGLISH, 41),
        scored("weak-complete", BIOLOGY, 42),
      ],
      gradeBands: WAEC,
    })

    const partial = results.find((r) => r.studentId === "strong-partial")!
    const complete = results.find((r) => r.studentId === "weak-complete")!

    expect(partial.averageScore).toBe(95)
    expect(partial.grade).toBe("A1")
    expect(partial.position).toBe(2)

    expect(complete.averageScore).toBe(41)
    expect(complete.grade).toBe("E8")
    expect(complete.position).toBe(1)
  })

  it("grades a student with no entries at all as a fail rather than as unrecorded", () => {
    // KNOWN DEFECT — a student with nothing entered gets totalScore 0, averageScore 0,
    // and therefore the band containing zero. On a report card that is indistinguishable
    // from a student who sat every paper and scored nothing. It should render as "no
    // result" instead.
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: SUBJECTS,
      assessments: [],
      gradeBands: WAEC,
    })

    expect(results[0].totalScore).toBe(0)
    expect(results[0].averageScore).toBe(0)
    expect(results[0].grade).toBe("F9")
  })

  it("leaves the grade empty when the school has no grading bands", () => {
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: [MATHS],
      assessments: [scored("s1", MATHS, 72)],
      gradeBands: [],
    })

    expect(results[0].grade).toBe("")
    expect(results[0].subjects[MATHS]).toEqual({ score: 72, grade: null })
  })

  it("returns nothing for a class term with no students enrolled", () => {
    expect(
      buildClassTermResults({
        students: [],
        subjectIds: SUBJECTS,
        assessments: [],
        gradeBands: WAEC,
      }),
    ).toEqual([])
  })

  it("ignores assessments belonging to other students", () => {
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: [MATHS],
      assessments: [scored("s1", MATHS, 60), scored("s2", MATHS, 99)],
      gradeBands: WAEC,
    })

    expect(results).toHaveLength(1)
    expect(results[0].totalScore).toBe(60)
  })

  it("ignores assessments for subjects the class term does not offer", () => {
    const results = buildClassTermResults({
      students: [student("s1")],
      subjectIds: [MATHS],
      assessments: [scored("s1", MATHS, 60), scored("s1", "subject-not-offered", 99)],
      gradeBands: WAEC,
    })

    expect(results[0].totalScore).toBe(60)
    expect(results[0].subjects["subject-not-offered"]).toBeUndefined()
  })
})
