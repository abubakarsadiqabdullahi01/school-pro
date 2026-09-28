import { describe, expect, it } from "vitest"

import {
  NIGERIA_STATES,
  NIGERIAN_STATE_NAMES,
  canonicalStateName,
  isLgaOfState,
  lgasForState,
} from "@/lib/nigeria"

/**
 * The official per-state LGA counts, summing to 774.
 *
 * Checked separately from the data itself so a name dropped or duplicated while editing the
 * list fails loudly here instead of quietly shortening a dropdown that nobody audits.
 */
const EXPECTED_LGA_COUNTS: Record<string, number> = {
  Abia: 17,
  Adamawa: 21,
  "Akwa Ibom": 31,
  Anambra: 21,
  Bauchi: 20,
  Bayelsa: 8,
  Benue: 23,
  Borno: 27,
  "Cross River": 18,
  Delta: 25,
  Ebonyi: 13,
  Edo: 18,
  Ekiti: 16,
  Enugu: 17,
  Gombe: 11,
  Imo: 27,
  Jigawa: 27,
  Kaduna: 23,
  Kano: 44,
  Katsina: 34,
  Kebbi: 21,
  Kogi: 21,
  Kwara: 16,
  Lagos: 20,
  Nasarawa: 13,
  Niger: 25,
  Ogun: 20,
  Ondo: 18,
  Osun: 30,
  Oyo: 33,
  Plateau: 17,
  Rivers: 23,
  Sokoto: 23,
  Taraba: 16,
  Yobe: 17,
  Zamfara: 14,
  "Federal Capital Territory": 6,
}

describe("Nigeria reference data", () => {
  it("has the 36 states and the Federal Capital Territory", () => {
    expect(NIGERIA_STATES).toHaveLength(37)
    expect(NIGERIAN_STATE_NAMES).toContain("Federal Capital Territory")
  })

  it("has 774 local government areas in total", () => {
    const total = NIGERIA_STATES.reduce((sum, state) => sum + state.lgas.length, 0)
    expect(total).toBe(774)
  })

  it("has the expected number of LGAs in every state", () => {
    for (const state of NIGERIA_STATES) {
      expect.soft(state.lgas.length, `${state.name} LGA count`).toBe(EXPECTED_LGA_COUNTS[state.name])
    }
  })

  it("covers exactly the states the counts describe, with no extras or omissions", () => {
    expect([...NIGERIAN_STATE_NAMES].sort()).toEqual(Object.keys(EXPECTED_LGA_COUNTS).sort())
  })

  it("never repeats a state name", () => {
    expect(new Set(NIGERIAN_STATE_NAMES).size).toBe(NIGERIAN_STATE_NAMES.length)
  })

  it("never repeats an LGA within a state", () => {
    for (const state of NIGERIA_STATES) {
      expect.soft(new Set(state.lgas).size, `${state.name} duplicates`).toBe(state.lgas.length)
    }
  })

  it("has no blank or untrimmed names", () => {
    for (const state of NIGERIA_STATES) {
      expect.soft(state.name).toBe(state.name.trim())
      expect.soft(state.name.length).toBeGreaterThan(0)
      for (const lga of state.lgas) {
        expect.soft(lga, `${state.name}: "${lga}"`).toBe(lga.trim())
        expect.soft(lga.length, `${state.name}: empty LGA`).toBeGreaterThan(0)
      }
    }
  })

  it("lists every state's LGAs alphabetically, so a long dropdown is scannable", () => {
    for (const state of NIGERIA_STATES) {
      const sorted = [...state.lgas].sort((a, b) => a.localeCompare(b))
      expect.soft(state.lgas, `${state.name} ordering`).toEqual(sorted)
    }
  })
})

describe("lgasForState", () => {
  it("returns the LGAs of a known state", () => {
    expect(lgasForState("Lagos")).toContain("Ikeja")
    expect(lgasForState("Gombe")).toContain("Yamaltu/Deba")
  })

  it("tolerates the casing and the 'State' suffix that free-text entry produced", () => {
    expect(lgasForState("lagos")).toContain("Ikeja")
    expect(lgasForState("  LAGOS State ")).toContain("Ikeja")
  })

  it("accepts the several ways people write the FCT", () => {
    for (const spelling of ["FCT", "Abuja", "federal capital territory", "F.C.T."]) {
      expect.soft(lgasForState(spelling), spelling).toContain("Gwagwalada")
    }
  })

  it("returns nothing for an unknown or empty state rather than guessing", () => {
    expect(lgasForState("Atlantis")).toEqual([])
    expect(lgasForState("")).toEqual([])
    expect(lgasForState(null)).toEqual([])
    expect(lgasForState(undefined)).toEqual([])
  })
})

describe("canonicalStateName", () => {
  it("normalises a hand-typed value", () => {
    expect(canonicalStateName("lagos state")).toBe("Lagos")
    expect(canonicalStateName("  KANO ")).toBe("Kano")
    expect(canonicalStateName("Abuja")).toBe("Federal Capital Territory")
  })

  it("returns null when nothing matches, so a caller can leave the value alone", () => {
    expect(canonicalStateName("Nowhere")).toBeNull()
    expect(canonicalStateName(null)).toBeNull()
  })
})

describe("isLgaOfState", () => {
  it("confirms an LGA belongs to its state", () => {
    expect(isLgaOfState("Lagos", "Ikeja")).toBe(true)
    expect(isLgaOfState("lagos", " ikeja ")).toBe(true)
  })

  it("rejects an LGA from a different state, which is what clears a stale selection", () => {
    expect(isLgaOfState("Lagos", "Yamaltu/Deba")).toBe(false)
    expect(isLgaOfState("Lagos", "")).toBe(false)
    expect(isLgaOfState(null, "Ikeja")).toBe(false)
  })
})
