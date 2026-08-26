import { describe, expect, it } from "vitest"
import { AuthorizationError, assertSchoolAccess, resolveTargetSchool, scopeFilter, type Actor } from "@/lib/authz-scope"

/**
 * The scope-enforcement half of the authorization boundary, which is pure and therefore
 * testable without a database. `requireActor` and friends resolve a session and are
 * covered by the integration suite still owed under item 4.1.
 *
 * These four functions are what stand between a request and another school's data, so a
 * failure here is a tenancy leak, not a cosmetic bug.
 */

const HILLCREST = "school-hillcrest"
const RIVERSIDE = "school-riverside"

function actor(role: Actor["role"], schoolId: string | null): Actor {
  return { userId: `user-${role}`, role, name: `Test ${role}`, schoolId, teacherId: null }
}

const superAdmin = actor("SUPER_ADMIN", null)
const hillcrestAdmin = actor("ADMIN", HILLCREST)
const hillcrestTeacher = actor("TEACHER", HILLCREST)
const hillcrestParent = actor("PARENT", HILLCREST)

describe("scopeFilter", () => {
  it("confines a school-scoped actor to their own school", () => {
    expect(scopeFilter(hillcrestAdmin)).toEqual({ schoolId: HILLCREST })
    expect(scopeFilter(hillcrestTeacher)).toEqual({ schoolId: HILLCREST })
    expect(scopeFilter(hillcrestParent)).toEqual({ schoolId: HILLCREST })
  })

  it("applies no filter for a super admin, who spans every school", () => {
    expect(scopeFilter(superAdmin)).toEqual({})
  })

  it("never returns a filter naming a school the actor does not belong to", () => {
    const filter = scopeFilter(hillcrestAdmin)
    expect(filter.schoolId).not.toBe(RIVERSIDE)
  })
})

describe("assertSchoolAccess", () => {
  it("permits an actor to act within their own school", () => {
    expect(() => assertSchoolAccess(hillcrestAdmin, HILLCREST)).not.toThrow()
  })

  it("refuses an actor reaching into another school", () => {
    expect(() => assertSchoolAccess(hillcrestAdmin, RIVERSIDE)).toThrow(AuthorizationError)
    expect(() => assertSchoolAccess(hillcrestTeacher, RIVERSIDE)).toThrow(AuthorizationError)
  })

  it("permits a super admin in any school", () => {
    expect(() => assertSchoolAccess(superAdmin, HILLCREST)).not.toThrow()
    expect(() => assertSchoolAccess(superAdmin, RIVERSIDE)).not.toThrow()
  })

  it("refuses when the record's school is unknown, rather than waving it through", () => {
    // A null schoolId means the caller could not establish which school the record belongs
    // to. Failing closed is the only safe reading.
    expect(() => assertSchoolAccess(hillcrestAdmin, null)).toThrow(AuthorizationError)
    expect(() => assertSchoolAccess(hillcrestAdmin, undefined)).toThrow(AuthorizationError)
    expect(() => assertSchoolAccess(hillcrestAdmin, "")).toThrow(AuthorizationError)
  })

  it("explains itself in terms a user could act on", () => {
    expect(() => assertSchoolAccess(hillcrestAdmin, RIVERSIDE)).toThrow(
      /belongs to a different school/i,
    )
  })
})

describe("resolveTargetSchool", () => {
  it("ignores the record's school for a scoped actor and uses their own", () => {
    // This is the rule that closes the hole in saveAssessments: a scoped actor's writes
    // land in their own school whatever the caller supplied.
    expect(resolveTargetSchool(hillcrestAdmin, RIVERSIDE)).toBe(HILLCREST)
    expect(resolveTargetSchool(hillcrestAdmin, undefined)).toBe(HILLCREST)
  })

  it("uses the record's school for a super admin, who has none of their own", () => {
    expect(resolveTargetSchool(superAdmin, RIVERSIDE)).toBe(RIVERSIDE)
  })

  it("refuses to guess when a super admin's target cannot be resolved from a record", () => {
    expect(() => resolveTargetSchool(superAdmin, null)).toThrow(AuthorizationError)
    expect(() => resolveTargetSchool(superAdmin, undefined)).toThrow(AuthorizationError)
  })
})

describe("AuthorizationError", () => {
  it("is distinguishable from an ordinary Error, so callers can map it to a 403", () => {
    const error = new AuthorizationError("nope")
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("AuthorizationError")
  })
})
