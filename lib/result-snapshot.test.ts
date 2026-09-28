import { describe, expect, it } from "vitest"
import { gradingSystemFromSnapshot } from "@/lib/result-snapshot"

describe("gradingSystemFromSnapshot", () => {
  it("returns a frozen valid grading policy", () => {
    expect(gradingSystemFromSnapshot({
      passMark: 50,
      levels: [{ minScore: 50, maxScore: 100, grade: "P", remark: "Pass" }],
    }))?.toEqual({
      passMark: 50,
      levels: [{ minScore: 50, maxScore: 100, grade: "P", remark: "Pass" }],
    })
  })

  it("rejects malformed snapshots instead of corrupting a report", () => {
    expect(gradingSystemFromSnapshot({ passMark: 40, levels: [{ grade: "A" }] })).toBeNull()
  })
})
