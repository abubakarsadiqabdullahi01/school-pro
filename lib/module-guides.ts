import type { PermissionKey } from "@/lib/permissions"

/**
 * In-app help shown behind the ⓘ button beside a screen's heading.
 *
 * Everything written here must describe what the code actually does. The source
 * of truth is `documentation/system-reference.md` plus the action file named in
 * each entry's `sourceOfTruth`; when behaviour changes, the guide changes with it.
 * A guide that quietly goes stale is worse than no guide, because a user who was
 * told the wrong rule stops checking.
 */
export type GuideSection = {
  /** What the user sees on screen — a card, a tab, a table, a column group. */
  name: string
  /** What it is showing them, in their words rather than the schema's. */
  detail: string
}

export type ModuleGuide = {
  /** Heading of the dialog. Usually the screen's own title. */
  title: string
  /** Trail from the module down to this screen, e.g. ["Finance", "Fee Setup"]. */
  location: readonly string[]
  /** One or two sentences: the job this screen exists to do. */
  purpose: string
  /** The parts of the screen, in the order they are laid out. */
  sections?: readonly GuideSection[]
  /**
   * A concrete walk-through in the school's own terms: what someone actually
   * does here, and exactly what the system does back. Abstract rules are hard to
   * act on; "₦50,000 against a ₦45,000 tuition and a ₦7,500 levy" is not.
   */
  example?: {
    /** The action, named as a real task with real values. */
    doing: string
    /** What the user should then expect to see. */
    then: string
  }
  /** What the system does when the user commits — saves, submits, approves. */
  onSave?: readonly string[]
  /** Rules enforced behind the screen that its controls do not reveal. */
  rules?: readonly string[]
  /** Where this screen normally leads, and why someone would go there. */
  nextSteps?: readonly string[]
  /** Permissions that gate this screen, for "why can't my colleague see this?". */
  permissions?: readonly PermissionKey[]
  /** Action file(s) the behaviour above is drawn from — for maintainers. */
  sourceOfTruth?: string
}

/**
 * Keyed by a stable id rather than by pathname: the same view is mounted under
 * two URL trees (an admin's /dashboard/admin/finance and the bursar's
 * /dashboard/accountant are the same component), and a guide should not have to
 * know which tree it woke up in.
 */
export const MODULE_GUIDES = {
  // ---------------------------------------------------------------- Finance
  "finance.dashboard": {
    title: "Finance",
    location: ["Finance"],
    purpose:
      "The money position for the current term at a glance: what the school billed, what it has collected, and what is still owed.",
    example: {
      doing: "Open Finance during Third Term, with ₦10.1m billed to students so far.",
      then: "Expected ₦10.1m, Paid ₦6.1m, Outstanding ₦4.0m. The charge counts below tell you how many individual fees make that up, and Recent Payments lists the last receipts issued — click one to reprint it.",
    },
    sections: [
      {
        name: "The five totals",
        detail:
          "Expected Fees is everything billed to students. Paid is what has actually been received. Outstanding is the difference. Discounts and Exemptions are the amounts deliberately taken off — they reduce what is owed but are never money in hand.",
      },
      {
        name: "Charge counts",
        detail:
          "Paid, Partial, Unpaid and Waived count individual charges, not students. One student with three fees appears in up to three of these.",
      },
      {
        name: "Recent Payments",
        detail:
          "The latest receipts issued. Clicking a row opens that receipt so it can be reprinted — this is the usual way somebody finds a receipt again.",
      },
    ],
    rules: [
      "Figures cover the current term only — the term flagged as current in the calendar, not whichever term today's date falls in.",
      "A payment recorded as PENDING is not counted as paid and moves no balance. It has been promised, not received.",
      "Amounts are held to the kobo internally; the cards round to the naira for readability.",
    ],
    nextSteps: [
      "Record Payment — take money from a student and issue a receipt.",
      "Fee Setup — change what students are billed (admins only).",
      "Debtors — see who is behind, ranked by what they owe.",
    ],
    permissions: ["finance.view_reports"],
    sourceOfTruth: "app/actions/finance.ts · getFinanceOverview",
  },

  "finance.fees": {
    title: "Fee Setup",
    location: ["Finance", "Fee Setup"],
    purpose:
      "Defines what students are billed. Fee categories group charges by kind; fee schedules are the actual bills, each one aimed at a scope and an audience.",
    example: {
      doing: "Create a ₦7,500 Development Levy, scoped to Third Term, audience Returning Students.",
      then: "Nobody is billed yet. Returning students are charged when enrolled into a Third Term class, or right away if you use Bill Students. In a school’s very first session this schedule bills nobody at all.",
    },
    sections: [
      {
        name: "Fee Categories",
        detail:
          "The kinds of fee a school charges — tuition, development levy, admission, uniform. A category by itself bills nobody; it is the label a schedule hangs on.",
      },
      {
        name: "Fee Schedules",
        detail:
          "The bills themselves. Each schedule carries an amount, a scope (how wide it reaches) and an audience (who within that scope pays it).",
      },
    ],
    onSave: [
      "Saving a schedule does not bill anyone on its own. Charges are raised when a student is enrolled into a class term, and by the Bill Students action for a schedule that arrives after enrolment.",
      "Raising charges is safe to repeat: a student already charged for a schedule is skipped, so a re-run tops up what is missing instead of double-billing.",
    ],
    rules: [
      "Scope: a schedule tied to a class term covers that one class in that one term; tied to a term only, every class in that term; tied to neither, every enrolment in the session.",
      "Audience: ALL_STUDENTS covers everyone in scope. NEW_STUDENTS means students with no enrolment in an earlier session. RETURNING_STUDENTS means students who have one.",
      "⚠ 'Returning' compares sessions, not terms. In a school's first session nobody is returning — a RETURNING_STUDENTS fee bills zero students, and a NEW_STUDENTS fee bills the whole roll, every term. If a levy you just created bills nobody, this is why.",
    ],
    permissions: ["finance.setup"],
    sourceOfTruth: "app/actions/finance.ts · lib/fee-charges.ts",
  },

  "finance.studentPayments": {
    title: "Record Payment",
    location: ["Finance", "Record Payment"],
    purpose:
      "Takes money from a student and issues a numbered receipt, applying the payment against the specific fees they owe.",
    example: {
      doing: "Take ₦50,000 from a JSS 1A student who owes ₦45,000 tuition and a ₦7,500 levy.",
      then: "A receipt is issued, tuition is marked PAID in full, and the levy becomes PARTIAL with ₦2,500 still owed. Their balance falls from ₦52,500 to ₦2,500 — and both charge rows say exactly what was applied to them.",
    },
    sections: [
      {
        name: "Student search",
        detail:
          "Find the student by name or admission number. Their outstanding charges load with the balance on each.",
      },
      {
        name: "Payment details",
        detail:
          "Amount, method and date. The status decides whether the money counts: only a completed payment moves a balance.",
      },
    ],
    onSave: [
      "A receipt number is issued from the school's receipt counter — one sequence per school per year, allocated atomically so two cashiers cannot be given the same number.",
      "The money is allocated across the student's outstanding charges, oldest first, and each allocation is recorded against the charge it settled.",
      "Every charge touched has its status recalculated from the arithmetic: PAID, PARTIAL or UNPAID.",
      "The receipt is available to print immediately, and stays findable from the Receipts register.",
    ],
    rules: [
      "A payment is not a number on an account. ₦50,000 against a ₦45,000 tuition and a ₦7,500 levy settles the tuition and part-pays the levy, and both charge rows say so.",
      "A PENDING payment allocates nothing and changes no balance until it is completed.",
      "Because allocation is oldest-first, a student who fell behind and then pays normally has the old balance cleared first by the new money.",
    ],
    permissions: ["finance.collect_payments"],
    sourceOfTruth: "app/actions/finance.ts · recordStudentPayment",
  },

  "finance.receipts": {
    title: "Receipts",
    location: ["Finance", "Receipts"],
    purpose:
      "The register of every receipt the school has issued, for reprinting and for reconciling what was collected over a period.",
    example: {
      doing: "Filter the register to Third Term, method Bank Transfer.",
      then: "Every transfer receipt for the term with its student, amount and status. Opening one shows the receipt as issued — reprinting never changes the number, date or amount.",
    },
    sections: [
      {
        name: "Filter bar",
        detail: "Narrows the register by period, and by how the money came in.",
      },
      {
        name: "Register",
        detail:
          "One row per payment, with its receipt number, the student, the amount and the status. Opening a row shows the printable receipt.",
      },
    ],
    rules: [
      "Receipt numbers are unique per school and are never reused, including across cancelled or pending payments.",
      "Reprinting a receipt does not reissue it — the number, date and amount are whatever was recorded at the time.",
    ],
    permissions: ["finance.view_reports"],
    sourceOfTruth: "app/actions/finance.ts",
  },

  "finance.receipt": {
    title: "Receipt",
    location: ["Finance", "Receipts", "Receipt"],
    purpose: "One issued receipt, as it was recorded, ready to print or hand to a parent again.",
    example: {
      doing: "A parent has lost the receipt for a ₦50,000 payment made last month.",
      then: "The original receipt, with the amount in figures and words and the charges it settled. Printing it again reissues nothing — the number and date stay as first recorded.",
    },
    rules: [
      "Reprinting does not reissue. The number, date and amount are whatever was recorded when the payment was taken.",
      "The receipt names the charges the money was applied to, which is what makes the resulting balance explainable.",
    ],
    permissions: ["finance.view_reports"],
    sourceOfTruth: "app/actions/finance.ts",
  },

  "finance.feeScheduleCoverage": {
    title: "Fee Schedule Coverage",
    location: ["Finance", "Fee Setup", "Coverage"],
    purpose:
      "Who a particular fee schedule actually bills, and what each of them has been charged so far.",
    example: {
      doing: "Open a ₦7,500 levy scoped to Third Term, audience Returning Students.",
      then: "The students this schedule actually bills, and what each has been charged. An empty list in a school’s first session is the returning-students rule doing its job, not a fault.",
    },
    rules: [
      "Coverage is decided by the schedule's scope (class term, term, or whole session) combined with its audience.",
      "An empty list usually means the audience excluded everyone — most often a returning-students fee in a school's first session, when nobody is returning yet.",
    ],
    permissions: ["finance.setup"],
    sourceOfTruth: "lib/fee-charges.ts",
  },

  "finance.debtors": {
    title: "Debtors",
    location: ["Finance", "Debtors"],
    purpose:
      "Who owes money and how much, so the school can chase the right households rather than the loudest ones.",
    example: {
      doing: "Filter debtors to JSS 1A.",
      then: "Students who still owe, largest first. A student showing ₦52,500 may be carrying a First Term balance under this term’s fees — open their statement to see the split.",
    },
    sections: [
      {
        name: "Filters",
        detail: "Narrow by class and period to get the list a particular staff member can act on.",
      },
      {
        name: "Debtor rows",
        detail:
          "One row per student with the total still outstanding. Opening a student shows the statement behind the figure.",
      },
    ],
    rules: [
      "Debt does not reset at a term boundary. Old charges keep their balances and the new term's fees are raised on top, which is why an arrears figure grows across the year.",
      "Discounts and exemptions have already been taken off before a balance appears here — what is shown is genuinely owed.",
    ],
    permissions: ["finance.view_reports"],
    sourceOfTruth: "app/actions/finance.ts",
  },

  "finance.studentStatement": {
    title: "Student Statement",
    location: ["Finance", "Student Statement"],
    purpose:
      "Every charge raised against one student and every payment applied to them, in order — the document to hand a parent who disputes a balance.",
    example: {
      doing: "A parent insists they paid, but the system shows ₦2,500 outstanding.",
      then: "The statement shows the ₦50,000 they paid and exactly where it went: ₦45,000 settled tuition and ₦5,000 went to the ₦7,500 levy, leaving ₦2,500. The balance becomes explainable instead of merely asserted.",
    },
    sections: [
      {
        name: "Charges",
        detail: "What the student was billed, when, and what remains on each line.",
      },
      {
        name: "Payments and allocations",
        detail:
          "What was received and exactly which charges each payment was applied to. This is what makes a balance explainable rather than merely asserted.",
      },
    ],
    rules: [
      "The statement spans the student's whole history at the school, not just the current term.",
      "Adjustments appear as discounts or exemptions against the charge they reduce, never as fake payments.",
    ],
    permissions: ["finance.view_reports"],
    sourceOfTruth: "app/actions/finance.ts",
  },

  "finance.classSummary": {
    title: "Class Summary",
    location: ["Finance", "Class Summary"],
    purpose:
      "Collection performance class by class, to show where fee collection is working and where it is not.",
    example: {
      doing: "Compare JSS 1A with SSS 3A for the current term.",
      then: "Billed, collected and outstanding for each class side by side, so you can see which class is behind rather than only the school-wide figure.",
    },
    rules: [
      "Each class's figures are the sum of its enrolled students' charges for the period selected.",
      "A student who moved class mid-term counts under the class term their charges were raised in.",
    ],
    permissions: ["finance.view_reports"],
    sourceOfTruth: "app/actions/finance.ts",
  },

  "finance.accumulatedFund": {
    title: "Accumulated Fund",
    location: ["Finance", "Accumulated Fund"],
    purpose:
      "Income actually collected set against expenditure actually paid, so the school can see what it has left rather than what it is owed.",
    example: {
      doing: "Check what the school actually has after a term of fees and spending.",
      then: "Money received less vouchers actually paid, salaries included. The ₦4.0m still owed in fees does not appear — it is not funds until it is collected.",
    },
    rules: [
      "Income counts money received, not money billed. Outstanding fees are not funds.",
      "Expenditure counts vouchers that reached PAID. Pending and approved-but-unpaid vouchers are commitments, not spend.",
      "Salaries paid through payroll appear here too — paying a payroll run writes an expenditure record.",
    ],
    permissions: ["finance.view_reports"],
    sourceOfTruth: "app/actions/finance.ts · app/actions/expenditure.ts",
  },

  "finance.adjustments": {
    title: "Discounts and Exemptions",
    location: ["Finance", "Adjustments"],
    purpose:
      "Reduces what a particular student owes — a discount takes an amount off a charge, an exemption waives it.",
    example: {
      doing: "Give a staff child a 50% discount on ₦45,000 tuition.",
      then: "They now owe ₦22,500. The statement still shows ₦45,000 billed with a ₦22,500 discount against it, so the original fee is never hidden — and the ₦22,500 is not counted as money collected.",
    },
    onSave: [
      "The adjustment is attached to the specific charge it reduces and that charge's balance and status are recalculated.",
      "The reduction shows on the student's statement as an adjustment, so the original amount billed is still visible.",
    ],
    rules: [
      "Adjustments reduce what is owed; they are never counted as money collected.",
      "A waived charge is reported separately from a paid one, so collection figures stay honest.",
    ],
    permissions: ["finance.setup"],
    sourceOfTruth: "app/actions/finance.ts",
  },

  "finance.staff": {
    title: "Finance Staff",
    location: ["Finance", "Staff"],
    purpose:
      "The people allowed to work in Finance, and what each of them may do — collect payments, configure fees, or only read reports.",
    example: {
      doing: "Give the bursar the Finance Officer profile.",
      then: "They can collect payments and view reports from their very next request. Their role stays ACCOUNTANT — the profile is what opened those screens, not the job title.",
    },
    rules: [
      "Access is granted by permission profile, not by job title. Someone can hold a finance profile while their role stays ADMIN.",
      "Removing a profile takes effect on the person's next request; it does not wait for their session to expire.",
    ],
    permissions: ["users.manage"],
    sourceOfTruth: "app/actions/permissions.ts · app/actions/user-management.ts",
  },

  // ------------------------------------------------------------ Expenditure
  "expenditure.dashboard": {
    title: "Expenditure",
    location: ["Expenditure"],
    purpose:
      "What the school is spending, where it is in the approval chain, and how it sits against the budget set for each category.",
    example: {
      doing: "Check spending part-way through the term.",
      then: "What has been paid out, what is still waiting for approval, and how each category sits against its budget. A category over budget shows a variance — it never blocks anybody.",
    },
    sections: [
      {
        name: "Spend totals",
        detail: "Money committed and money actually paid out for the period.",
      },
      {
        name: "Status breakdown",
        detail:
          "How many vouchers are waiting for approval, approved and awaiting payment, or already paid.",
      },
    ],
    rules: [
      "Every expense belongs to a term — expenditure reporting in this system is termly.",
      "A category's budget limit is a soft ceiling: it is reported against but never enforced. A school fixing a burst pipe is not blocked by a stationery budget.",
      "A payment account's balance is calculated when you look at it rather than stored, so a corrected or cancelled voucher cannot leave a stale figure behind.",
    ],
    permissions: ["expenditure.manage"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  "expenditure.new": {
    title: "New Expense",
    location: ["Expenditure", "New Expense"],
    purpose: "Raises a voucher for money the school needs to spend, and sends it into the approval chain.",
    example: {
      doing: "Record ₦85,000 to Gombe Stationers for exam paper, paid from the Main Account, and send it for approval.",
      then: "A voucher number is issued and the voucher sits at PENDING_APPROVAL with your name on it. No money has moved and nothing has left the account — it is not spend until somebody approves it and marks it paid.",
    },
    onSave: [
      "A voucher number is issued from the school's voucher counter — one sequence per school per year, allocated atomically.",
      "The voucher is created as PENDING_APPROVAL and the person who raised it is recorded.",
      "Any receipt or invoice attached is stored outside the web root and is only reachable through the app, to whoever is allowed to see that voucher.",
    ],
    rules: [
      "Who raised, who approved and who paid are recorded separately and deliberately — that separation is the point of the voucher.",
      "Those records survive the staff member leaving: deleting a user clears the link but never deletes the voucher.",
    ],
    permissions: ["expenditure.manage"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  "expenditure.transactions": {
    title: "Transactions",
    location: ["Expenditure", "Transactions"],
    purpose: "Every voucher raised, with where each one has reached in the approval chain.",
    example: {
      doing: "Filter to vouchers still awaiting approval.",
      then: "Everything raised but not yet approved, oldest first. Opening a row shows the voucher, its attachments and only the actions valid at its current status.",
    },
    sections: [
      {
        name: "Filters",
        detail: "Narrow by status, category, account and period.",
      },
      {
        name: "Voucher rows",
        detail:
          "One row per expense. Opening a row shows the voucher, its attachments and the actions available at its current status.",
      },
    ],
    rules: [
      "The chain runs PENDING_APPROVAL → APPROVED → PAID, with REJECTED and CANCELLED available before payment and an auditable REVERSED state after payment.",
      "Rejecting or cancelling requires a reason, and the reason is kept with the voucher.",
    ],
    permissions: ["expenditure.manage"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  "expenditure.detail": {
    title: "Expense Detail",
    location: ["Expenditure", "Transactions", "Detail"],
    purpose:
      "One voucher in full — what it is for, what is attached to it, and the approval actions available at its current status.",
    example: {
      doing: "Approve the ₦85,000 stationery voucher, then mark it paid.",
      then: "Your name and the date are stamped on the approval, and the voucher moves PENDING_APPROVAL → APPROVED → PAID. Only at PAID does it count as money spent and reduce the account balance.",
    },
    onSave: [
      "Approving, rejecting, cancelling or paying records who did it and when, against this voucher.",
      "Rejecting and cancelling both require a reason, and the reason stays with the voucher.",
      "Marking a voucher paid is what makes it count as money spent in the reports.",
    ],
    rules: [
      "Who raised, approved and paid are held separately — that separation of duties is the point of a voucher, and it is kept even after a staff member leaves.",
      "Attached receipts and invoices are stored outside the web root and served only through the app, to people allowed to see this voucher.",
    ],
    permissions: ["expenditure.manage", "expenditure.approve"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  "expenditure.categories": {
    title: "Expense Categories",
    location: ["Expenditure", "Setup", "Categories"],
    purpose: "The headings the school's spending is grouped under, each with an optional budget for reporting.",
    example: {
      doing: "Put a ₦200,000 termly budget on Stationery.",
      then: "Budget Summary reports spend against that figure. Spending ₦240,000 shows a ₦40,000 overrun — the vouchers still go through, because a school fixing a burst pipe should not be stopped by a stationery budget.",
    },
    rules: [
      "A budget limit is reported against, never enforced — exceeding it produces a figure, not a block.",
      "A category in use by existing vouchers cannot be removed out from under them.",
    ],
    permissions: ["expenditure.manage"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  "expenditure.accounts": {
    title: "Payment Accounts",
    location: ["Expenditure", "Setup", "Accounts"],
    purpose: "The accounts money is actually paid out of, and what each one currently holds.",
    example: {
      doing: "Cancel a ₦85,000 voucher that was raised twice by mistake.",
      then: "The account balance corrects itself the moment you look at it. Nothing has to be reconciled by hand, because the balance is calculated from the transactions rather than stored.",
    },
    rules: [
      "An account balance is computed from its transactions each time it is read, not stored as a running figure.",
      "That means correcting or cancelling a voucher immediately corrects the balance, with nothing to reconcile by hand.",
    ],
    permissions: ["expenditure.manage"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  "expenditure.budgetSummary": {
    title: "Budget Summary",
    location: ["Expenditure", "Budget Summary"],
    purpose: "Spend against budget for every category, to show which headings are running hot.",
    example: {
      doing: "Review the term before setting next term’s budgets.",
      then: "Spend against budget for every category, with the overruns visible. Categories with no budget set are listed with their spend but no variance.",
    },
    rules: [
      "Only the budget limit set on a category is compared; categories with no limit are reported without a variance.",
      "Spend counts vouchers that reached PAID unless the screen says otherwise.",
    ],
    permissions: ["expenditure.manage"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  "expenditure.sessionReport": {
    title: "Session Expenditure",
    location: ["Expenditure", "Reports", "Session"],
    purpose: "Everything the school spent across a whole session, broken down by category and by term.",
    example: {
      doing: "Produce the year’s spending for a board meeting.",
      then: "Every term’s expenditure in one place, split by category, with salaries included — paying a payroll run writes an expenditure record like any other cost.",
    },
    rules: [
      "Each expense belongs to a term, so a session report is the sum of its terms rather than a separate set of books.",
      "Salaries paid through payroll are included — paying a payroll run writes an expenditure record.",
    ],
    permissions: ["expenditure.manage"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  "expenditure.termlyReport": {
    title: "Termly Expenditure",
    location: ["Expenditure", "Reports", "Termly"],
    purpose: "What the school spent in one term, by category, which is the level expenditure is reported at here.",
    example: {
      doing: "Close off Third Term spending.",
      then: "What was spent in the term by category. Vouchers approved but not yet paid are shown apart from money actually spent, so a commitment is never mistaken for a payment.",
    },
    rules: [
      "Every expense carries a term, because expenditure reporting in this system is termly by design.",
      "Vouchers that have not reached PAID are commitments and are reported separately from money actually spent.",
    ],
    permissions: ["expenditure.manage"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  "expenditure.voucher": {
    title: "Payment Voucher",
    location: ["Expenditure", "Voucher"],
    purpose: "The printable voucher for one expense, carrying the approval trail that authorises the payment.",
    example: {
      doing: "Print the voucher for a ₦85,000 payment for the file.",
      then: "A voucher showing the amount in figures and words, and who raised, approved and paid it with dates. That trail is the document — it is what authorises the payment.",
    },
    rules: [
      "The voucher shows who raised, approved and paid it, with dates — the audit trail is the document.",
      "Amounts are also rendered in words, as a payment voucher is expected to be.",
    ],
    permissions: ["expenditure.manage"],
    sourceOfTruth: "app/actions/expenditure.ts",
  },

  // -------------------------------------------------------------- HR/Payroll
  "hr.dashboard": {
    title: "HR & Payroll",
    location: ["HR & Payroll"],
    purpose:
      "The staff payroll: who is on it, what the current run costs, and where that run has reached.",
    example: {
      doing: "Check payroll at the end of the month.",
      then: "Headcount, what the latest run costs, and whether it is still a draft, approved or paid. Support staff with no system login are included — they are paid, they just cannot sign in.",
    },
    sections: [
      {
        name: "Headcount and cost",
        detail: "Staff on the payroll and what the latest run totals.",
      },
      {
        name: "Run status",
        detail: "Whether the current month's run is still a draft, approved, or paid.",
      },
    ],
    rules: [
      "Staff and teachers are different records. A teacher is one person across a login, a classroom record and a staff record; a cleaner or driver has a staff record and no login at all.",
      "Payroll has to cope with both, which is why staff can exist here without ever appearing in Teachers.",
    ],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr.ts",
  },

  "hr.staff": {
    title: "Staff",
    location: ["HR & Payroll", "Staff"],
    purpose:
      "Every member of staff the school pays, with their salary, allowances and deductions.",
    example: {
      doing: "Add a ₦12,000 transport allowance to a teacher on a ₦180,000 scale.",
      then: "Next month’s run pays ₦192,000 gross before deductions. Payslips already issued keep the figures they were issued with — nothing you change today rewrites last month’s payslip.",
    },
    sections: [
      {
        name: "Staff list",
        detail: "Everyone on the payroll, including support staff who have no system login.",
      },
      {
        name: "A staff record",
        detail:
          "Their salary scale, plus the allowances and deductions attached to them personally. Each can override the default value of its type.",
      },
    ],
    onSave: [
      "Changes apply to payroll runs generated from now on. Payslips already issued are untouched.",
    ],
    rules: [
      "A payslip freezes its own figures. Editing the transport allowance today does not silently rewrite every payslip ever issued.",
      "A staff member without a login is normal and supported — they are paid, they just cannot sign in.",
    ],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr.ts",
  },

  "hr.payroll": {
    title: "Payroll Runs",
    location: ["HR & Payroll", "Payroll"],
    purpose: "The monthly payroll: generate it, check it, approve it, pay it.",
    example: {
      doing: "Generate the September run for 12 staff, approve it, then pay it.",
      then: "Every payslip is computed and frozen at those figures. Paying it also writes an expenditure record, so the salary bill appears in expenditure reports beside every other cost. A second September run is refused.",
    },
    onSave: [
      "Generating a run computes every staff member's pay and writes their payslip lines, frozen at the values used.",
      "Paying a run also writes an expenditure record, so salaries appear in expenditure reports beside every other cost.",
    ],
    rules: [
      "A run moves DRAFT → APPROVED → PAID. Unpaid runs can be CANCELLED; paid runs use an auditable REVERSED state linked to the expenditure reversal.",
      "Only one run can exist for a school in a given month and year — the duplicate-payroll guard is enforced by the database, not just by the screen.",
      "The arithmetic: base is prorated if days worked is short of the month, allowances are computed off the prorated base, pre-tax deductions come off to give the taxable base, and post-tax percentage deductions are taken on that taxable base rather than on gross.",
      "A negative net is flagged, and HR configuration decides whether it is allowed at all.",
    ],
    permissions: ["payroll.pay"],
    sourceOfTruth: "app/actions/hr.ts · lib/payroll.ts",
  },

  "hr.staffForm": {
    title: "Staff Record",
    location: ["HR & Payroll", "Staff", "Add or Edit"],
    purpose: "Creates or updates the record the school pays somebody from.",
    example: {
      doing: "Add a cleaner who has no system login, on a ₦45,000 scale.",
      then: "A staff record is created and they appear in the next payroll run. Leaving them without a login is normal and fully supported — they are paid without ever signing in.",
    },
    onSave: [
      "The record applies to payroll runs generated from now on; payslips already issued keep their figures.",
    ],
    rules: [
      "A staff member does not need a system login. Support staff are paid without ever signing in, which is why this is separate from creating a teacher.",
      "Salary, allowances and deductions attached here are what the next run computes from.",
    ],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr.ts",
  },

  "hr.payrollRun": {
    title: "Payroll Run",
    location: ["HR & Payroll", "Payroll", "Run"],
    purpose: "One month's run in full — every staff member's pay, and the actions available at its current status.",
    example: {
      doing: "Open a run sitting at APPROVED and mark it paid.",
      then: "Every payslip in it is settled and an expenditure record is written for the total. Until that point the run is a calculation, not a payment.",
    },
    onSave: [
      "Approving records who approved it. Paying settles the run and writes an expenditure record for the total.",
    ],
    rules: [
      "Until a run is paid it is a calculation, not a payment. Nothing has left an account.",
      "Payslip lines were frozen when the run was generated, so changing an allowance now does not alter this run.",
      "Only one run can exist per school for a given month and year.",
    ],
    permissions: ["payroll.pay"],
    sourceOfTruth: "app/actions/hr.ts · lib/payroll.ts",
  },

  "hr.payslip": {
    title: "Payslip",
    location: ["HR & Payroll", "Payslip"],
    purpose: "One staff member's pay for one month, itemised, as issued.",
    example: {
      doing: "Reprint a payslip from four months ago.",
      then: "It reads exactly as it did when issued. The transport allowance shows the amount paid then, even if the allowance has been changed twice since.",
    },
    rules: [
      "Every line is a copy taken when the run was generated — the label and the amount are frozen, so this payslip reads today exactly as it did when it was issued.",
      "Payslip numbers come from a per-school, per-year sequence.",
    ],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr.ts",
  },

  "hr.salaryScales": {
    title: "Salary Scales",
    location: ["HR & Payroll", "Setup", "Salary Scales"],
    purpose: "The pay bands staff are placed on, which set their base pay before allowances and deductions.",
    example: {
      doing: "Raise the Senior Teacher scale from ₦180,000 to ₦200,000.",
      then: "Runs generated from now on use ₦200,000. Payslips already issued are untouched, so past months do not silently change.",
    },
    onSave: ["Changing a scale affects future runs. Payslips already generated keep the figures they were issued with."],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr.ts",
  },

  "hr.allowances": {
    title: "Allowance Types",
    location: ["HR & Payroll", "Setup", "Allowances"],
    purpose: "The kinds of allowance the school pays — housing, transport and the rest — as a fixed amount or a percentage.",
    example: {
      doing: "Set Housing at 15%.",
      then: "A teacher on ₦180,000 receives ₦27,000. If they worked 20 of 30 days, base prorates to ₦120,000 and housing follows it down to ₦18,000 — the percentage is taken on the prorated base, not the full scale.",
    },
    rules: [
      "A percentage allowance is computed off the prorated base, so a staff member who worked a part-month receives a proportionate allowance.",
      "A type's value is a default; an individual staff member's allowance can override it.",
    ],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr.ts · lib/payroll.ts",
  },

  "hr.deductions": {
    title: "Deduction Types",
    location: ["HR & Payroll", "Setup", "Deductions"],
    purpose: "What comes out of pay — pension, tax, loans — and crucially whether each is taken before or after tax.",
    example: {
      doing: "Set Pension 8% PRE_TAX and PAYE 7% POST_TAX, on a ₦200,000 gross.",
      then: "Pension takes ₦16,000, leaving a taxable base of ₦184,000, so PAYE is ₦12,880 — not ₦14,000. Marking pension POST_TAX instead would overtax every member of staff by ₦1,120 a month.",
    },
    rules: [
      "PRE_TAX deductions come off gross first, and what is left is the taxable base.",
      "POST_TAX percentage deductions are calculated on that taxable base, not on gross. Setting this the wrong way round is the classic payroll error, and it changes what every staff member is paid.",
    ],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr.ts · lib/payroll.ts",
  },

  "hr.config": {
    title: "HR Configuration",
    location: ["HR & Payroll", "Setup", "Configuration"],
    purpose: "The school's payroll rules: whether runs need approval, and whether a negative net payslip is permitted.",
    example: {
      doing: "Turn off payroll approval for a small school where the principal runs payroll alone.",
      then: "Generated runs become payable immediately — DRAFT goes straight to payable with no APPROVED step in between.",
    },
    rules: [
      "Turning off approval makes a generated run payable immediately — the DRAFT → APPROVED step is skipped.",
      "Allowing a negative net does not hide it; the payslip is still flagged.",
    ],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr.ts",
  },

  "hr.reports": {
    title: "Payroll Reports",
    location: ["HR & Payroll", "Reports"],
    purpose: "What the school has spent on salaries over a period, and how that splits across staff and allowance or deduction type.",
    example: {
      doing: "Total the salary bill for the session.",
      then: "What was actually paid, split by staff and by allowance and deduction type. Figures come from issued payslips, so they match what staff received rather than what the scales say today.",
    },
    rules: ["Figures are read from issued payslips, so they match what staff were actually paid."],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr.ts",
  },

  // ----------------------------------------------------------------- Compiler
  "compiler.continuousAssessments": {
    title: "Continuous Assessments",
    location: ["Compiler", "Continuous Assessments"],
    purpose: "Entry and review of the CA marks that make up part of a student's subject score.",
    example: {
      doing: "Enter CA1 8, CA2 7, CA3 9 for a JSS 1A student in Mathematics.",
      then: "Saved as one row for that student, subject and term, with your name on it. The student and their parent still see nothing — entering a mark is not releasing it.",
    },
    onSave: [
      "Each save writes one score row per student, per subject, per term — saving again updates that row rather than adding another.",
      "Who entered the mark is recorded alongside it.",
    ],
    rules: [
      "Marks are capped by the school's assessment scheme. The default split is three CAs of 10 plus an exam of 70, but a school can be set up on any split; a maximum of 0 means that slot is unused.",
      "Entering a score is not releasing it. Nothing a teacher types here is visible to a student or parent until the class's results are published.",
      "A genuine 0 is a real mark and counts. Leaving a box empty is a different answer from typing zero.",
    ],
    permissions: ["compiler.enter_scores"],
    sourceOfTruth: "app/actions/compiler.ts · app/actions/teacher-assessments.ts",
  },

  "compiler.subjectResultsEntry": {
    title: "Subject Result Entry",
    location: ["Compiler", "Subject Results", "Entry"],
    purpose: "Entering CA and exam marks for one subject in one class term.",
    example: {
      doing: "Add an exam mark of 62 to CA totalling 24.",
      then: "A total of 86, graded from your school’s own bands. Leave the exam blank and the subject drops out of their average entirely — but typing 0 is a real mark of zero and stays in.",
    },
    onSave: [
      "Scores are written against the student's enrolment in that class term, and the grade is resolved from the school's own grading bands.",
      "Saving updates the existing row for that student and subject in that term — it never creates a second one.",
    ],
    rules: [
      "A teacher can only enter marks for a subject they are assigned to teach that term. Holding the subject last term is not enough.",
      "No mark may exceed the maximum in the school's assessment scheme.",
      "A subject only counts towards a student's average when all four components are present and the student was neither absent nor exempt — so a half-entered term does not drag averages down.",
    ],
    permissions: ["compiler.enter_scores"],
    sourceOfTruth: "app/actions/compiler.ts · lib/grading.ts",
  },

  "compiler.classResults": {
    title: "Class Results",
    location: ["Compiler", "Class Results"],
    purpose:
      "The assembled result sheet for a class term, and the place results are reviewed, published, locked or withdrawn.",
    example: {
      doing: "Review and then publish JSS 1A’s Third Term results.",
      then: "Status moves DRAFT → REVIEWED → PUBLISHED, each step logged with your name and role. Only at PUBLISHED do students and parents see anything. Withdrawing takes it back out of their view.",
    },
    sections: [
      {
        name: "Result sheet",
        detail: "Every student in the class with their subject scores, total, average, grade and position.",
      },
      {
        name: "Workflow actions",
        detail: "The moves available from the class's current state — review, publish, lock, withdraw.",
      },
    ],
    onSave: [
      "Each workflow move is recorded as an event with who did it, their role and any note, so a result set's history can be reconstructed.",
      "Publishing is what makes results visible to students and parents. Until then they see nothing.",
      "Withdrawing takes published results back out of family view.",
    ],
    rules: [
      "The chain is DRAFT → REVIEWED → PUBLISHED → LOCKED, with withdrawal available from published.",
      "Positions rank by total score. Tied students share a place and the next distinct score skips the places used, giving 1, 2, 2, 4.",
      "Known defect: positions rank on total score while the displayed grade comes from the average, so a student taking more subjects can outrank one with fewer but stronger results.",
      "Past terms are included — the sheet reads both active and completed enrolments, which is why historical results still appear.",
    ],
    permissions: ["compiler.review_results", "compiler.publish_results", "compiler.lock_results"],
    sourceOfTruth: "app/actions/compiler.ts · lib/results/class-term-results.ts",
  },

  "compiler.classResultsTermly": {
    title: "Class Results — Termly",
    location: ["Compiler", "Class Results", "Termly"],
    purpose:
      "The class's results for a term laid out as a printable broadsheet, every student against every subject.",
    example: {
      doing: "Print the broadsheet for JSS 1A’s First Term, months after it closed.",
      then: "The full sheet, because it reads completed enrolments as well as active ones. Two students tied on 412 both show position 2, and the next student down is position 4.",
    },
    rules: [
      "The sheet reads both active and completed enrolments, so a past term still prints in full rather than coming back empty.",
      "A subject counts towards a student's total only when all its components are present and the student was neither absent nor exempt.",
      "Positions rank by total score; ties share a place and the next distinct score skips the places used.",
    ],
    permissions: ["compiler.review_results"],
    sourceOfTruth: "lib/results/class-term-results.ts",
  },

  "compiler.classResultsSessional": {
    title: "Class Results — Sessional",
    location: ["Compiler", "Class Results", "Sessional"],
    purpose:
      "A whole session for one class: the broadsheet and every report card, in the same format the school already prints for a term.",
    example: {
      doing: "Print JSS 1A’s report cards at the end of the year.",
      then: "The termly card, with its three score columns carrying First, Second and Third Term instead of the three continuous assessments, then the session total and the session average.",
    },
    rules: [
      "A subject is averaged over the terms it was actually sat in, so a subject dropped after first term is judged on first term rather than marked down for the terms it was not offered.",
      "Positions and class statistics are worked out across the session, not copied from any one term — a learner second in first term and tenth in third is neither over the year.",
      "Only released marks count. A term still being marked is left out of the average rather than counted as zero.",
      "Fee withholding does not apply here. That rule governs what a family is shown, not what the school can see of its own marks.",
    ],
    permissions: ["compiler.review_results"],
    sourceOfTruth: "lib/results/session-report.server.ts · lib/pdf/student-report-card-generator.tsx",
  },

  "compiler.notifications": {
    title: "Result Notifications",
    location: ["Compiler", "Notifications"],
    purpose:
      "Telling families a term\u2019s results are ready, by text message or email, without putting the results themselves in the message.",
    example: {
      doing: "Let JSS 2A\u2019s parents know first term results are out.",
      then: "You are shown how many people it reaches, how many text messages that is, the exact wording they will get, and every learner nobody can be told about \u2014 before anything is sent. Pressing send queues the messages; a scheduled job delivers them.",
    },
    onSave: [
      "Each message is queued rather than sent from your browser, so a send of four hundred does not depend on the page staying open.",
      "Every message carries a key made from the class, the learner, the recipient and the channel, so sending again reaches anyone who was missed and nobody twice.",
    ],
    rules: [
      "A result never travels in the message. A text sits on a lock screen and passes through a provider, so the notice links to the portal and the reader has to sign in.",
      "Nothing is sent until the recipient count and the message have been shown. A mis-click that texts four hundred families is real money.",
      "Anyone who has turned notifications off, or whose number or address is unusable, produces no message at all \u2014 and is listed so the school knows who was not told.",
      "Messages go to the guardians linked to that particular learner, never to everybody in the school.",
      "With no provider configured, messages are written to the server log instead of being delivered, and every screen says so plainly rather than looking successful.",
    ],
    permissions: ["compiler.publish_results"],
    sourceOfTruth:
      "app/actions/notifications.ts \u00b7 lib/notifications/outbox.server.ts \u00b7 scripts/drain-notification-outbox.ts",
  },

  "compiler.annualResults": {
    title: "Annual Results",
    location: ["Compiler", "Annual Results"],
    purpose:
      "Who goes up, who repeats and who leaves at the end of a session \u2014 worked out from each class\u2019s own promotion rules, then approved before it reaches a report card.",
    example: {
      doing: "Close out JSS 2A at the end of the session.",
      then: "Every learner is measured against JSS 2A\u2019s rules and shown with their session average, passes, credits and \u2014 where the bar was missed \u2014 every reason why. Compiling writes nothing; saving records the decisions; approving is what puts them on the cards.",
    },
    onSave: [
      "Each learner\u2019s outcome is frozen with the average, counts, reasons and the policy that judged them, so editing a class\u2019s rules next year cannot restate what was decided this year.",
      "Approved decisions print in the Head Teacher\u2019s Comment on the annual report card, with a PROMOTED, REPEAT or GRADUATED stamp beside it.",
    ],
    rules: [
      "Deciding and approving are separate acts: an exams officer compiles, somebody with publishing rights approves. Nothing reaches a family until it is approved.",
      "An approved decision is left alone when the class is compiled again \u2014 recompiling must not silently withdraw an approval.",
      "Changing an outcome against what the rules say needs a reason, and is refused outright when the class does not allow manual overrides.",
      "The principal\u2019s comment is stored beside the decision, never as the decision. The status is a field; the words are free text.",
    ],
    permissions: ["compiler.review_results", "compiler.publish_results"],
    sourceOfTruth: "app/actions/annual-results.ts \u00b7 lib/promotion-policy.ts",
  },

  "compiler.promotionPolicies": {
    title: "Promotion Rules by Class",
    location: ["Compiler", "Promotion Rules"],
    purpose:
      "The bar each class has to clear \u2014 by average, by subjects passed, or by credits earned. Classes with no rules of their own follow the school default.",
    example: {
      doing: "Make SS3 a final year and promote JSS 3 on five credits rather than an average.",
      then: "SS3 learners who clear the bar graduate instead of being promoted, and JSS 3 is judged on how many subjects reached the credit mark \u2014 while every other class carries on under the school default, untouched.",
    },
    rules: [
      "A credit is stricter than a pass. With a pass mark of 40, a subject scored 45 is a pass and is not a credit \u2014 which is the whole reason the two rules are counted separately.",
      "A class with no rules of its own inherits the school default, so adding this screen changes nothing until a class is deliberately overridden.",
      "A final year changes the label on success, not the bar: a finalist who misses the criteria still repeats. To let everybody through regardless, turn the academic bar off for that class.",
      "Turning the bar on while setting no minimum is refused \u2014 it would silently promote everyone, which is not what switching it on is meant to mean.",
      "Rules are not versioned by session, and do not need to be: a decision freezes the policy that judged it.",
    ],
    permissions: ["compiler.configure_policy"],
    sourceOfTruth: "app/actions/annual-results.ts \u00b7 lib/promotion-policy.ts",
  },

  "hr.onboarding": {
    title: "Staff Onboarding",
    location: ["HR", "Onboarding"],
    purpose:
      "Everyone who has joined but whose file is not finished \u2014 including teachers added on the academic side, who used to be invisible to HR entirely.",
    example: {
      doing: "Check who is not ready for this month\u2019s payroll.",
      then: "Two lists: teachers with no staff record at all, and staff records still missing something payroll needs. Each row says what is outstanding rather than just that something is.",
    },
    rules: [
      "Adding a teacher now creates their staff record in the same transaction, starting as Not started \u2014 a record with only a name must not look finished to payroll.",
      "Provisioning never blocks teacher creation. If it fails, the teacher is still created and appears in the first list here.",
      "Completeness is read from the fields themselves, never from a stored flag: a file cannot be marked complete while the bank details are empty.",
      "Required items are what payroll would get wrong without; recommended items are what a complete personnel file has. A casual worker with no pension PIN is not blocked.",
      "Staff documents are stored privately and served only to people with HR permission in the same school.",
    ],
    permissions: ["payroll.manage"],
    sourceOfTruth: "app/actions/hr-onboarding.ts \u00b7 lib/hr/staff-onboarding.ts \u00b7 lib/hr/staff-provisioning.ts",
  },

  "compiler.studentReports": {
    title: "Student Reports",
    location: ["Compiler", "Student Reports"],
    purpose: "The printable report card for a student's term: subject results, affective and psychomotor ratings, and remarks.",
    example: {
      doing: "Print report cards for JSS 1A after publishing.",
      then: "A card per student on the school’s letterhead, with subject results, behaviour and skill ratings and remarks — grades resolved from your school’s bands, not a fixed national scale.",
    },
    rules: [
      "A report card reflects what has been entered and published; an unpublished term produces a sheet staff can see but families cannot.",
      "Grades come from the school's own grading bands, so two schools can score the same mark differently.",
    ],
    permissions: ["compiler.review_results"],
    sourceOfTruth: "app/actions/student-reports.ts · lib/report-traits.ts",
  },

  "compiler.studentTransitions": {
    title: "Student Transitions",
    location: ["Compiler", "Transitions"],
    purpose: "Moving students on at the end of a term — promotion, transfer or withdrawal.",
    example: {
      doing: "Promote JSS 1A into JSS 2A at the end of the session.",
      then: "Each student is judged against the promotion policy and you are shown every reason a student fails, not just the first. On promotion the old enrolment closes, the new opens, and JSS 2A’s fees are raised — any old balance stays exactly as it was, with the new fees on top.",
    },
    onSave: [
      "The student's current enrolment is marked completed and the new one created as active.",
      "The new class term's fees are raised at the same moment, so a promoted student is never left enrolled without their charges.",
      "A transition record and an enrolment-history row are written for the audit trail.",
    ],
    rules: [
      "Promotion is judged against the school's promotion policy, and the system returns every reason a student fails rather than stopping at the first — so an admin can fix the cause or knowingly override it.",
      "An override is recorded in the transition notes; it is permitted but never silent.",
      "Transfers and withdrawals are not judged. A sideways move and an exit are not verdicts on results.",
      "Debt does not reset. Old balances stay exactly as they were and the new term's fees are added on top.",
    ],
    permissions: ["compiler.configure_policy"],
    sourceOfTruth: "app/actions/student-transitions.ts · lib/promotion.ts",
  },

  "teacher.compiler": {
    title: "Compiler",
    location: ["Teacher", "Compiler"],
    purpose: "Where a teacher enters and checks marks for the subjects and classes they hold this term.",
    example: {
      doing: "Open the compiler to enter this term’s Mathematics marks.",
      then: "Only the subjects you hold this term are listed. If Mathematics is missing, you have not been assigned it for this term — last term’s assignment does not carry over.",
    },
    rules: [
      "Only subjects assigned to you for the current term appear. If a subject is missing, the assignment is missing.",
      "Entering marks does not release them. Publishing is done by whoever holds that permission, not by the subject teacher.",
    ],
    permissions: ["compiler.enter_scores"],
    sourceOfTruth: "app/actions/teacher-compiler.ts",
  },

  // ------------------------------------------------------------ Academic core
  "admin.students": {
    title: "Students",
    location: ["Students"],
    purpose: "The school's student roll: admitting students, maintaining their records, and enrolling them into classes.",
    example: {
      doing: "Search the roll for a student by admission number.",
      then: "Their record, class placement and history. Admitting and enrolling from here also raises that class term’s fees, so a student is never on the roll without their charges.",
    },
    sections: [
      {
        name: "Student list",
        detail: "Every student on the roll, searchable by name and admission number.",
      },
    ],
    onSave: [
      "Admitting a student generates their admission number from the school's own template against a per-school, per-year counter.",
      "Enrolling a student into a class term raises that term's fees in the same transaction — a student is never enrolled without their charges.",
      "Re-enrolling is safe: charges already raised are skipped rather than duplicated.",
    ],
    rules: [
      "A student cannot be actively enrolled in two classes in the same term.",
      "Students can sign in with their admission number as well as their email address.",
    ],
    permissions: ["students.manage"],
    sourceOfTruth: "app/actions/student-management.ts · lib/fee-charges.server.ts",
  },

  "admin.studentDetail": {
    title: "Student Details",
    location: ["Students", "Student"],
    purpose: "One student in full — their profile, the classes they have been enrolled in, their results and their fee position.",
    example: {
      doing: "Open a student to answer a question about their record.",
      then: "Their profile, the classes they have been enrolled in, their results and their fee position in one place — including terms that have already closed.",
    },
    rules: [
      "History is shown across terms, including terms that have closed, because a completed enrolment is still part of the record.",
      "Staff screens show results whether or not they have been published; the family's view does not.",
    ],
    permissions: ["students.manage"],
    sourceOfTruth: "app/actions/student-management.ts",
  },

  "admin.subjectTeachers": {
    title: "Assign Teachers to a Subject",
    location: ["Academics", "Subjects", "Teachers"],
    purpose: "Says who teaches this subject, for the current term.",
    example: {
      doing: "Attach two teachers to Mathematics for Third Term.",
      then: "Both can enter Third Term Mathematics marks for the classes they hold. Score entry checks this list, so a teacher left off it is refused.",
    },
    onSave: ["The assignment covers the current term only and does not carry into the next one."],
    rules: [
      "Score entry checks this list. A teacher who is not on it cannot enter marks for the subject, however senior they are.",
      "A subject can have several teachers; each enters marks for the classes they hold.",
    ],
    permissions: ["teachers.manage"],
    sourceOfTruth: "app/actions/teacher-assignment.ts",
  },

  "admin.teachers": {
    title: "Teachers",
    location: ["Teachers"],
    purpose: "Teaching staff: their records, the classes they take as form teacher, and the subjects they teach each term.",
    example: {
      doing: "Check why a teacher cannot enter marks.",
      then: "Their record and this term’s assignments. Almost always the subject has not been assigned for the current term — assignment does not carry over from last term.",
    },
    rules: [
      "A teacher is one person across three records — a login, a classroom record and a payroll record — joined together. Creating a teacher here does not by itself put them on the payroll.",
      "Subject assignment is per term. A teacher who taught a subject last term must be assigned again this term before they can enter its marks.",
      "Score entry checks that assignment, so a missing assignment shows up as a teacher unable to enter marks.",
    ],
    permissions: ["teachers.manage"],
    sourceOfTruth: "app/actions/teacher-management.ts · app/actions/teacher-assignment.ts",
  },

  "admin.teacherAssignment": {
    title: "Teacher Assignment",
    location: ["Teachers", "Assignment"],
    purpose:
      "Gives a teacher the classes they take as form teacher and the subjects they teach — both for one particular term.",
    example: {
      doing: "Assign Mathematics to a teacher for Third Term.",
      then: "They can now enter Third Term Mathematics marks. Their Second Term assignment does not carry over — this is the step that is missing when a teacher cannot find their subject in the compiler.",
    },
    onSave: [
      "The assignment is written against the current term only. It does not carry forward on its own.",
    ],
    rules: [
      "⚠ Subject assignment is per term. A teacher who taught Mathematics last term cannot enter this term's Mathematics marks until they are assigned again.",
      "Score entry checks this assignment, so the usual symptom of a missing assignment is a teacher who cannot find their subject in the compiler.",
      "Being form teacher of a class and teaching a subject to it are separate assignments; a teacher can have either without the other.",
    ],
    permissions: ["teachers.manage"],
    sourceOfTruth: "app/actions/teacher-assignment.ts",
  },

  "admin.parents": {
    title: "Parents",
    location: ["Parents"],
    purpose: "Parent accounts and the children linked to them, which is what the parent portal shows.",
    example: {
      doing: "Link a parent to their second child at the school.",
      then: "Both children appear in the parent portal on their next sign-in, with fees and any published results — and nothing that has not been published.",
    },
    rules: [
      "A parent sees only the children linked to them here, and only results that have been published.",
      "One parent can be linked to several children; the portal shows them all.",
    ],
    permissions: ["parents.manage"],
    sourceOfTruth: "app/actions/parent-management.ts · app/actions/parent-portal.ts",
  },

  "admin.classes": {
    title: "Classes",
    location: ["Academics", "Classes"],
    purpose: "The school's classes. A class becomes usable once it is instantiated for a term as a class term.",
    example: {
      doing: "Create JSS 1A.",
      then: "The class exists, but nothing can happen in it yet. Students enrol, subjects attach and marks are entered against a class term — JSS 1A paired with a specific term.",
    },
    rules: [
      "A class on its own holds nothing. Students enrol into a class term — the pairing of a class with a term — and subjects, teachers, fees and results all hang off that pairing.",
      "If something seems to be missing for a class, the usual cause is that its class term for the current term has not been created.",
    ],
    permissions: ["academics.manage"],
    sourceOfTruth: "app/actions/class-management.ts",
  },

  "admin.classTerms": {
    title: "Class Terms",
    location: ["Academics", "Class Terms"],
    purpose:
      "A class as it exists in one particular term. This is the hinge the rest of the system hangs on.",
    example: {
      doing: "Create JSS 1A for Third Term and attach its subjects.",
      then: "Students can now be enrolled, teachers assigned and marks entered. Skip the subjects and no marks can be entered for that class at all, however complete everything else looks.",
    },
    sections: [
      {
        name: "Class term list",
        detail: "Each class instantiated for a term, with the subjects offered and the students enrolled.",
      },
    ],
    rules: [
      "Subjects are attached here, students enrol here, teachers are assigned here, fees can be scoped here and the result workflow belongs here.",
      "Without subjects attached to a class term, no marks can be entered for it at all.",
      "If you are unsure where something belongs, ask which class term it happened in.",
    ],
    permissions: ["academics.manage"],
    sourceOfTruth: "app/actions/class-term-management.ts",
  },

  "admin.subjects": {
    title: "Subjects",
    location: ["Academics", "Subjects"],
    purpose: "The subjects the school teaches, and which classes offer them in a given term.",
    example: {
      doing: "Add Further Mathematics and offer it to SSS 2A this term.",
      then: "It becomes available for marks in SSS 2A once a teacher is assigned to it for this term. A subject not offered by a class term cannot be scored there.",
    },
    rules: [
      "A subject must be offered by a class term before marks can be entered for it there.",
      "Teacher assignment to a subject is per term, and score entry checks it.",
    ],
    permissions: ["academics.manage"],
    sourceOfTruth: "app/actions/subject-management.ts",
  },

  "admin.sessions": {
    title: "Academic Sessions",
    location: ["Calendar", "Sessions"],
    purpose: "The school years. A session holds the terms within it.",
    example: {
      doing: "Create the 2026/2027 session.",
      then: "A container for its terms. The session boundary is also what decides fees: students enrolled in an earlier session count as returning, and those without one count as new.",
    },
    rules: [
      "Session boundaries matter for fees: 'new' and 'returning' students are decided by whether a student was enrolled in an earlier session, not an earlier term.",
      "Dates recorded here are informational. What the application actually reads is which term is flagged current.",
    ],
    permissions: ["academics.manage"],
    sourceOfTruth: "app/actions/session-management.ts",
  },

  "admin.terms": {
    title: "Terms",
    location: ["Calendar", "Terms"],
    purpose: "The terms within each session, and which one the school is currently in.",
    example: {
      doing: "Mark Third Term as the current term.",
      then: "Every dependent screen follows at once — teachers see Third Term classes, finance totals switch to Third Term, families see Third Term results. The dates on a term do not do this; the flag does.",
    },
    rules: [
      "Exactly one term carries the current flag, and almost every student-facing screen filters on it.",
      "The flag is what the system reads — not today's date. A term whose dates have passed but which is still flagged current remains the working term everywhere.",
      "Moving the current flag changes what teachers, students, parents and the finance screens see immediately.",
    ],
    permissions: ["academics.manage"],
    sourceOfTruth: "app/actions/term-management.ts",
  },

  "admin.calendar": {
    title: "School Calendar",
    location: ["Calendar"],
    purpose: "The school's sessions and terms in one view, and where the school currently sits in them.",
    example: {
      doing: "Check which term the school is working in.",
      then: "The sessions and terms, with the current one marked. Moving that mark here changes what every other role sees immediately.",
    },
    rules: [
      "The current term drives what the rest of the system shows. Changing it here changes every dependent screen.",
    ],
    permissions: ["academics.manage"],
    sourceOfTruth: "app/actions/school-calendar.ts",
  },

  "admin.schoolSettings": {
    title: "School Settings",
    location: ["School Settings"],
    purpose:
      "The school's own identity and academic rules: its details and branding, admission number format, grading bands and assessment scheme.",
    example: {
      doing: "Change the assessment scheme from CA 10/10/10 + exam 70 to CA 20/20 + exam 60.",
      then: "Score entry caps change from the next mark entered. Marks already saved keep their values, so changing this mid-term leaves a mixed set — do it between terms.",
    },
    sections: [
      {
        name: "Information",
        detail: "Name, code, contact details and logo, which appear on receipts, vouchers and report cards.",
      },
      {
        name: "Admission",
        detail: "The template admission numbers are generated from, such as prefix, year and a running number.",
      },
      {
        name: "Grading systems",
        detail: "The bands a score is converted into a grade by. Every grade shown anywhere is resolved from these.",
      },
      {
        name: "Assessment scheme",
        detail:
          "How a subject's marks split between continuous assessment and exam. A maximum of 0 means that slot is unused.",
      },
    ],
    rules: [
      "These settings are per school. Two schools on the same deployment can grade and assess completely differently.",
      "Changing the assessment scheme changes the caps on score entry from that point on; marks already entered are not rewritten.",
      "Uploaded logos are stored outside the web root and served through the application.",
    ],
    permissions: ["school.manage"],
    sourceOfTruth: "app/actions/school-settings.ts · lib/assessment-scheme.ts · lib/grading.ts",
  },

  "admin.integrity": {
    title: "System Integrity",
    location: ["School Management", "System Integrity"],
    purpose:
      "Reconciles the records that must agree across academics and finance, and stores each report for follow-up.",
    example: {
      doing: "Run the full check after refunding a receipt and moving the school into a new term.",
      then: "The report confirms the refund matches restored fee balances and the database current-period pointer matches the visible session and term flags. Any mismatch names the exact record to investigate.",
    },
    sections: [
      {
        name: "Latest result",
        detail: "The most recent reconciliation and each exact issue, with severity, check code and record ID.",
      },
      {
        name: "Recent runs",
        detail: "The stored history of checks, who ran them and how many issues each found.",
      },
    ],
    rules: [
      "Checks are read-only: they report mismatches but never silently rewrite business records.",
      "Refund and reversal actions update linked records transactionally; the checker independently confirms those links still agree.",
      "Production scheduling runs the same check for every active school through npm run check:integrity.",
    ],
    permissions: ["school.manage"],
    sourceOfTruth: "app/actions/integrity.ts · lib/integrity-checks.ts",
  },

  "admin.permissions": {
    title: "Permissions",
    location: ["Permissions"],
    purpose:
      "Who may do what. Role decides which dashboard someone lands on; a permission profile decides what they can actually reach.",
    example: {
      doing: "Move the exams officer from School Manager to the Exams Officer profile.",
      then: "They keep the same login and the ADMIN role, but finance and payroll screens refuse them from their next request — not whenever their session happens to expire.",
    },
    sections: [
      {
        name: "Profiles",
        detail:
          "Four profiles ship with every school — Manager, Exams Officer, Finance Officer and HR — and more can be defined.",
      },
      {
        name: "Permission grid",
        detail: "The individual permissions each profile grants, grouped by area.",
      },
    ],
    rules: [
      "An exams officer and a principal can both be ADMIN. The role is identical; the profile is what separates them.",
      "If someone can see a menu but is bounced from the page behind it, that is a role and profile mismatch.",
      "Changes are re-checked on the person's next request; a deactivated or downgraded account does not stay working until its session expires.",
    ],
    permissions: ["users.manage"],
    sourceOfTruth: "app/actions/permissions.ts · lib/permissions.ts",
  },

  // ------------------------------------------------------------- Teacher area
  "teacher.myClasses": {
    title: "My Classes",
    location: ["Teacher", "My Classes"],
    purpose: "The classes you are form teacher for this term, and the students in them.",
    example: {
      doing: "Open the class you are form teacher for.",
      then: "Your students for this term, and the place to enter their behaviour and skill ratings for the report card. The list changes when the school moves to a new term.",
    },
    rules: [
      "Form-teacher assignment is per term, so this list changes when the current term changes.",
      "Behaviour and skill ratings for a report card are entered from here, by the form teacher.",
    ],
    sourceOfTruth: "app/actions/teacher-management.ts · lib/report-traits.ts",
  },

  "teacher.subjects": {
    title: "My Subjects",
    location: ["Teacher", "My Subjects"],
    purpose: "The subjects you are assigned to teach this term, across all classes.",
    example: {
      doing: "Check what you are teaching this term.",
      then: "Your subjects and the classes you take them in. Anything missing has not been assigned to you for this term, and you will not be able to enter its marks until it is.",
    },
    rules: [
      "Assignment is per term. A subject you taught last term will not appear until you are assigned to it again.",
      "You can only enter marks for subjects listed here.",
    ],
    sourceOfTruth: "app/actions/teacher-assignment.ts",
  },

  "teacher.traits": {
    title: "Behaviour & Skills",
    location: ["Teacher", "My Classes", "Behaviour & Skills"],
    purpose:
      "The affective and psychomotor ratings that appear on a student's report card, entered by their form teacher.",
    example: {
      doing: "Rate punctuality and neatness for your class.",
      then: "The ratings appear on each student’s report card for the term. Like marks, families see them only once results are published.",
    },
    onSave: ["Ratings are saved against the student for this class term and appear on their report card for the term."],
    rules: [
      "These are entered by the form teacher for the class, not by every subject teacher.",
      "Like marks, ratings are only visible to families once the term's results are published.",
    ],
    sourceOfTruth: "lib/report-traits.ts",
  },

  "teacher.attendance": {
    title: "Attendance",
    location: ["Teacher", "Attendance"],
    purpose: "Daily attendance for the classes you take.",
    example: {
      doing: "Mark today’s register for JSS 1A.",
      then: "Attendance is saved per student for that day against the class term, and feeds the attendance figures on their report card.",
    },
    onSave: ["Attendance is recorded per student per day for the class term you are marking."],
    sourceOfTruth: "app/actions/teacher-management.ts",
  },

  // ---------------------------------------------------------------- Portals
  "portal.academicRecord": {
    title: "Academic record",
    location: ["Parent", "My Children", "Full academic record"],
    purpose:
      "Every session and term in one place: each term’s subjects and marks, the session summary across all three terms, and the class movements between them.",
    example: {
      doing: "Open it at the end of the year to see how the whole session went, not just third term.",
      then: "Each term listed with its subjects and grades, then a session summary averaging each subject across the terms it was sat in — the same calculation the school’s promotion decision uses.",
    },
    rules: [
      "You see results only after the school has published them. A term still being marked shows nothing, which does not mean no work has been done.",
      "The session summary needs every term in it. If one term is missing or held, the summary is held too, because an average over two of three terms is a different number, not a smaller one.",
      "If your school holds results against unpaid fees, a term with an outstanding balance is hidden until it is settled. Terms already paid for stay visible.",
    ],
    sourceOfTruth:
      "lib/results/academic-history.server.ts · lib/results/withholding-rules.ts · lib/compiler-v2.ts",
  },

  "parent.children": {
    title: "My Children",
    location: ["Parent", "My Children"],
    purpose: "Your children at this school: their classes, subjects, results and fees.",
    example: {
      doing: "Check your child’s results near the end of term.",
      then: "If the school has published them you see the full report; if it has not, you see nothing yet. An empty results page does not mean no work has been marked.",
    },
    rules: [
      "You see results only after the school has published them. A term still being marked shows nothing, which does not mean no work has been done.",
      "Fee balances shown are what is currently owed, after any discount or exemption the school has applied.",
    ],
    sourceOfTruth: "app/actions/parent-portal.ts · lib/results-visibility.ts",
  },

  "parent.dashboard": {
    title: "Parent Portal",
    location: ["Parent", "Dashboard"],
    purpose:
      "Your children at this school in one place — the classes they are in, what they owe, and results once the school has released them.",
    example: {
      doing: "Sign in to check fees and results for two children.",
      then: "Both children, each with their class, what is still owed after any discount, and results the school has published. A child missing here has not been linked to your account yet.",
    },
    rules: [
      "You see only the children linked to your account. If one is missing, the school has not linked them yet.",
      "Results appear only after the school publishes them. A term being marked shows nothing, which does not mean no work has been done.",
      "Fee balances are what is currently owed after any discount or exemption the school has applied.",
    ],
    sourceOfTruth: "app/actions/parent-portal.ts · lib/results-visibility.ts",
  },

  "admin.studentCreate": {
    title: "Add New Student",
    location: ["Students", "Add Student"],
    purpose: "Admits a student to the school and places them in a class for the current term.",
    example: {
      doing: "Admit a new student into JSS 1A during Third Term.",
      then: "An admission number like BFC/2025/0065 is generated and Third Term’s fees are raised in the same step. As a mid-session entrant they are charged the admission fee but not the returning-students levy.",
    },
    onSave: [
      "An admission number is generated from the school's own template against a per-school, per-year counter, so two clerks admitting at once cannot collide.",
      "The student is enrolled into the class term you chose, and that term's fees are raised in the same transaction — a student is never left enrolled without their charges.",
      "Which fees are raised depends on each schedule's scope and audience, so a student admitted mid-session is charged differently from the returning roll.",
    ],
    rules: [
      "A student cannot be actively enrolled in two classes in the same term.",
      "Students can sign in with their admission number as well as their email address.",
    ],
    permissions: ["students.manage"],
    sourceOfTruth: "app/actions/student-management.ts · lib/fee-charges.server.ts",
  },

  "admin.teacherCreate": {
    title: "Create New Teacher",
    location: ["Teachers", "Create Teacher"],
    purpose: "Creates a teaching staff member and the login they will use.",
    example: {
      doing: "Create a teacher who will take JSS 1A Mathematics.",
      then: "A login and a classroom record, linked. They still cannot enter Mathematics marks until you assign them the subject for this term, and they are not on the payroll until a staff record is added under HR.",
    },
    onSave: [
      "A login account and a classroom record are created and linked together.",
      "This does not by itself put them on the payroll — a staff record for payment is separate, and is added under HR & Payroll.",
    ],
    rules: [
      "Teaching them a subject is a separate step, and it is per term. Until a subject is assigned for the current term, they cannot enter its marks.",
      "What they can reach beyond their own classroom is decided by their permission profile, not by being a teacher.",
    ],
    permissions: ["teachers.manage"],
    sourceOfTruth: "app/actions/teacher-management.ts",
  },

  "student.dashboard": {
    title: "My Dashboard",
    location: ["Student"],
    purpose: "Your classes, subjects, published results and fee position.",
    example: {
      doing: "Sign in with your admission number to check your results.",
      then: "Your class, subjects and fee position. Results appear only once your school publishes them for your class.",
    },
    rules: [
      "Results appear only once the school publishes them for your class.",
      "You can sign in with your admission number as well as your email address.",
    ],
    sourceOfTruth: "app/actions/student-management.ts · lib/results-visibility.ts",
  },

  "profile": {
    title: "My Profile",
    location: ["Profile"],
    purpose: "Your own account — your details, and the password you sign in with.",
    example: {
      doing: "Change your password or update your details.",
      then: "Saved against your own account only. What you can reach in the system is set by your permission profile, not here.",
    },
    rules: [
      "Changes here affect your account only.",
      "What you can reach in the system is set by your permission profile, which an administrator controls; it is not changed from this screen.",
    ],
    sourceOfTruth: "app/actions/user-management.ts",
  },

  // ------------------------------------------------------------- Super admin
  "superAdmin.schools": {
    title: "Schools",
    location: ["Platform", "Schools"],
    purpose: "Every school on this deployment. Registering a school here is what makes it usable at all.",
    example: {
      doing: "Register a new school on the platform.",
      then: "The school is created together with its grading bands, assessment scheme, promotion policy and the four standard permission profiles — without those, nothing else in the school works.",
    },
    onSave: [
      "Creating a school also creates the things nothing else works without: its grading system and bands, its assessment scheme, its promotion policy, and the four standard permission profiles.",
    ],
    rules: [
      "Schools are fully separated. A user belongs to one school and cannot see another's data.",
      "A school with payroll or expenditure history cannot simply be deleted — records that other records depend on are deliberately protected.",
    ],
    permissions: ["school.manage"],
    sourceOfTruth: "app/actions/school-management.ts",
  },

  "superAdmin.users": {
    title: "Users",
    location: ["Platform", "Users"],
    purpose: "Accounts across the platform, by kind — admins, teachers, parents and students.",
    example: {
      doing: "Deactivate an account after somebody leaves.",
      then: "They are refused on their very next request, rather than continuing to work until their session happens to expire.",
    },
    rules: [
      "A login is separate from the person's record, so one person can have more than one way to sign in: email for everyone, admission number for students.",
      "Deactivating an account takes effect on its next request rather than when its session expires.",
    ],
    permissions: ["users.manage"],
    sourceOfTruth: "app/actions/user-management.ts",
  },

  "superAdmin.system": {
    title: "System",
    location: ["Platform", "System"],
    purpose: "Platform-wide configuration and health, above any individual school.",
    example: {
      doing: "Check the platform rather than one school.",
      then: "Configuration and health above the school boundary, covering every school on the deployment.",
    },
    permissions: ["school.manage"],
    sourceOfTruth: "app/actions/admin-dashboard.ts",
  },

  "superAdmin.dashboard": {
    title: "System Dashboard",
    location: ["Platform", "Dashboard"],
    purpose: "The state of the whole deployment: schools registered, accounts in use, and activity across all of them.",
    example: {
      doing: "Open the platform dashboard.",
      then: "Schools registered, accounts in use and activity across all of them. These totals span every school; a school admin sees only their own.",
    },
    rules: [
      "Figures here span every school. A school admin sees only their own school; this view is above that boundary.",
    ],
    sourceOfTruth: "app/actions/admin-dashboard.ts",
  },

  "superAdmin.analytics": {
    title: "Analytics",
    location: ["Platform", "Analytics"],
    purpose: "Activity across every school on the deployment.",
    example: {
      doing: "Compare activity across schools.",
      then: "Usage and volumes for every school on the deployment — a view no school admin can reach, since they see only their own.",
    },
    permissions: ["reports.export"],
    sourceOfTruth: "app/actions/analytics.ts",
  },

  // ------------------------------------------------------------- Dashboards
  "admin.dashboard": {
    title: "Dashboard",
    location: ["Dashboard"],
    purpose: "The state of your school right now: roll size, staffing, money collected and results progress for the current term.",
    example: {
      doing: "Open the dashboard at the start of the day.",
      then: "Roll size, staffing, money collected and results progress for the current term. Every figure follows its own module’s rules — collected money excludes payments still marked pending.",
    },
    rules: [
      "Everything here is scoped to the term flagged as current in the calendar.",
      "Figures follow the same rules as the modules they come from — collected money excludes pending payments, and result counts exclude unpublished marks where families are concerned.",
    ],
    sourceOfTruth: "app/actions/admin-dashboard.ts",
  },

  "teacher.dashboard": {
    title: "Dashboard",
    location: ["Dashboard"],
    purpose: "Your teaching for the current term: the classes you hold, the subjects you teach, and what still needs marks.",
    example: {
      doing: "Sign in at the start of term.",
      then: "The classes you hold, the subjects you teach and what still needs marks — all for the current term, so it resets when the school moves on.",
    },
    rules: ["Assignments are per term, so this resets when the school moves to a new term."],
    sourceOfTruth: "app/actions/teacher-compiler.ts",
  },
} as const satisfies Record<string, ModuleGuide>

export type ModuleGuideKey = keyof typeof MODULE_GUIDES

export function getModuleGuide(key: ModuleGuideKey): ModuleGuide {
  return MODULE_GUIDES[key]
}
