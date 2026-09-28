/**
 * What may be done to a fee category or a fee schedule, and why not.
 *
 * A schedule is not a row in a list — it is the reason a student owes money. Its charges
 * carry payments, discounts and exemptions, and `StudentCharge.feeSchedule` is RESTRICT
 * precisely so nothing can quietly delete the bill out from under a receipt. These are the
 * rules that decide what is safe, in the same shape as `lib/class-rules.ts` and
 * `lib/term-rules.ts`: pure predicates the screen greys an action out with and the server
 * refuses on, so the two cannot drift.
 */

export type FeeVerdict = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: FeeVerdict = { allowed: true }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Whether a schedule may still be re-pointed — its scope, category or audience changed.
 *
 * Once charges exist they were raised against a class, a category and an audience, and
 * changing any of those would leave the bills describing something that never happened.
 * Moving a schedule after it has billed is a new schedule, not an edit.
 */
export function canRepointFeeSchedule(facts: { chargeCount: number }): FeeVerdict {
  if (facts.chargeCount === 0) return ALLOWED

  return {
    allowed: false,
    reason: `This schedule has already raised ${plural(
      facts.chargeCount,
      "charge",
      "charges",
    )}. Who it bills, the category it reports under and who it applies to are fixed once a bill exists — create a new schedule instead.`,
  }
}

/**
 * Whether a charge can take a new amount.
 *
 * Only an untouched one. A charge with money against it, or with a discount or exemption
 * applied, has been reasoned about by somebody — re-pricing it behind their back would move
 * a balance a parent has already been shown.
 */
export function isRepriceable(charge: {
  amountPaid: number
  discountAmount: number
  exemptedAmount: number
}): boolean {
  return charge.amountPaid === 0 && charge.discountAmount === 0 && charge.exemptedAmount === 0
}

/**
 * Whether a schedule may be deleted.
 *
 * Deleting takes its charges with it, and a charge deletes its payment allocations in turn —
 * so a receipt would survive with nothing saying what it paid for. Anything settled or
 * adjusted makes this permanent damage rather than a tidy-up, and deactivating is the answer
 * instead: it stops the schedule billing anyone new and leaves the history alone.
 */
export function canDeleteFeeSchedule(facts: {
  chargeCount: number
  settledCharges: number
  adjustedCharges: number
}): FeeVerdict {
  if (facts.settledCharges > 0) {
    return {
      allowed: false,
      reason: `${plural(
        facts.settledCharges,
        "student has",
        "students have",
      )} paid against this schedule. Deleting it would delete their charges and cut the receipts loose from what they paid for. Deactivate it instead.`,
    }
  }

  if (facts.adjustedCharges > 0) {
    return {
      allowed: false,
      reason: `${plural(
        facts.adjustedCharges,
        "charge carries",
        "charges carry",
      )} a discount or an exemption. Deleting the schedule would throw those decisions away. Deactivate it instead.`,
    }
  }

  return ALLOWED
}

/** What deleting a schedule will actually take with it, for the confirmation. */
export function describeFeeScheduleDeletion(facts: { chargeCount: number }): string {
  if (facts.chargeCount === 0) {
    return "Nothing has been billed against this schedule, so nothing else is affected."
  }

  return `${plural(
    facts.chargeCount,
    "unpaid charge",
    "unpaid charges",
  )} will be deleted with it, and those students will no longer owe this fee.`
}

/**
 * Whether a category may be deleted.
 *
 * Nothing may still point at it. The schedule relation is RESTRICT in the database, so this
 * is the same refusal said in words rather than as a foreign key error; discounts and
 * exemptions would merely lose the category they were granted under, which is worse — it is
 * silent.
 */
export function canDeleteFeeCategory(facts: {
  scheduleCount: number
  discountCount: number
  exemptionCount: number
}): FeeVerdict {
  if (facts.scheduleCount > 0) {
    return {
      allowed: false,
      reason: `${plural(
        facts.scheduleCount,
        "fee schedule reports",
        "fee schedules report",
      )} under this category. Delete or move them first, or deactivate the category to stop it being used.`,
    }
  }

  const adjustments = facts.discountCount + facts.exemptionCount
  if (adjustments > 0) {
    return {
      allowed: false,
      reason: `${plural(
        adjustments,
        "discount or exemption was",
        "discounts or exemptions were",
      )} granted under this category. Deleting it would leave them describing nothing. Deactivate it instead.`,
    }
  }

  return ALLOWED
}

/**
 * Whether a category may be switched off.
 *
 * An inactive category cannot be picked for a new schedule, which is the point. While active
 * schedules still report under it, switching it off would hide the heading their money is
 * counted below.
 */
export function canDeactivateFeeCategory(facts: { activeScheduleCount: number }): FeeVerdict {
  if (facts.activeScheduleCount === 0) return ALLOWED

  return {
    allowed: false,
    reason: `${plural(
      facts.activeScheduleCount,
      "active fee schedule reports",
      "active fee schedules report",
    )} under this category. Deactivate those first.`,
  }
}

/**
 * Whether a category name is free.
 *
 * `@@unique([schoolId, name])` enforces it, but a name is compared here the way a person
 * would: "Tuition" and "tuition " are the same heading, and the form should say so before it
 * submits rather than returning a constraint error.
 */
export function canUseFeeCategoryName(
  name: string,
  existing: Array<{ id: string; name: string }>,
  excludeId?: string,
): FeeVerdict {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return { allowed: false, reason: "A category needs a name." }

  const clash = existing.find(
    (category) => category.id !== excludeId && category.name.trim().toLowerCase() === wanted,
  )

  return clash
    ? { allowed: false, reason: `This school already has a category called “${clash.name}”.` }
    : ALLOWED
}
