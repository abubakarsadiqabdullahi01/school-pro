/**
 * What may be done to a term, and why not.
 *
 * The rules are enforced in `app/actions/term-management.ts`, which is the boundary that
 * matters — a client cannot be trusted with them. These are the same rules expressed as
 * pure predicates so the UI can grey out an action instead of offering one the server will
 * refuse. An admin who confirms a red "permanently delete" dialog and *then* gets told no
 * has been misled by the interface, even though nothing was deleted.
 *
 * Kept free of Prisma and of `next/headers` so both halves can import it, and so the rules
 * can be unit tested without a database.
 */

export type TermRuleSubject = {
  endDate: Date | string
  isCurrent: boolean
}

/** A verdict, with the sentence to show when the answer is no. */
export type TermRuleVerdict = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: TermRuleVerdict = { allowed: true }

function endOf(term: TermRuleSubject): Date {
  return term.endDate instanceof Date ? term.endDate : new Date(term.endDate)
}

/** True once the term's end date has passed. */
export function hasTermEnded(term: TermRuleSubject, now: Date = new Date()): boolean {
  return endOf(term) < now
}

/**
 * Whether a term may be deleted.
 *
 * Note this says nothing about assessments or fee structures — the server checks those too,
 * because only it can count them. This covers the two rules the client already knows.
 */
export function canDeleteTerm(term: TermRuleSubject, now: Date = new Date()): TermRuleVerdict {
  if (term.isCurrent) {
    return { allowed: false, reason: "The current term cannot be deleted." }
  }
  if (hasTermEnded(term, now)) {
    return {
      allowed: false,
      reason: "This term has already ended and is part of the school's record.",
    }
  }
  return ALLOWED
}

/**
 * Whether a term may be made the current one.
 *
 * Reopening an ended term changes which term new scores and fee charges are filed against,
 * so it is a platform-level decision rather than one a school admin makes alone.
 */
export function canSetTermCurrent(
  term: TermRuleSubject,
  role: string | null | undefined,
  now: Date = new Date(),
): TermRuleVerdict {
  if (term.isCurrent) {
    return { allowed: false, reason: "This is already the current term." }
  }
  if (hasTermEnded(term, now) && role !== "SUPER_ADMIN") {
    return {
      allowed: false,
      reason: "Only a super admin can make a term that has already ended current again.",
    }
  }
  return ALLOWED
}

/**
 * A session, for the purpose of these rules. Same shape as a term: it runs to an end date
 * and may be the school's current one.
 */
export type SessionRuleSubject = TermRuleSubject

/** True once the session's end date has passed. */
export function hasSessionEnded(session: SessionRuleSubject, now: Date = new Date()): boolean {
  return hasTermEnded(session, now)
}

/**
 * Whether a new term may be added to a session.
 *
 * A session that has finished is a closed year. Adding a term to it rewrites a calendar
 * that results, fee charges and promotion trails are already filed against — almost always
 * a misclick in a dropdown rather than an intention, which is why the ended sessions are
 * offered greyed out rather than simply listed.
 *
 * A super admin can still do it, because correcting a school's historical calendar is a
 * real job and there has to be somebody who can.
 */
export function canAddTermToSession(
  session: SessionRuleSubject,
  role: string | null | undefined,
  now: Date = new Date(),
): TermRuleVerdict {
  if (hasSessionEnded(session, now) && role !== "SUPER_ADMIN") {
    return {
      allowed: false,
      reason: "This session has ended — only a super admin can add a term to it.",
    }
  }
  return ALLOWED
}

/**
 * Whether a term's details may be changed.
 *
 * Moving the dates of a term that has finished rewrites a period that results, fee charges
 * and promotion decisions are already filed against — a First Term with released report
 * cards should not quietly become three weeks longer.
 *
 * This also covers a term sitting in a session that has closed: a term always ends on or
 * before its session does, so a closed session's terms have all ended.
 */
export function canEditTerm(
  term: TermRuleSubject,
  role: string | null | undefined,
  now: Date = new Date(),
): TermRuleVerdict {
  if (hasTermEnded(term, now) && role !== "SUPER_ADMIN") {
    return {
      allowed: false,
      reason: "This term has already ended — only a super admin can change its dates or name.",
    }
  }
  return ALLOWED
}

/** The three terms a Nigerian school session runs. A session has one of each, at most. */
export const TERM_NAMES = ["First Term", "Second Term", "Third Term"] as const

/**
 * Whether a term name is still free in a session.
 *
 * A session holds one First, one Second and one Third Term. The server has always refused
 * a duplicate, but only after the form was filled in and submitted — so the name is now
 * also greyed out in the dropdown, which is the point at which somebody can still change
 * their mind cheaply.
 *
 * `editingName` is the name the term being edited already has: renaming First Term to
 * First Term is not a clash with itself.
 */
export function canUseTermName(
  name: string,
  existingNames: readonly string[],
  editingName?: string | null,
): TermRuleVerdict {
  if (editingName && name === editingName) {
    return ALLOWED
  }
  if (existingNames.includes(name)) {
    return { allowed: false, reason: "Already created in this session." }
  }
  return ALLOWED
}

/**
 * Whether teaching assignments may be created or changed in a term.
 *
 * A term that has ended has been marked, released and in most cases locked. Adding a
 * teacher to it, or quietly dropping one, rewrites who is on the record as having taught a
 * class whose results are already out.
 *
 * This closes a one-way door: `unassignTeacherFromSubject` already refused to remove an
 * assignment from a past term "to maintain historical records", while the term picker on
 * the assignment screens offered every past term and the bulk save happily wrote into one.
 * You could put a teacher into a closed term and then never take them out again — and the
 * bulk path could delete past-term rows that the single-unassign path protected.
 *
 * Judged on the end date rather than `isCurrent`, so a term that has not started yet is
 * still open: setting next term's timetable in advance is ordinary work, not history.
 */
export function canAssignInTerm(
  term: TermRuleSubject,
  role: string | null | undefined,
  now: Date = new Date(),
): TermRuleVerdict {
  if (hasTermEnded(term, now) && role !== "SUPER_ADMIN") {
    return {
      allowed: false,
      reason: "This term has ended — only a super admin can change who taught in it.",
    }
  }
  return ALLOWED
}
