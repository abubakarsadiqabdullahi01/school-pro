import { describe, expect, it } from "vitest"

import { PUBLISHED_ONLY, averageScore, subjectTotal } from "./results-visibility"

describe("subjectTotal", () => {
  it("adds the CAs and the exam", () => {
    expect(subjectTotal({ ca1: 10, ca2: 10, ca3: 10, exam: 50 })).toBe(80)
  })

  it("treats a missing component as not yet entered, not as zero marks", () => {
    // Mid-entry: only the first CA is in. The total is what exists so far.
    expect(subjectTotal({ ca1: 15, ca2: null, ca3: null, exam: null })).toBe(15)
  })

  it("returns null when nothing has been recorded at all", () => {
    // "Not marked" and "scored nothing" are different answers, and a dashboard that
    // conflates them tells a family the child scored zero when no one has marked the paper.
    expect(subjectTotal({ ca1: null, ca2: null, ca3: null, exam: null })).toBeNull()
  })

  it("keeps a genuine zero", () => {
    expect(subjectTotal({ ca1: 0, ca2: 0, ca3: 0, exam: 0 })).toBe(0)
  })
})

describe("averageScore", () => {
  it("averages across subjects", () => {
    expect(
      averageScore([
        { ca1: 10, ca2: 10, ca3: 10, exam: 50 },
        { ca1: 5, ca2: 5, ca3: 5, exam: 25 },
      ]),
    ).toBe(60)
  })

  it("counts a subject the student scored zero in", () => {
    // The old code filtered totals with `score > 0` before averaging, so a zero was
    // dropped and the average came out higher than the child actually scored.
    const withZero = averageScore([
      { ca1: 10, ca2: 10, ca3: 10, exam: 50 },
      { ca1: 0, ca2: 0, ca3: 0, exam: 0 },
    ])
    expect(withZero, "a zero was excluded, inflating the average").toBe(40)
  })

  it("ignores subjects that have not been marked", () => {
    expect(
      averageScore([
        { ca1: 10, ca2: 10, ca3: 10, exam: 50 },
        { ca1: null, ca2: null, ca3: null, exam: null },
      ]),
    ).toBe(80)
  })

  it("returns null rather than 0 when there is nothing to average", () => {
    // Rendering 0 here reads as "the child scored nothing", which is a different and
    // much more alarming statement than "no results yet".
    expect(averageScore([])).toBeNull()
    expect(averageScore([{ ca1: null, ca2: null, ca3: null, exam: null }])).toBeNull()
  })
})

describe("PUBLISHED_ONLY", () => {
  it("selects published rows only", () => {
    expect(PUBLISHED_ONLY).toEqual({ isPublished: true })
  })
})
