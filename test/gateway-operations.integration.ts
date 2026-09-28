import { createHash } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const context = vi.hoisted(() => ({ schoolId: "", processResult: "processed" }))
const audit = vi.hoisted(() => ({ record: vi.fn() }))

vi.mock("@/lib/authz", () => ({
  requirePermission: async () => ({
    userId: "gateway-operations-test",
    role: "ADMIN",
    name: "Gateway Operations Test",
    schoolId: context.schoolId,
    teacherId: null,
  }),
}))
vi.mock("@/lib/audit", () => ({ recordAudit: audit.record }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/payments/gateway-event-processor.server", () => ({
  processGatewayEvent: async () => context.processResult,
}))

const { prisma } = await import("@/lib/db")
const {
  getGatewayTransactionDetail,
  getGatewayTransactionRegister,
  reprocessGatewayEvent,
} = await import("@/app/actions/gateway-operations")

const marker = `ZZGatewayOps-${Date.now()}`
const schoolIds: string[] = []
const userIds: string[] = []
let firstTransactionId = ""
let secondTransactionId = ""
let firstEventId = ""

async function fixture(suffix: string) {
  const school = await prisma.school.create({
    data: { name: `${marker} ${suffix}`, code: `${marker}-${suffix}`.slice(0, 50), address: "Test", phone: "08000000000", email: `${marker}-${suffix}@example.test` },
  })
  schoolIds.push(school.id)
  const user = await prisma.user.create({ data: { firstName: suffix, lastName: "Student", role: "STUDENT" } })
  userIds.push(user.id)
  const student = await prisma.student.create({ data: { schoolId: school.id, userId: user.id, admissionNo: `${marker}-${suffix}` } })
  const session = await prisma.session.create({ data: { schoolId: school.id, name: `${suffix} Session`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } })
  const term = await prisma.term.create({ data: { sessionId: session.id, name: `${suffix} Term`, startDate: new Date("2026-01-01"), endDate: new Date("2026-04-01") } })
  const transaction = await prisma.gatewayTransaction.create({
    data: { schoolId: school.id, studentId: student.id, termId: term.id, environment: "TEST", reference: `${marker}-${suffix}-reference`, status: "FAILED", amountExpected: 1000, amountRequested: 1000, failureMessage: "Provider timeout" },
  })
  const event = await prisma.gatewayEvent.create({
    data: { schoolId: school.id, gatewayTransactionId: transaction.id, environment: "TEST", eventType: "charge.success", reference: transaction.reference, payloadHash: createHash("sha256").update(`${marker}-${suffix}`).digest("hex"), status: "FAILED", lastError: "Temporary provider failure" },
  })
  return { school, transaction, event }
}

beforeAll(async () => {
  await prisma.gatewayEvent.deleteMany({ where: { reference: { startsWith: "ZZGatewayOps-" } } })
  const stale = await prisma.school.findMany({ where: { name: { startsWith: "ZZGatewayOps-" } }, select: { id: true } })
  if (stale.length) await prisma.school.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } })
  const first = await fixture("Alpha")
  const second = await fixture("Beta")
  context.schoolId = first.school.id
  firstTransactionId = first.transaction.id
  secondTransactionId = second.transaction.id
  firstEventId = first.event.id
})

afterAll(async () => {
  await prisma.gatewayEvent.deleteMany({ where: { reference: { startsWith: marker } } })
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
})

describe("gateway finance operations tenancy and recovery", () => {
  it("lists only transactions belonging to the actor's school", async () => {
    const result = await getGatewayTransactionRegister({ query: marker })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.rows.map((row) => row.id)).toEqual([firstTransactionId])
  })

  it("does not reveal another school's transaction detail", async () => {
    const result = await getGatewayTransactionDetail(secondTransactionId)
    expect(result).toEqual({ success: false, error: "Online payment was not found" })
  })

  it("requires an exact school-scoped failed event and audits the controlled retry", async () => {
    const denied = await reprocessGatewayEvent({ transactionId: secondTransactionId, eventId: firstEventId, confirmation: true })
    expect(denied.success).toBe(false)

    const accepted = await reprocessGatewayEvent({ transactionId: firstTransactionId, eventId: firstEventId, confirmation: true })
    expect(accepted).toEqual({ success: true, data: { result: "processed" } })
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ schoolId: context.schoolId, entityId: firstEventId }))
  })
})
