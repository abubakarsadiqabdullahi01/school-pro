import { prisma } from "@/lib/db"
import { toE164 } from "@/lib/notifications/phone"

/**
 * Who should be told about a particular child, and on which channel.
 *
 * The rule that shapes this: **a message about a child goes to that child's own people.**
 * It sounds obvious and it is exactly the mistake a bulk send makes — one wrong join and
 * four hundred families learn something about somebody else's child. So recipients are
 * always resolved per student, through `StudentParent`, and never by fetching "all parents
 * in the school".
 *
 * Consent is honoured here rather than at send time. A muted channel produces no outbox row
 * at all, so an opt-out cannot be undone by a later bug in the worker, and the queue never
 * contains a message nobody agreed to receive.
 */

export type Recipient = {
  userId: string
  name: string
  /** E.164, or null when the stored number cannot be trusted to deliver. */
  phone: string | null
  email: string | null
  allowSms: boolean
  allowEmail: boolean
  /** How this person is related to the learner, for a screen listing who will be told. */
  relationship: "PARENT" | "STUDENT"
}

export type StudentRecipients = {
  studentId: string
  studentName: string
  className: string | null
  recipients: Recipient[]
  /** Why nobody can be reached, when that is the case. */
  problem: string | null
}

/** Email lives on `Credential`, not on `User`, so it has to be looked up rather than read. */
type UserRow = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  isActive: boolean
  notifyBySms: boolean
  notifyByEmail: boolean
  credentials: Array<{ type: string; value: string }>
}

function toRecipient(user: UserRow, relationship: Recipient["relationship"]): Recipient {
  const email =
    user.credentials.find((credential) => credential.type === "EMAIL")?.value.toLowerCase() ?? null
  const phone = toE164(user.phone)

  return {
    userId: user.id,
    name: `${user.firstName} ${user.lastName}`,
    phone,
    email,
    // An inactive account is not a consent question — nobody should be messaged on behalf
    // of a login that has been switched off.
    allowSms: user.isActive && user.notifyBySms && phone !== null,
    allowEmail: user.isActive && user.notifyByEmail && email !== null,
    relationship,
  }
}

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  notifyBySms: true,
  notifyByEmail: true,
  credentials: { select: { type: true, value: true } },
} as const

/**
 * Guardians for a set of learners, plus the learners themselves where they have a login.
 *
 * Batched over the whole class rather than queried per child: publishing results for a
 * class of forty would otherwise be a hundred and twenty round trips.
 */
export async function recipientsForStudents(
  studentIds: string[],
  schoolId: string,
): Promise<StudentRecipients[]> {
  if (studentIds.length === 0) return []

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, schoolId },
    select: {
      id: true,
      user: { select: USER_SELECT },
      parents: {
        select: {
          parent: { select: { user: { select: USER_SELECT } } },
        },
      },
      classTerms: {
        orderBy: { classTerm: { term: { startDate: "desc" } } },
        take: 1,
        select: { classTerm: { select: { class: { select: { name: true } } } } },
      },
    },
  })

  return students.map((student) => {
    const guardians = student.parents.map((link) => toRecipient(link.parent.user, "PARENT"))

    // The learner's own login is included only when there are no guardians at all. A
    // sixteen-year-old with their own account should not be the school's first choice for
    // "your fees are unpaid", but silence is worse than telling the person concerned.
    const recipients =
      guardians.length > 0 ? guardians : [toRecipient(student.user, "STUDENT")]

    const reachable = recipients.filter(
      (recipient) => recipient.allowSms || recipient.allowEmail,
    )

    let problem: string | null = null
    if (recipients.length === 0) {
      problem = "No guardian is linked to this learner"
    } else if (reachable.length === 0) {
      const anyContact = recipients.some((r) => r.phone !== null || r.email !== null)
      problem = anyContact
        ? "Everyone linked to this learner has turned notifications off"
        : "No usable phone number or email address on file"
    }

    return {
      studentId: student.id,
      studentName: `${student.user.firstName} ${student.user.lastName}`,
      className: student.classTerms[0]?.classTerm.class.name ?? null,
      recipients: reachable,
      problem,
    }
  })
}

/** Everyone who would be told, flattened — what a "this will reach N people" line counts. */
export function countReachable(
  groups: StudentRecipients[],
  channel: "SMS" | "EMAIL",
): number {
  return groups.reduce(
    (total, group) =>
      total +
      group.recipients.filter((recipient) =>
        channel === "SMS" ? recipient.allowSms : recipient.allowEmail,
      ).length,
    0,
  )
}
