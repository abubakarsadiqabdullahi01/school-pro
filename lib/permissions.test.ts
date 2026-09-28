import { describe, expect, it } from "vitest"
import {
  hasPermission,
  normalizePermissions,
  PERMISSION_GROUPS,
  PERMISSIONS,
  resolveEffectivePermissions,
  SYSTEM_PERMISSION_PROFILES,
  TEACHER_ASSIGNMENT_PERMISSIONS,
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

describe("who assigns teachers, and who hires them", () => {
  const examsOfficer = resolveEffectivePermissions("TEACHER", [
    { code: "EXAMS", permissions: SYSTEM_PERMISSION_PROFILES.EXAMS.permissions },
  ])
  const hrOfficer = resolveEffectivePermissions("ACCOUNTANT", [
    { code: "HR", permissions: SYSTEM_PERMISSION_PROFILES.HR.permissions },
  ])

  it("lets the Exams Officer assign teachers to classes and subjects", () => {
    // Every teacher-assignment action accepts any of these; the profile held none of them
    // before academics.manage was added to the list.
    expect(TEACHER_ASSIGNMENT_PERMISSIONS.some((permission) => examsOfficer.has(permission))).toBe(true)
  })

  it("does not let the Exams Officer hire, edit or remove a teacher", () => {
    expect(examsOfficer.has("teachers.manage")).toBe(false)
  })

  it("routes hiring through HR", () => {
    expect(hrOfficer.has("teachers.manage")).toBe(true)
    expect(hrOfficer.has("payroll.manage")).toBe(true)
  })
})

describe("a bursar cannot waive what they collect", () => {
  it("keeps fee setup, discounts and exemptions away from the Finance Officer", () => {
    // finance.setup carries discounts, exemptions and finance logins. The accountant screens
    // were all built on the accountant not having it.
    expect(SYSTEM_PERMISSION_PROFILES.FINANCE.permissions).not.toContain("finance.setup")
    expect(resolveEffectivePermissions("ACCOUNTANT").has("finance.setup")).toBe(false)
    expect(resolveEffectivePermissions("ACCOUNTANT").has("finance.collect_payments")).toBe(true)
  })
})

describe("the permission grid", () => {
  it("shows every permission in exactly one group", () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions)
    expect([...grouped].sort()).toEqual([...PERMISSIONS].sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })
})
