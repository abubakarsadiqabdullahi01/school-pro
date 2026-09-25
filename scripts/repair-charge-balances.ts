import { prisma } from "@/lib/db"

/**
 * Repairs fee charges whose figures do not reconcile.
 *
 *   npx tsx scripts/repair-charge-balances.ts          # report only
 *   npx tsx scripts/repair-charge-balances.ts --apply  # fix them
 *
 * `lib/integrity-checks.ts` holds two invariants for a charge, and this repairs violations
 * of each in the only direction that is safe:
 *
 *   1. amountPaid == the allocations recorded against the charge
 *   2. amountPaid + balance == finalAmountDue
 *
 * **It never invents money.** Where a charge claims to have been paid and there is a
 * completed receipt in the same term that is not allocated to anything, the missing
 * allocation is written - the money existed, the link between it and the charge did not.
 * Where no such receipt exists, the charge is left alone and reported, because the honest
 * answer is "somebody needs to look at this", not a number chosen by a script.
 *
 * `balance` is derived and is the one thing this will recompute freely: once `amountPaid`
 * is trustworthy, `finalAmountDue - amountPaid` is not a judgement call.
 *
 * Why this exists: `scripts/seed-test-scenario.ts` used to stage a debtor by writing
 * `balance` directly and to settle a learner by recording a payment with no allocation.
 * Both are fixed there now; this cleans up what those runs left behind.
 */

const APPLY = process.argv.includes("--apply")

function n(value: unknown): number {
  return Number(value)
}

async function main() {
  const charges = await prisma.studentCharge.findMany({
    select: {
      id: true,
      studentId: true,
      termId: true,
      schoolId: true,
      finalAmountDue: true,
      amountPaid: true,
      balance: true,
      allocations: { select: { amount: true } },
      student: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  })

  let allocationsWritten = 0
  let balancesFixed = 0
  let unexplained = 0

  for (const charge of charges) {
    const due = n(charge.finalAmountDue)
    let paid = n(charge.amountPaid)
    const allocated = charge.allocations.reduce((total, row) => total + n(row.amount), 0)
    const name = `${charge.student.user.firstName} ${charge.student.user.lastName}`

    // --- 1. The charge claims money no allocation supports --------------------
    if (Math.abs(allocated - paid) > 0.005) {
      const shortfall = Math.round((paid - allocated) * 100) / 100

      if (shortfall > 0 && charge.termId) {
        // A completed receipt in this term, allocated to nothing, for exactly the amount
        // this charge is missing. This is what the old `settle` produced: one payment per
        // charge, for the outstanding figure, with the link never written.
        //
        // The match has to be exact. Taking whatever orphan came first and allocating part
        // of it would leave the receipt itself unbalanced and, worse, could reduce a charge
        // that reads settled to one that reads owing - telling a family they owe money
        // again on the strength of a guess.
        const candidates = await prisma.payment.findMany({
          where: {
            studentId: charge.studentId,
            termId: charge.termId,
            status: "COMPLETED",
            allocations: { none: {} },
          },
          select: { id: true, amount: true, receiptNo: true },
        })
        const orphan = candidates.find((row) => Math.abs(n(row.amount) - shortfall) <= 0.005)

        if (orphan) {
          console.log(
            `  link ${orphan.receiptNo} -> ${name}: ${shortfall.toFixed(2)} (charge claimed ` +
              `${paid.toFixed(2)}, allocations showed ${allocated.toFixed(2)})`,
          )
          if (APPLY) {
            await prisma.paymentAllocation.create({
              data: { paymentId: orphan.id, chargeId: charge.id, amount: shortfall },
            })
          }
          allocationsWritten += 1
          paid = allocated + shortfall
        } else {
          // No receipt to point at. Reducing amountPaid here would quietly tell a family
          // they owe money again; that is a decision for a person, not a script.
          console.log(
            `  ! ${name}: charge claims ${paid.toFixed(2)} paid, allocations show ` +
              `${allocated.toFixed(2)}, and no unallocated receipt matches the ` +
              `${shortfall.toFixed(2)} difference`,
          )
          unexplained += 1
          continue
        }
      } else {
        console.log(
          `  ! ${name}: allocations (${allocated.toFixed(2)}) exceed amountPaid ` +
            `(${paid.toFixed(2)}) - needs a person`,
        )
        unexplained += 1
        continue
      }
    }

    // --- 2. Balance is derived, so it can simply be recomputed ----------------
    const expected = Math.round((due - paid) * 100) / 100
    if (Math.abs(expected - n(charge.balance)) > 0.005) {
      console.log(
        `  balance ${name}: ${n(charge.balance).toFixed(2)} -> ${expected.toFixed(2)} ` +
          `(due ${due.toFixed(2)} less paid ${paid.toFixed(2)})`,
      )
      if (APPLY) {
        await prisma.studentCharge.update({
          where: { id: charge.id },
          data: {
            amountPaid: paid,
            balance: expected,
            status: paid <= 0 ? "UNPAID" : paid >= due ? "PAID" : "PARTIAL",
          },
        })
      }
      balancesFixed += 1
    }
  }

  console.log(
    `\n${APPLY ? "Wrote" : "Would write"} ${allocationsWritten} allocation(s) and ` +
      `${balancesFixed} balance correction(s) across ${charges.length} charge(s).`,
  )
  if (unexplained > 0) {
    console.log(`${unexplained} charge(s) need a person to look at them - see the ! lines above.`)
  }
  if (!APPLY) console.log("Re-run with --apply to make the changes.")

  await prisma.$disconnect()
}

void main()
