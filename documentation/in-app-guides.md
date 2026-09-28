# In-app module guides

Every module screen carries an ⓘ beside its heading. Clicking it opens a dialog that
explains that screen: what it is for, what is on it, what the system does when you save,
and the rules it enforces that the controls themselves do not reveal.

The point is that a new bursar, exams officer or form teacher can work out the system from
inside it, without a manual and without asking whoever set it up.

## What a guide contains

| Part | Shown as | What belongs in it |
|---|---|---|
| `location` | Breadcrumb above the title | Where this screen sits, e.g. `Finance › Fee Setup` |
| `purpose` | Sentence under the title | The job the screen exists to do |
| `sections` | *What is on this screen* | Each card, tab or table, and what it is showing |
| `example` | *Example* — **You do / You get** | One concrete task with real values, and what to expect back |
| `onSave` | *What happens when you save* | The numbered consequences of committing |
| `rules` | *Rules the system enforces* | Behaviour that is real but invisible on screen |
| `nextSteps` | *Where to go next* | The screen someone normally needs after this one |
| `permissions` | *Who can use this* | The permission keys that gate the screen |

Only `title`, `location` and `purpose` are required by the type, but **every guide carries an
`example`** and a test enforces it. A screen that does not save anything has no `onSave`, and
the dialog simply omits that heading.

### Why the example matters most

A rule tells someone what is true; an example tells them what will happen. These are written
in the school's own terms, with figures a Nigerian secondary school will recognise:

> **You do:** Take ₦50,000 from a JSS 1A student who owes ₦45,000 tuition and a ₦7,500 levy.
> **You get:** A receipt is issued, tuition is marked PAID in full, and the levy becomes
> PARTIAL with ₦2,500 still owed. Their balance falls from ₦52,500 to ₦2,500.

The `then` half is the part users actually need: it sets the expectation, so somebody can tell
straight away whether the system did what they meant.

## Where the content lives

All of it is in [`lib/module-guides.ts`](../lib/module-guides.ts), keyed by a stable id
such as `finance.dashboard`. Nothing is written inline in a component.

Keys are ids rather than pathnames on purpose: several views are mounted under two URL
trees — `FinanceDashboardView` serves both `/dashboard/admin/finance` and the bursar's
`/dashboard/accountant` — and a guide should not have to know which tree it woke up in.
Screens that genuinely are the same screen share a key.

## Adding or changing one

1. Add an entry to `MODULE_GUIDES`, including `sourceOfTruth` — the action file the
   behaviour comes from.
2. Put the ⓘ next to the heading:

```tsx
import { InfoGuide } from "@/components/ui/info-guide"

<div className="flex items-center gap-1.5">
  <h2 className="text-3xl font-bold tracking-tight">Students</h2>
  <InfoGuide guideKey="admin.students" />
</div>
```

New screens can use [`ModuleHeading`](../components/module-heading.tsx) instead, which
renders the title, the ⓘ, a sub-line and an actions slot in one component.

## The accuracy rule

**A guide states what the code does.** Not what it should do, not what is planned.

A user who is told the wrong rule stops trusting all of them, which is worse than shipping
no guide at all — so the claims here are drawn from
[`system-reference.md`](./system-reference.md) and the action file each entry cites, and
they change when that behaviour changes.

Some of the rules are there precisely because they have caught people out:

- `RETURNING_STUDENTS` compares **sessions**, not terms, so in a school's first session a
  returning-students fee bills nobody.
- Post-tax percentage deductions are taken on the **taxable base**, not on gross.
- The **current-term flag** is what the system reads, not today's date.
- Entering a score is not releasing it — families see nothing until results are published.

## The first-login tour

The first time somebody signs in, they get a short stepped tour of the places their role
actually works in — four stops for a teacher, seven for an admin, one for a student.

It is defined in [`lib/welcome-tour.ts`](../lib/welcome-tour.ts) as a list of **guide keys plus
a route**, not as its own prose. The title, purpose and example on each step are read from
`MODULE_GUIDES`, so the tour and the ⓘ on the screen it points at can never say two different
things about the same page. Each stop adds only a one-line `why` — the reason *this role*
should care — and a "Take me there" link.

Stops are filtered by the viewer's permissions before display: an admin holding only finance
permissions is not walked to the compiler, because arriving there would bounce them.

### Where "already seen" is stored

In `localStorage`, keyed by user id — not on the `User` record. That choice was deliberate:
a new column means a Prisma migration, and on this deployment migrations are applied by hand
against a cPanel database. The cost is that the tour reappears on a new browser or device.
For a dismissible welcome tour that is a fair trade; if it ever needs to be truly once-per-
account, it becomes a `User` field and a migration.

Every read and write is wrapped in `try/catch`, because private browsing and blocked site data
make `localStorage` throw rather than return null.

## What the tests guard

[`lib/module-guides.test.ts`](../lib/module-guides.test.ts) checks that every guide has a
real title, location and purpose; that it cites only permissions that exist in
`lib/permissions.ts`; that no list item is blank or duplicated; that each entry names a
`sourceOfTruth`; and that **every guide is reachable from at least one screen**.

It also checks the opposite direction, which is the one that actually rots: **every screen
heading must have an ⓘ**. Add a screen, style its heading like every other screen, ship it
without a guide, and this test fails — `components/module-heading.tsx` (which renders the icon
itself) and `components/page-header.tsx` (a generic shell with no screen of its own) are the
only exemptions.

[`lib/welcome-tour.test.ts`](../lib/welcome-tour.test.ts) checks that every role has somewhere
to start, that **every tour stop points at a route that exists on disk**, that permission
filtering actually hides gated stops, that roles holding no permissions still get a tour, and
that no tour runs longer than seven stops.

The remaining direction is covered by the compiler: `guideKey` is typed as a union of the
registry's keys, so neither a screen nor a tour stop can cite a guide that does not exist.
