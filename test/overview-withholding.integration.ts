import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * The overview pages' fee check on results.
 *
 * The history page and the report card held a term's results while its fees were owed,
 * but the parent's child overview and the student's own dashboard read the current term's
 * published scores without asking, so a school that withholds results still showed every
 * score on the first page a family opens. Both overviews now ask this helper.
 */

const { prisma } = await import("@/lib/db")
const { termResultsWithheldReason } = await import("@/lib/results/withholding.server")
const { WITHHOLD_RESULTS_KEY } = await import("@/lib/system-config")

const STAMP = `ZZOverviewHold-${Date.now()}`
let schoolId = ""

beforeAll(async () => {
  for (const stale of await prisma.school.findMany({ where: { name: { startsWith: "ZZOverviewHold-" } }, select: { id: true } })) {
    await prisma.school.delete({ where: { id: stale.id } })
  }
  schoolId = (await prisma.school.create({
    data: { name: STAMP, code: STAMP.slice(0, 50), address: "Integration test", phone: "08000000000", email: `${STAMP.toLowerCase()}@example.test` },
  })).id
})

afterAll(async () => {
  if (schoolId) await prisma.school.delete({ where: { id: schoolId } })
})

const thisTerm = "term-this"
const charges = [
  { termId: thisTerm, balance: "15000.00" },
  { termId: "term-last", balance: "0.00" },
]

describe("results on the overview pages", () => {
  it("shows them when the school does not withhold, whatever is owed", async () => {
    expect(await termResultsWithheldReason(schoolId, thisTerm, charges)).toBeNull()
  })

  it("holds them while this term's fees are owed, once the school withholds", async () => {
    await prisma.systemConfiguration.create({ data: { schoolId, configKey: WITHHOLD_RESULTS_KEY, configValue: "true" } })
    expect(await termResultsWithheldReason(schoolId, thisTerm, charges, "First Term, 2026/2027"))
      .toMatch(/held until the fees for First Term, 2026\/2027 are settled/)
  })

  it("shows a term that is paid for, even while another is owed", async () => {
    expect(await termResultsWithheldReason(schoolId, "term-last", charges)).toBeNull()
  })
})
