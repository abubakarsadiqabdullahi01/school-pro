import { describe, expect, it } from "vitest"
import {
  hasPermission,
  normalizePermissions,
  resolveEffectivePermissions,
  SYSTEM_PERMISSION_PROFILES,
} from "@/lib/permissions"

describe("permission profile resolution", () => {
  it("keeps existing broad roles working while profiles add narrower duties", () => {
    const permissions = resolveEffectivePermissions("TEACHER", [
      {
        code: "EXAMS",
        permissions: SYSTEM_PERMISSION_PROFILES.EXAMS.permissions,
      },
    ])

    expect(permissions.has("compiler.enter_scores")).toBe(true)
    expect(permissions.has("compiler.publish_results")).toBe(true)
    expect(permissions.has("finance.collect_payments")).toBe(false)
  })

  it("ignores inactive profiles", () => {
    expect(
      hasPermission("TEACHER", "finance.collect_payments", [
        {
          code: "FINANCE",
          permissions: ["finance.collect_payments"],
          isActive: false,
        },
      ]),
    ).toBe(false)
  })

  it("drops unknown permission strings instead of granting accidental access", () => {
    expect(normalizePermissions(["compiler.publish_results", "compiler.delete_everything"])).toEqual([
      "compiler.publish_results",
    ])
  })

  it("gives accountants finance rights without making them school managers", () => {
    const permissions = resolveEffectivePermissions("ACCOUNTANT")

    expect(permissions.has("finance.collect_payments")).toBe(true)
    expect(permissions.has("finance.view_reports")).toBe(true)
    expect(permissions.has("students.manage")).toBe(false)
    expect(permissions.has("compiler.lock_results")).toBe(false)
  })

  it("lets an accountant spend and pay, but never approve their own work", () => {
    // The split the expenditure and payroll modules are built around, and the reason an
    // accountant has their own /dashboard/accountant/expenditure and .../hr routes at all.
    // Recording a voucher and approving it must not be the same pair of hands.
    const permissions = resolveEffectivePermissions("ACCOUNTANT")

    expect(permissions.has("expenditure.manage")).toBe(true)
    expect(permissions.has("expenditure.approve")).toBe(false)

    expect(permissions.has("payroll.pay")).toBe(true)
    expect(permissions.has("payroll.manage")).toBe(false)
  })
})
