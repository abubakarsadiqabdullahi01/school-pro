import { describe, expect, it } from "vitest"
import {
  DECISION_SENTENCE,
  DECISION_STAMP,
  reportCardComments,
  type AnnualCardDecision,
} from "@/lib/pdf/report-card-comments"

/**
 * What a family reads in the comments box.
 *
 * This is the line that tells a parent whether their child goes up a year, and it lives
 * inside a PDF - which means a mistake here is invisible until somebody opens one. Hence
 * these: the rule is pure and tested, and the generator only places the result on a page.
 *
 * The case that matters most is the last one. A termly card has no end-of-session outcome,
 * and must never start claiming one.
 */

const DECIDED: Array<Exclude<AnnualCardDecision, "PENDING">> = [
  "PROMOTED",
  "REPEATED",
  "GRADUATED",
]

describe("a card with no approved decision", () => {
  it("prints the encouragement it always printed", () => {
    // The behaviour before any of this existed, preserved exactly.
    expect(reportCardComments({ averageScore: 75 }).headTeacher).toBe("Very Good Result, Forward!")
    expect(reportCardComments({ averageScore: 65 }).headTeacher).toBe("Good Result, Keep improving!")
    expect(reportCardComments({ averageScore: 55 }).headTeacher).toBe(
      "Average Result, Try harder next term.",
    )
    expect(reportCardComments({ averageScore: 20 }).headTeacher).toBe(
      "Below Average, Significant improvement needed.",
    )
  })

  it("stamps nothing", () => {
    expect(reportCardComments({ averageScore: 75 }).stamp).toBeNull()
  })

  it("treats PENDING exactly like no decision at all", () => {
    // PENDING means an exams officer has compiled and nobody has approved. A card must not
    // announce an outcome the school has not agreed to.
    const pending = reportCardComments({ averageScore: 75, annualDecision: "PENDING" })
    const absent = reportCardComments({ averageScore: 75 })
    expect(pending).toEqual(absent)
  })

  it("ignores a stored comment while the decision is still pending", () => {
    const result = reportCardComments({
      averageScore: 75,
      annualDecision: "PENDING",
      principalComment: "Promoted to JSS 2.",
    })
    expect(result.headTeacher).toBe("Very Good Result, Forward!")
    expect(result.stamp).toBeNull()
  })
})

describe("an approved decision", () => {
  it.each(DECIDED)("prints the principal's own words for %s", (decision) => {
    const result = reportCardComments({
      averageScore: 41,
      annualDecision: decision,
      principalComment: "Has worked hard all year and deserves the move.",
    })
    expect(result.headTeacher).toBe("Has worked hard all year and deserves the move.")
  })

  it.each(DECIDED)("falls back to the outcome when nobody wrote anything for %s", (decision) => {
    const result = reportCardComments({ averageScore: 41, annualDecision: decision })
    expect(result.headTeacher).toBe(DECISION_SENTENCE[decision])
  })

  it("treats a comment of only spaces as nothing written", () => {
    // Otherwise the card prints a blank line where the decision should be.
    const result = reportCardComments({
      averageScore: 41,
      annualDecision: "REPEATED",
      principalComment: "   ",
    })
    expect(result.headTeacher).toBe("To repeat the class.")
  })

  it.each(DECIDED)("stamps %s in the corner", (decision) => {
    expect(reportCardComments({ averageScore: 41, annualDecision: decision }).stamp).toBe(
      DECISION_STAMP[decision],
    )
  })

  it("stamps the outcome even when the principal wrote something unrelated", () => {
    // The stamp is the decision stated outright. A family should not have to infer it from
    // prose, and prose is exactly where it would get lost.
    const result = reportCardComments({
      averageScore: 41,
      annualDecision: "REPEATED",
      principalComment: "A difficult year at home; we will keep supporting her.",
    })
    expect(result.stamp).toBe("REPEAT")
  })

  it("overrides the average-based encouragement entirely", () => {
    // A learner with a high average who is nonetheless repeating - held back on credits,
    // say - must not be congratulated on the same line that holds them back.
    const result = reportCardComments({ averageScore: 88, annualDecision: "REPEATED" })
    expect(result.headTeacher).toBe("To repeat the class.")
    expect(result.headTeacher).not.toContain("Very Good")
  })
})

describe("the form teacher's line", () => {
  it("is always from the average, because there is nowhere to type one", () => {
    expect(reportCardComments({ averageScore: 75 }).formTeacher).toBe("Very Good Result, Well done!")
    expect(reportCardComments({ averageScore: 30 }).formTeacher).toBe(
      "Poor Result, Much more effort required.",
    )
  })

  it("is unaffected by the annual decision", () => {
    // The two lines answer different questions, and the head teacher's is the only one the
    // end-of-session outcome belongs on.
    const withDecision = reportCardComments({ averageScore: 75, annualDecision: "REPEATED" })
    const without = reportCardComments({ averageScore: 75 })
    expect(withDecision.formTeacher).toBe(without.formTeacher)
  })
})

describe("the boundaries", () => {
  it.each([
    [70, "Very Good Result, Well done!"],
    [69.99, "Good Result, Keep it up!"],
    [60, "Good Result, Keep it up!"],
    [59.99, "Fair Result, Work harder."],
    [50, "Fair Result, Work harder."],
    [49.99, "Poor Result, Much more effort required."],
    [0, "Poor Result, Much more effort required."],
  ])("reads %s as %s", (average, expected) => {
    expect(reportCardComments({ averageScore: average }).formTeacher).toBe(expected)
  })
})

describe("the wording never carries a result", () => {
  it("says nothing about a mark, a grade or a position", () => {
    // A decision sentence is the school's verdict, not the child's marks. The sentence is
    // printed on a card a family keeps, and the marks are already on it in their own right.
    for (const sentence of Object.values(DECISION_SENTENCE)) {
      expect(sentence).not.toMatch(/\d/)
      expect(sentence.toLowerCase()).not.toMatch(/score|grade|average|position|mark/)
    }
  })

  it("keeps every stamp short enough to read at a glance", () => {
    for (const stamp of Object.values(DECISION_STAMP)) {
      expect(stamp.length).toBeLessThanOrEqual(10)
      expect(stamp).toBe(stamp.toUpperCase())
    }
  })
})
