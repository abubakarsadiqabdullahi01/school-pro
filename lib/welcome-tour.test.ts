import { existsSync } from "node:fs"
import { join } from "node:path"
import type { Role } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { MODULE_GUIDES, type ModuleGuide } from "@/lib/module-guides"
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions"
import { tourStopsFor, tourStorageKey } from "@/lib/welcome-tour"

const ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT", "TEACHER", "PARENT", "STUDENT"]
const ALL: PermissionKey[] = [...PERMISSIONS]

/**
 * The tour is the first thing a new user sees, so the two ways it can embarrass
 * the product are a stop that 404s and a stop that bounces them for lack of
 * permission. Both are checked here rather than discovered by a bursar.
 */
describe("welcome tour", () => {
  it.each(ROLES)("gives %s somewhere to start", (role) => {
    expect(tourStopsFor(role, ALL).length).toBeGreaterThan(0)
  })

  it.each(ROLES)("%s stops all point at a route that exists", (role) => {
    const missing: string[] = []
    for (const stop of tourStopsFor(role, ALL)) {
      expect(stop.href.startsWith("/dashboard/")).toBe(true)
      const rest = stop.href.replace(/^\/dashboard\//, "")
      // `(roles)` is a route group, so it is in the path on disk but not in the URL.
      const candidates = [
        join("app/dashboard", rest, "page.tsx"),
        join("app/dashboard/(roles)", rest, "page.tsx"),
      ]
      if (!candidates.some((candidate) => existsSync(candidate))) missing.push(stop.href)
    }
    expect(missing).toEqual([])
  })

  it.each(ROLES)("%s stops explain why, beyond repeating the purpose", (role) => {
    for (const stop of tourStopsFor(role, ALL)) {
      const guide: ModuleGuide = MODULE_GUIDES[stop.guideKey]
      expect(stop.why.trim().length).toBeGreaterThan(30)
      expect(stop.why.trim()).not.toBe(guide.purpose.trim())
    }
  })

  it("hides stops the user's permissions would refuse", () => {
    // An admin holding only finance permissions should not be walked to the
    // compiler, which would bounce them the moment they arrived.
    const financeOnly = tourStopsFor("ADMIN", ["finance.setup", "finance.view_reports"])
    const keys = financeOnly.map((stop) => stop.guideKey)

    expect(keys).toContain("finance.fees")
    expect(keys).not.toContain("compiler.classResults")
    expect(keys).not.toContain("admin.permissions")
  })

  it("keeps stops that are not permission-gated", () => {
    // A teacher holds none of the 19 permissions by default; their tour must
    // still have content rather than collapsing to nothing.
    expect(tourStopsFor("TEACHER", []).length).toBeGreaterThan(0)
    expect(tourStopsFor("PARENT", []).length).toBeGreaterThan(0)
    expect(tourStopsFor("STUDENT", []).length).toBeGreaterThan(0)
  })

  it("keeps the tour short enough that people finish it", () => {
    for (const role of ROLES) {
      expect(tourStopsFor(role, ALL).length).toBeLessThanOrEqual(7)
    }
  })

  it("scopes the dismissal key to the user", () => {
    // A shared school computer must not hide the tour from the next person.
    expect(tourStorageKey("user-a")).not.toBe(tourStorageKey("user-b"))
    expect(tourStorageKey("user-a")).toContain("user-a")
  })
})
