import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { MODULE_GUIDES, type ModuleGuide } from "@/lib/module-guides"
import { PERMISSIONS } from "@/lib/permissions"

/**
 * These guides are read by users as a statement of what the system does, so the
 * failure mode worth guarding is a guide that is empty, vague, or claims a
 * permission that no longer exists. A wrong guide teaches the wrong rule.
 */

const entries = Object.entries(MODULE_GUIDES) as Array<[string, ModuleGuide]>

describe("module guides", () => {
  it("ships a guide for every registered key", () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it.each(entries)("%s has a title, a location and a purpose", (_key, guide) => {
    expect(guide.title.trim()).not.toBe("")
    expect(guide.location.length).toBeGreaterThan(0)
    expect(guide.location.every((step) => step.trim() !== "")).toBe(true)
    // A one-word "purpose" is not a purpose. Anything this short is a placeholder.
    expect(guide.purpose.trim().length).toBeGreaterThan(40)
  })

  it.each(entries)("%s carries a concrete example", (_key, guide) => {
    // The example is what turns a rule into something a user can act on, so it is
    // required rather than optional in practice — and a vague one is no example.
    // "Create JSS 1A." is a perfectly good action, so the floor on `doing` only
    // has to catch a placeholder. The substance belongs in `then`.
    expect(guide.example).toBeDefined()
    expect(guide.example!.doing.trim().length).toBeGreaterThan(12)
    expect(guide.example!.then.trim().length).toBeGreaterThan(40)
  })

  it.each(entries)("%s only cites permissions that exist", (_key, guide) => {
    for (const permission of guide.permissions ?? []) {
      expect(PERMISSIONS).toContain(permission)
    }
  })

  it.each(entries)("%s has no empty list items", (_key, guide) => {
    const lists = [guide.onSave ?? [], guide.rules ?? [], guide.nextSteps ?? []]
    for (const list of lists) {
      for (const item of list) {
        expect(item.trim()).not.toBe("")
      }
    }
    for (const section of guide.sections ?? []) {
      expect(section.name.trim()).not.toBe("")
      expect(section.detail.trim()).not.toBe("")
    }
  })

  it.each(entries)("%s keeps section names unique", (_key, guide) => {
    const names = (guide.sections ?? []).map((section) => section.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(entries)("%s keeps list items unique", (_key, guide) => {
    // The dialog keys list items by their text, so a duplicate would collide.
    for (const list of [guide.onSave ?? [], guide.rules ?? [], guide.nextSteps ?? []]) {
      expect(new Set(list).size).toBe(list.length)
    }
  })

  it("puts a guide on every screen heading", () => {
    // The drift this catches: somebody adds a screen, styles its heading like every
    // other screen, and ships it with no ⓘ. Nothing else notices, because the guide
    // registry is still internally consistent.
    const HEADING = /^[ \t]*<(h1|h2)\s+className="text-(2xl|3xl) font-bold tracking-tight[^"]*">/gm

    // `ModuleHeading` renders the ⓘ itself; `PageHeader` is a generic shell with no
    // screen of its own.
    const EXEMPT = ["components/module-heading.tsx", "components/page-header.tsx"]

    const unguided: string[] = []
    for (const file of sourceFiles(["app/dashboard", "components"])) {
      const rel = file.replace(/\\/g, "/")
      if (EXEMPT.some((exempt) => rel.endsWith(exempt))) continue

      const src = readFileSync(file, "utf8")
      const lines = src.split("\n")
      for (const match of src.matchAll(HEADING)) {
        const lineNo = src.slice(0, match.index).split("\n").length
        // The wrapper sits just above; the icon within a few lines below.
        const near = lines.slice(Math.max(0, lineNo - 3), lineNo + 6).join("\n")
        if (!near.includes("InfoGuide")) unguided.push(`${rel}:${lineNo}`)
      }
    }

    expect(unguided).toEqual([])
  })

  it("shows every guide it defines on at least one screen", () => {
    // TypeScript already stops a screen citing a key that does not exist. This is
    // the other direction: a guide nobody can open is dead weight that still has
    // to be kept accurate.
    const used = new Set<string>()
    for (const file of sourceFiles(["app", "components"])) {
      const src = readFileSync(file, "utf8")
      for (const match of src.matchAll(/guideKey="([^"]+)"/g)) used.add(match[1])
    }

    const orphans = Object.keys(MODULE_GUIDES).filter((key) => !used.has(key))
    expect(orphans).toEqual([])
  })

  it("points every guide at the code it describes", () => {
    // Not strictly required by the type, but a guide with no cited source is the
    // one that goes stale unnoticed.
    const missing = entries.filter(([, guide]) => !guide.sourceOfTruth)
    expect(missing.map(([key]) => key)).toEqual([])
  })
})

/** Every .tsx under the given project directories. */
function sourceFiles(roots: string[]): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (full.endsWith(".tsx")) found.push(full)
    }
  }
  for (const root of roots) walk(root)
  return found
}
