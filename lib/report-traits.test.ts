import { describe, expect, it } from "vitest"
import {
  AFFECTIVE_TRAITS,
  PSYCHOMOTOR_TRAITS,
  REPORT_TRAITS,
  isTraitCode,
  isValidRating,
  ratingsForDomain,
  traitLabel,
} from "@/lib/report-traits"

/**
 * Report sheet traits.
 *
 * What is guarded here is what a parent ends up reading: that the two domains
 * carry the traits the school actually assesses, that a rating outside 1–5 never
 * reaches the sheet, and that a trait nobody filled in prints as a dash instead
 * of quietly disappearing.
 */

describe("the trait lists", () => {
  it("carries the six affective traits the school asked for", () => {
    expect(AFFECTIVE_TRAITS.map((trait) => trait.label)).toEqual([
      "Class Attendance",
      "Honesty",
      "Leadership",
      "Neatness",
      "Politeness",
      "Punctuality",
    ])
  })

  it("carries the five psychomotor traits the school asked for", () => {
    expect(PSYCHOMOTOR_TRAITS.map((trait) => trait.label)).toEqual([
      "Games",
      "Verbal Fluency",
      "Handwriting",
      "Musical Skill",
      "Handling Tools",
    ])
  })

  it("uses a unique code for every trait", () => {
    const codes = REPORT_TRAITS.map((trait) => trait.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("recognises its own codes and nothing else", () => {
    expect(isTraitCode("PUNCTUALITY")).toBe(true)
    expect(isTraitCode("Punctuality")).toBe(false)
    expect(isTraitCode("BEHAVIOUR")).toBe(false)
  })

  it("falls back to the code when a label is asked for one it does not know", () => {
    expect(traitLabel("HANDLING_TOOLS")).toBe("Handling Tools")
    expect(traitLabel("UNKNOWN_TRAIT")).toBe("UNKNOWN_TRAIT")
  })
})

describe("isValidRating", () => {
  it("accepts the whole numbers 1 to 5", () => {
    for (const rating of [1, 2, 3, 4, 5]) expect(isValidRating(rating)).toBe(true)
  })

  it("rejects anything outside the scale", () => {
    for (const value of [0, 6, -1, 4.5, "5", null, undefined, NaN]) {
      expect(isValidRating(value)).toBe(false)
    }
  })
})

describe("ratingsForDomain", () => {
  const recorded = [
    { trait: "HONESTY", rating: 4 },
    { trait: "PUNCTUALITY", rating: 5 },
    { trait: "GAMES", rating: 3 },
  ]

  it("returns every trait in the domain, in printing order", () => {
    expect(ratingsForDomain("AFFECTIVE", recorded).map((row) => row.label)).toEqual([
      "Class Attendance",
      "Honesty",
      "Leadership",
      "Neatness",
      "Politeness",
      "Punctuality",
    ])
  })

  it("keeps a trait with no rating, as null", () => {
    const rows = ratingsForDomain("AFFECTIVE", recorded)
    expect(rows.find((row) => row.code === "HONESTY")?.rating).toBe(4)
    expect(rows.find((row) => row.code === "LEADERSHIP")?.rating).toBeNull()
  })

  it("does not let one domain's ratings leak into the other", () => {
    const psychomotor = ratingsForDomain("PSYCHOMOTOR", recorded)
    expect(psychomotor.find((row) => row.code === "GAMES")?.rating).toBe(3)
    expect(psychomotor.every((row) => row.code !== "HONESTY")).toBe(true)
  })

  it("returns a full set of dashes when nothing was filled in", () => {
    const rows = ratingsForDomain("PSYCHOMOTOR", [])
    expect(rows).toHaveLength(5)
    expect(rows.every((row) => row.rating === null)).toBe(true)
  })
})
