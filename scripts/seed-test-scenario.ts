/**
 * Builds a test scenario on top of the demo school, and hands back known logins.
 *
 * `seed:demo` produces a believable school — 65 learners with Nigerian names, real fee
 * structures, real payments — but it leaves two holes that make the portal work impossible
 * to check:
 *
 *   - Third Term of the current session has subjects and enrolments but no released marks,
 *     so a session summary can only ever cover two terms out of three;
 *   - the previous session has enrolments but no subjects at all, so there is no prior year
 *     for the session tabs to show.
 *
 * This fills both for a handful of learners, shapes three deliberately different fee
 * situations so the withholding switch can be seen doing something, and sets passwords
 * nobody has to guess. Everything it writes is marked, so it can be run again without
 * doubling up.
 *
 * Usage:
 *   npm run seed:test-scenario
 *
 * It refuses to run against anything but a local database. That guard is not politeness:
 * this script sets known passwords on real accounts, and running it against a school's
 * live data would hand every one of those accounts to whoever read this file.
 */

import bcrypt from "bcryptjs"

import { prisma } from "@/lib/db"
import { defaultPasswordForStudent, defaultPasswordForDate } from "@/lib/auth/default-password"

const ADMIN_PASSWORD = "Brightfield#2026"

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? ""
  const host = url.match(/@([^:/?]+)/)?.[1] ?? ""
  const local = ["localhost", "127.0.0.1", "::1", "mysql", "db"]
  if (!local.includes(host)) {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${host}", which is not a local database. ` +
        `This script sets known passwords and must never touch a school's live data.`,
    )
  }
  if (process.env.ALLOW_TEST_SCENARIO !== "yes") {
    throw new Error(
      "Refusing to run without ALLOW_TEST_SCENARIO=yes. " +
        "This rewrites marks, balances and passwords on every account it names.",
    )
  }
}

/** Deterministic pseudo-random, so re-running produces the same marks rather than new ones. */
function seededScore(seed: string, min: number, max: number): number {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return min + (hash % (max - min + 1))
}

/**
 * Leaves a learner genuinely owing, by taking the money away rather than editing a number.
 *
 * The obvious way to stage a debtor is `updateMany({ balance: 60_000 })`, and that is what
 * this script used to do. It produces a row no real payment path could create: a charge
 * for 7,500 that has been paid in full and still claims a balance of 60,000. The
 * accumulated fund report then disagrees with itself, because `netExpected`, `paid` and
 * `outstanding` are all summed from these same rows - and `lib/integrity-checks.ts` flags
 * every one of them as CHARGE_BALANCE_MISMATCH.
 *
 * Two invariants have to survive, and the integrity checker enforces both:
 *
 *   amountPaid + balance == finalAmountDue
 *   amountPaid          == the allocations actually recorded against the charge
 *
 * So owing is expressed the way it happens in life: the receipts are removed, and the
 * charge is recomputed from what is left. `payFraction` leaves a part-payment behind,
 * with a real receipt and a real allocation, for the partially-paid case.
 */
async function leaveOwing(
  studentId: string,
  schoolId: string,
  receivedBy: string,
  options: { onlyTermId?: string; payFraction?: number } = {},
) {
  const scope = options.onlyTermId ? { termId: options.onlyTermId } : {}
  const charges = await prisma.studentCharge.findMany({
    where: { studentId, ...scope },
    select: { id: true, termId: true, sessionId: true, finalAmountDue: true },
  })
  if (charges.length === 0) return

  // Take the receipts away first. Allocations cascade from the payment, but they are
  // removed explicitly because a charge may also be allocated from a payment in a term
  // this call is not touching.
  await prisma.paymentAllocation.deleteMany({
    where: { chargeId: { in: charges.map((charge) => charge.id) } },
  })
  // A receipt that now allocates nothing is not a receipt for anything.
  await prisma.payment.deleteMany({
    where: { studentId, ...scope, allocations: { none: {} } },
  })

  for (const charge of charges) {
    const due = Number(charge.finalAmountDue)
    const paid = Math.min(due, Math.round(due * (options.payFraction ?? 0) * 100) / 100)

    if (paid > 0 && charge.termId) {
      const count = await prisma.payment.count({ where: { schoolId } })
      const payment = await prisma.payment.create({
        data: {
          schoolId,
          studentId,
          termId: charge.termId,
          sessionId: charge.sessionId,
          amount: paid,
          paymentDate: new Date(),
          receiptNo: `TST-${String(count + 1).padStart(5, "0")}`,
          paymentMethod: "CASH",
          status: "COMPLETED",
          receivedBy,
          notes: "Part payment recorded by seed:test-scenario",
        },
        select: { id: true },
      })
      // The allocation is what makes `amountPaid` true rather than merely asserted.
      await prisma.paymentAllocation.create({
        data: { paymentId: payment.id, chargeId: charge.id, amount: paid },
      })
    }

    await prisma.studentCharge.update({
      where: { id: charge.id },
      data: {
        amountPaid: paid,
        balance: due - paid,
        status: paid <= 0 ? "UNPAID" : paid >= due ? "PAID" : "PARTIAL",
      },
    })
  }
}

/**
 * Marks a learner's charges paid and records the payments that paid them.
 *
 * Writing `balance: 0, status: "PAID"` on its own produced a learner whose fees all read
 * settled and whose receipts page said "No payments recorded yet" — an inconsistency no real
 * payment path could create, and one that makes the portal look broken when it is not. A
 * charge is only paid because money arrived, so the money is recorded here too.
 */
async function settle(
  studentId: string,
  schoolId: string,
  receivedBy: string,
  skipTermId?: string,
) {
  const charges = await prisma.studentCharge.findMany({
    where: { studentId, ...(skipTermId ? { termId: { not: skipTermId } } : {}) },
    select: {
      id: true,
      termId: true,
      sessionId: true,
      finalAmountDue: true,
      allocations: { select: { amount: true } },
    },
  })

  for (const charge of charges) {
    if (!charge.termId) continue

    // What THIS charge has a receipt for, read from its own allocations.
    //
    // This used to sum every payment in the term, which is a different question: with two
    // charges in one term, the second saw the first's receipt as "already paid", recorded
    // nothing, and still marked itself settled. The allocation is the only thing that says
    // which charge a payment was for, so it is the only honest thing to count.
    const allocated = charge.allocations.reduce((total, row) => total + Number(row.amount), 0)
    const outstanding = Math.max(Number(charge.finalAmountDue) - allocated, 0)

    if (outstanding > 0) {
      const count = await prisma.payment.count({ where: { schoolId } })
      const payment = await prisma.payment.create({
        data: {
          schoolId,
          studentId,
          termId: charge.termId,
          sessionId: charge.sessionId,
          amount: outstanding,
          paymentDate: new Date(),
          // Distinct per school, which is all the unique key asks. Prefixed so a seeded
          // receipt is obvious next to a real one.
          receiptNo: `TST-${String(count + 1).padStart(5, "0")}`,
          paymentMethod: "CASH",
          status: "COMPLETED",
          receivedBy,
          notes: "Recorded by seed:test-scenario",
        },
        select: { id: true },
      })

      // Without this the receipt exists and belongs to nothing: the charge claims money
      // that no allocation supports, and `lib/integrity-checks.ts` reports both a
      // CHARGE_BALANCE_MISMATCH and a PAYMENT_ALLOCATION_TOTAL. A payment is only
      // connected to what it paid for by this row.
      await prisma.paymentAllocation.create({
        data: { paymentId: payment.id, chargeId: charge.id, amount: outstanding },
      })
    }

    await prisma.studentCharge.update({
      where: { id: charge.id },
      data: { balance: 0, amountPaid: charge.finalAmountDue, status: "PAID" },
    })
  }
}

async function main() {
  assertLocalDatabase()

  const school = await prisma.school.findFirst({ select: { id: true, name: true, code: true } })
  if (!school) throw new Error("No school in this database. Run `npm run seed:demo` first.")
  console.log(`School: ${school.name} (${school.code})\n`)

  const scheme = await prisma.assessmentScheme.findUnique({
    where: { schoolId: school.id },
    select: { ca1Max: true, ca2Max: true, ca3Max: true, examMax: true },
  })
  if (!scheme) throw new Error("No assessment scheme for this school")

  // ---------------------------------------------------------------------------------
  // 1. Pick the learners. Four, each with a different story to tell.
  // ---------------------------------------------------------------------------------
  const candidates = await prisma.student.findMany({
    where: { schoolId: school.id },
    orderBy: { admissionNo: "asc" },
    select: {
      id: true,
      admissionNo: true,
      year: true,
      createdAt: true,
      userId: true,
      user: { select: { firstName: true, lastName: true } },
      classTerms: {
        select: {
          id: true,
          classTerm: {
            select: {
              id: true,
              termId: true,
              classId: true,
              term: { select: { name: true, isCurrent: true, session: { select: { name: true } } } },
            },
          },
        },
      },
    },
  })

  // Only learners enrolled in the current term can show a full current session.
  const usable = candidates.filter((student) =>
    student.classTerms.some((row) => row.classTerm.term.isCurrent),
  )
  if (usable.length < 4) throw new Error("Not enough enrolled learners to build the scenario")

  const chosen = usable.slice(0, 4)

  // ---------------------------------------------------------------------------------
  // 2. Release marks for every term these learners are enrolled in that has none.
  // ---------------------------------------------------------------------------------
  const author = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    select: { id: true },
  })
  if (!author) throw new Error("No administrator to attribute the marks to")
  const authorId = author.id

  let created = 0
  let published = 0
  let subjectsBackfilled = 0

  for (const student of chosen) {
    for (const enrolment of student.classTerms) {
      const classTerm = enrolment.classTerm
      let subjects = await prisma.classSubject.findMany({
        where: { classTermId: classTerm.id },
        select: { subjectId: true },
      })

      // The previous session has enrolments but no subjects, so there is nothing to mark
      // and the session tab comes up empty. Give that class the same subjects it teaches
      // in the current session, which is what a real timetable would have carried over.
      if (subjects.length === 0) {
        const template = await prisma.classSubject.findMany({
          where: { classId: classTerm.classId },
          distinct: ["subjectId"],
          select: { subjectId: true },
        })
        if (template.length === 0) continue

        await prisma.classSubject.createMany({
          data: template.map(({ subjectId }) => ({
            classId: classTerm.classId,
            subjectId,
            classTermId: classTerm.id,
          })),
          skipDuplicates: true,
        })
        subjectsBackfilled += template.length
        subjects = template
      }

      for (const { subjectId } of subjects) {
        const existing = await prisma.assessment.findFirst({
          where: { studentId: student.id, termId: classTerm.termId, subjectId },
          select: { id: true, isPublished: true },
        })

        if (existing) {
          if (!existing.isPublished) {
            await prisma.assessment.update({
              where: { id: existing.id },
              data: { isPublished: true, publishedAt: new Date() },
            })
            published += 1
          }
          continue
        }

        const key = `${student.admissionNo}:${classTerm.termId}:${subjectId}`
        await prisma.assessment.create({
          data: {
            studentId: student.id,
            subjectId,
            termId: classTerm.termId,
            studentClassTermId: enrolment.id,
            // Marks are attributed to a real person, because the audit trail on a released
            // result is the whole point of releasing it deliberately.
            createdBy: authorId,
            editedBy: authorId,
            ca1: seededScore(`${key}:ca1`, 4, scheme.ca1Max),
            ca2: seededScore(`${key}:ca2`, 4, scheme.ca2Max),
            ca3: seededScore(`${key}:ca3`, 4, scheme.ca3Max),
            exam: seededScore(`${key}:exam`, 30, scheme.examMax),
            isPublished: true,
            publishedAt: new Date(),
          },
        })
        created += 1
      }
    }
  }

  console.log(
    `Marks: ${created} released, ${published} drafts published, ` +
      `${subjectsBackfilled} subjects added to terms that had none\n`,
  )

  // ---------------------------------------------------------------------------------
  // 3. Three different fee situations, so the withholding switch is visibly doing work.
  // ---------------------------------------------------------------------------------
  const [paidUp, owesLatest, owesAll] = chosen

  // Paid in full: every term visible even with withholding on.
  await settle(paidUp!.id, school.id, authorId)

  // Owes the current term only: past terms stay readable, this one is held, and the
  // session summary is held with it. This is the case the rule exists for.
  const currentTermId = owesLatest!.classTerms.find((row) => row.classTerm.term.isCurrent)
    ?.classTerm.termId
  await settle(owesLatest!.id, school.id, authorId, currentTermId ?? undefined)
  if (currentTermId) {
    // A third paid, so the charge reads PARTIAL for a reason that is on the receipts page.
    await leaveOwing(owesLatest!.id, school.id, authorId, {
      onlyTermId: currentTermId,
      payFraction: 1 / 3,
    })
  }

  // Owes everything: nothing visible while withholding is on.
  await leaveOwing(owesAll!.id, school.id, authorId)

  console.log("Fee situations set:")
  console.log(`  ${paidUp!.admissionNo}      paid in full`)
  console.log(`  ${owesLatest!.admissionNo}  owes the current term only`)
  console.log(`  ${owesAll!.admissionNo}     owes every term\n`)

  // ---------------------------------------------------------------------------------
  // 4. Known passwords. Learners and guardians get the registration-year default the
  //    app itself now uses, so this also demonstrates that behaviour.
  // ---------------------------------------------------------------------------------
  const lines: string[] = []

  for (const student of chosen) {
    const password = defaultPasswordForStudent(student)
    await prisma.credential.updateMany({
      where: { userId: student.userId },
      data: { passwordHash: await bcrypt.hash(password, 12) },
    })
    lines.push(
      `STUDENT  ${student.admissionNo.padEnd(16)} ${password.padEnd(10)} ` +
        `${student.user.firstName} ${student.user.lastName}`,
    )
  }

  // A guardian of each chosen learner, so the parent portal has something to show.
  const links = await prisma.studentParent.findMany({
    where: { studentId: { in: chosen.map((s) => s.id) } },
    select: {
      parent: {
        select: {
          id: true,
          userId: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
          // The guardian's login is their email credential.
        },
      },
    },
  })

  const seenParents = new Set<string>()
  for (const { parent } of links) {
    if (seenParents.has(parent.id)) continue
    seenParents.add(parent.id)

    const credential = await prisma.credential.findFirst({
      where: { userId: parent.userId, type: "EMAIL" },
      select: { value: true },
    })
    if (!credential) continue

    const password = defaultPasswordForDate(parent.createdAt)
    await prisma.credential.updateMany({
      where: { userId: parent.userId },
      data: { passwordHash: await bcrypt.hash(password, 12) },
    })

    const childCount = await prisma.studentParent.count({ where: { parentId: parent.id } })
    lines.push(
      `PARENT   ${credential.value.padEnd(16)} ${password.padEnd(10)} ` +
        `${parent.user.firstName} ${parent.user.lastName} (${childCount} child${childCount === 1 ? "" : "ren"})`,
    )
  }

  // The school administrator keeps a strong password: this account can change everybody
  // else's records, so it does not get the four-digit treatment.
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", admin: { schoolId: school.id } },
    select: { id: true, firstName: true, lastName: true, credentials: { select: { value: true } } },
  })
  for (const admin of admins) {
    await prisma.credential.updateMany({
      where: { userId: admin.id },
      data: { passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12) },
    })
    lines.push(
      `ADMIN    ${(admin.credentials[0]?.value ?? "—").padEnd(16)} ${ADMIN_PASSWORD.padEnd(10)} ` +
        `${admin.firstName} ${admin.lastName}`,
    )
  }

  // Every session they were signed into is now on a stale password.
  await prisma.loginSession.deleteMany({
    where: { credential: { userId: { in: [...chosen.map((s) => s.userId), ...admins.map((a) => a.id)] } } },
  })

  console.log("ROLE     LOGIN            PASSWORD   NAME")
  console.log("-".repeat(78))
  for (const line of lines) console.log(line)
  console.log("-".repeat(78))
  console.log("\nStudents sign in with their admission number, guardians and admins with email.")

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`)
  await prisma.$disconnect()
  process.exit(1)
})
