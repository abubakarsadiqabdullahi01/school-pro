/**
 * What may be done to a salary scale, an allowance type or a deduction type.
 *
 * The three are different objects with the same shape of risk: each is referenced by staff
 * records, each is unique on (school, name), and each appears by name on payslips that have
 * already been issued. So they share one set of predicates — pure, testable, and used by
 * both the screen and the server action, so a greyed-out button and a refused request always
 * say the same thing.
 *
 * The rule that matters: **retire, do not delete.** A scale somebody is on carries their pay
 * history; an allowance or deduction that has ever been assigned is named on past payslips.
 * Deleting either would leave the record unable to explain itself. Retiring takes it off the
 * forms for new assignments and leaves every issued payslip resolving exactly as it did.
 */

export type ComponentVerdict = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: ComponentVerdict = { allowed: true }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** What the thing is called in a sentence, so one predicate can serve all three screens. */
export type ComponentNoun = "salary scale" | "allowance" | "deduction"

/**
 * Whether a name is free.
 *
 * All three tables are unique on (school, name), so a clash is a constraint error on submit
 * unless it is caught as it is typed. Compared case-insensitively and trimmed, because
 * "Housing" and "housing " are the same allowance to everyone but the database.
 */
export function canUseComponentName(
  name: string,
  taken: Array<{ id: string; name: string }>,
  noun: ComponentNoun,
  selfId?: string,
): ComponentVerdict {
  const trimmed = name.trim()

  if (trimmed.length < 2) {
    return { allowed: false, reason: `Give the ${noun} a name of at least two characters.` }
  }

  const clash = taken.find(
    (entry) => entry.id !== selfId && entry.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  if (clash) {
    return { allowed: false, reason: `${clash.name} already exists. Names must be distinct.` }
  }

  return ALLOWED
}

/**
 * Whether a salary scale may be deleted.
 *
 * Only one nobody has ever been put on. A `StaffSalary` row records what a person was paid
 * and from when, and it names the scale it came from — deleting the scale would leave the
 * pay history pointing at nothing.
 */
export function canDeleteSalaryScale(facts: { staffCount: number }): ComponentVerdict {
  if (facts.staffCount === 0) return ALLOWED

  return {
    allowed: false,
    reason: `${plural(
      facts.staffCount,
      "member of staff is",
      "members of staff are",
    )} on this scale. Deleting it would cut their pay history loose from the level it was set at. Retire it instead.`,
  }
}

/**
 * Whether an allowance or deduction type may be deleted.
 *
 * Only one that has never been assigned. Once it has, its name is on issued payslips and in
 * the allowance and deduction reports, and those have to keep resolving.
 */
export function canDeletePayComponent(
  facts: { assignedCount: number },
  noun: "allowance" | "deduction",
): ComponentVerdict {
  if (facts.assignedCount === 0) return ALLOWED

  return {
    allowed: false,
    reason: `This ${noun} is assigned to ${plural(
      facts.assignedCount,
      "member of staff",
      "members of staff",
    )}. Its name appears on payslips already issued, which have to keep resolving. Retire it instead.`,
  }
}

/**
 * What to say when retiring, or null when there is nothing to warn about.
 *
 * Retiring is never refused — it only takes the thing off the forms for new assignments. But
 * the people already on it keep it until somebody stops it on their record, and that is not
 * obvious from a button marked "Retire".
 */
export function retireComponentNote(
  facts: { assignedCount: number },
  noun: ComponentNoun,
): string | null {
  if (facts.assignedCount === 0) return null

  return `${plural(
    facts.assignedCount,
    "member of staff keeps",
    "members of staff keep",
  )} this ${noun} until it is stopped on their own record. Retiring only takes it off the list for new assignments.`
}

/**
 * What changing a scale's base salary does — which is nothing, on purpose.
 *
 * Assigning a scale copies its base salary onto the staff record, so the scale is a template
 * rather than a live link. Editing it changes what the next assignment starts from and leaves
 * everybody already on it exactly as they are. That is the safe behaviour, and it is also the
 * surprising one, so the screen says it.
 */
export function baseSalaryChangeNote(
  current: string | number,
  next: string | number,
  facts: { staffCount: number },
): string | null {
  if (Number(current) === Number(next) || !Number.isFinite(Number(next))) return null
  if (facts.staffCount === 0) return "Nobody is on this scale yet, so this only sets where the next assignment starts."

  return `${plural(
    facts.staffCount,
    "member of staff stays",
    "members of staff stay",
  )} on their current pay — a scale is copied onto the record when it is assigned, not linked to it. This changes where the next assignment starts.`
}
