import { randomBytes } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { decryptGatewaySecret, encryptGatewaySecret, newGatewayWebhookToken } from "@/lib/payments/gateway-credentials.server"

const marker = `ZZPaystack-${Date.now()}`
const schoolIds: string[] = []

afterAll(async () => {
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } })
})

async function createSchool(suffix: string) {
  const school = await prisma.school.create({
    data: {
      name: `${marker} ${suffix}`,
      code: `${marker}-${suffix}`.slice(0, 50),
      address: "Integration test only",
      phone: "08000000000",
      email: `${marker.toLowerCase()}-${suffix.toLowerCase()}@example.test`,
    },
  })
  schoolIds.push(school.id)
  return school
}

describe("per-school Paystack onboarding storage", () => {
  it("keeps platform-managed settlement details isolated by school and environment", async () => {
    const [first, second] = await Promise.all([createSchool("Alpha"), createSchool("Beta")])

    await Promise.all([
      prisma.schoolPaymentConfiguration.create({
        data: {
          schoolId: first.id,
          environment: "TEST",
          accountMode: "PLATFORM_MANAGED",
          status: "READY",
          subaccountCode: "ACCT_alpha_test",
          settlementBankCode: "057",
          settlementAccountLast4: "1111",
          allowedChannels: ["card", "bank_transfer"],
          verifiedAt: new Date(),
        },
      }),
      prisma.schoolPaymentConfiguration.create({
        data: {
          schoolId: second.id,
          environment: "TEST",
          accountMode: "PLATFORM_MANAGED",
          status: "READY",
          subaccountCode: "ACCT_beta_test",
          settlementBankCode: "058",
          settlementAccountLast4: "2222",
          allowedChannels: ["bank_transfer"],
          verifiedAt: new Date(),
        },
      }),
    ])

    const firstRows = await prisma.schoolPaymentConfiguration.findMany({ where: { schoolId: first.id } })
    const secondRows = await prisma.schoolPaymentConfiguration.findMany({ where: { schoolId: second.id } })

    expect(firstRows).toHaveLength(1)
    expect(secondRows).toHaveLength(1)
    expect(firstRows[0].subaccountCode).toBe("ACCT_alpha_test")
    expect(secondRows[0].subaccountCode).toBe("ACCT_beta_test")
    expect(firstRows[0].settlementAccountLast4).not.toBe(secondRows[0].settlementAccountLast4)
  })

  it("stores a school-owned secret encrypted and bound to only its configuration", async () => {
    const school = await createSchool("Owned")
    const configuration = await prisma.schoolPaymentConfiguration.create({
      data: {
        schoolId: school.id,
        environment: "TEST",
        accountMode: "SCHOOL_OWNED",
        status: "DRAFT",
        allowedChannels: ["card"],
      },
    })
    const masterKey = randomBytes(32)
    const plaintext = "sk_test_integration-not-a-real-key-6789"
    const encrypted = encryptGatewaySecret(plaintext, configuration.id, masterKey)

    const stored = await prisma.paymentGatewayCredential.create({
      data: {
        configurationId: configuration.id,
        ...encrypted,
        webhookToken: newGatewayWebhookToken(),
      },
    })

    expect(stored.encryptedSecret).not.toContain("sk_test")
    expect(stored.secretLast4).toBe("6789")
    expect(decryptGatewaySecret(stored, configuration.id, masterKey)).toBe(plaintext)
    expect(() => decryptGatewaySecret(stored, "another-configuration", masterKey)).toThrow("could not be decrypted")
  })

  it("allows one test and one live configuration but not duplicates", async () => {
    const school = await createSchool("Environment")
    await prisma.schoolPaymentConfiguration.createMany({
      data: [
        { schoolId: school.id, environment: "TEST", accountMode: "PLATFORM_MANAGED" },
        { schoolId: school.id, environment: "LIVE", accountMode: "PLATFORM_MANAGED" },
      ],
    })

    await expect(prisma.schoolPaymentConfiguration.create({
      data: { schoolId: school.id, environment: "TEST", accountMode: "SCHOOL_OWNED" },
    })).rejects.toThrow()
  })
})
