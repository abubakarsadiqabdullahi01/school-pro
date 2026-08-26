# DigiSchool-Pro UI/UX and Data Flow Review

Reviewed 2026-08-23 by static analysis of `app/` and `components/`, plus route checks
against the running dev server. Companion to `pre-finance-test-plan.md`, which covers
correctness and authorization. This document covers presentation quality and the shape
of data flow, specifically for the admin and teacher roles.

**Headline:** the component layer is built on a real design system and the newest code is
genuinely well-architected. Two things held it back from reading as enterprise software:
dark mode was shipped but visibly broken, and the app is mid-migration between three
data-fetching patterns without having finished any of them.

**The first of those is now fixed** — see the Progress section immediately below. Part 1
records the original findings as written; where the Progress section contradicts it, the
Progress section is current.

---

## Progress — colour token conversion (2026-08-23)

**Done: 538 → 39 hardcoded neutrals.** Of the 39 remaining, 24 are in
`components/debug-student-assignments.tsx`, which is slated for deletion, leaving **15**
— all verified as deliberate (see below).

Verified in the browser against the running dev server, not just by grep. Toggling to
dark on the admin dashboard:

| Element | Light | Dark | Verdict |
| --- | --- | --- | --- |
| `body` background | `lab(100)` white | `lab(2.75)` near-black | inverts |
| `body` text | `lab(2.75)` | `lab(98.26)` | inverts |
| StatsCard title (`text-muted-foreground`) | `lab(48.5)` | `lab(66.1)` | lifts correctly |
| StatsCard surface | light blue gradient `lab(96.5→92)` | navy gradient `lab(15.7→26.2)` | dark variant applies |
| Page heading (gradient text) | dark gradient | `lab(98.26)` near-white | was invisible in dark, now correct |

### The trap this pass had to avoid

A blind find-and-replace would have made things worse. `components/admin-dashboard/StatsCards.tsx`
renders `text-gray-900` **inside** a permanently light card (`from-blue-50 to-blue-100`),
so that gray was *correct* — converting it to `text-foreground` alone would have produced
white text on a light blue card in dark mode.

Four other files had the same parent/child shape:
`teacher/teacher-subjects-view.tsx`, `student-management/student-form.tsx`,
`student-management/student-edit-form.tsx`, and
`teacher-compiler/TeacherCompilerInterface.tsx`.

For each, the light tint got a dark counterpart first, and only then were the neutrals
converted:

```
from-blue-50 to-blue-100  →  from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900
text-blue-600             →  text-blue-600 dark:text-blue-400
```

Note that a same-line grep for "gray text next to a light tint" returns nothing across
the whole repo — the trap only shows up across parent/child elements, so it has to be
found by looking for light *gradient containers*, not by line matching.

### Deliberately left as-is

| Location | Why |
| --- | --- |
| `compiler/ca-sheet.tsx`, `teacher-compiler/teacher-ca-sheet.tsx` — `border-gray-500` | Printable CA sheets. Print output should stay black-on-white regardless of theme. |
| `app/page.tsx` — `text-slate-50`, `text-slate-100/90` | Text over a hero photograph, light in both themes by design. |
| `text-white` ×16 (`ui/button.tsx`, `ui/badge.tsx`, `QuickActions.tsx`, `ActionButtons.tsx`, `SessionCalendarView.tsx`) | Sits on saturated fills and gradients where white is correct in both themes. |
| `app/error/page.tsx`, `app/maintenance/page.tsx` | Standalone branded pages; the light gradient base is intentional and now has a `dark:` counterpart. |

### Correction to this document's earlier claims

- **The theme toggle works.** While testing I twice read the DOM synchronously in the
  same tick as the click, before React had flushed, and wrongly concluded the toggle was
  dead. A clean single click from a known-light state gives
  `rootClass: "dark"`, `localStorage: "dark"`, and an inverted body background. The
  custom provider is correctly mounted around `{children}` in `app/layout.tsx:50` and
  the live header reads the same context.
- **The sonner mismatch is real but milder than described above.**
  `components/ui/sonner.tsx` reads `useTheme()` from **next-themes**, which is not
  mounted, so `theme` falls back to `"system"` — toasts follow the OS preference rather
  than the app toggle. However, the same component overrides `--normal-bg`,
  `--normal-text`, and `--normal-border` with the app's own CSS tokens, which do follow
  the `.dark` class. So ordinary toast colours track the app correctly; only sonner's
  own variant styling (success/error/warning) can diverge. Worth fixing, not urgent.

The remaining reason to consolidate on next-themes is the **flash of the wrong theme**:
the custom provider initialises `useState("light")` and only corrects inside `useEffect`,
so a dark-mode user sees a light flash on every load. That is a code-level certainty and
is what next-themes' pre-hydration script exists to prevent.

### Also resolved since this review was written

`npm run type-check` now reports **0 errors**, down from 191. The parallel session
cleared them, which means item 22 is ready — `typescript: { ignoreBuildErrors: true }`
can be removed from `next.config.ts` now, and the check will hold the line.

### Still open from Part 1

- [ ] Add `error.tsx` / `not-found.tsx` boundaries.
- [ ] Wrap the 13 tables in `overflow-x-auto`.
- [ ] Consolidate onto next-themes and delete the custom provider (for the FOUC).
- [ ] Delete the dead `dashboard/layout.tsx` + `dashboard/header.tsx` pair.
- [ ] Status colours (`bg-green-100 text-green-800` badges) still have no dark variants.
      They do not break anything the way the neutrals did, but they read as washed-out
      in dark mode. Recommended recipe: `bg-green-500/10 text-green-700 dark:text-green-400`.
- [ ] Add an ESLint rule banning raw `gray-*` / `bg-white` in `components/` so the 538
      cannot creep back.

---

## Part 1 — UI/UX for professional and enterprise use

### Fix — dark mode ships as a feature but is broken

The app ships a working dark-mode toggle in the header
(`components/dashboard-header.tsx:99`) backed by a provider that adds `.dark` to
`documentElement`. So users can switch. What they get is unreadable.

**538 hardcoded colour utilities across 43 files** ignore the theme entirely:

| Class | Uses |
| --- | --- |
| `text-gray-800` | 89 |
| `text-gray-600` | 74 |
| `bg-white` | 64 |
| `bg-gray-100` | 51 |
| `bg-gray-50` | 39 |
| `text-gray-500` | 38 |
| `text-gray-700` | 37 |
| `border-gray-300` | 34 |

In dark mode a `bg-white` card renders white on a dark page, and `text-gray-800` body
copy goes nearly invisible against dark surfaces. The worst-affected files are the admin
dashboard components (`components/admin-dashboard/*` — StatsCards, SystemHealth,
QuickActions, RecentActivities, SessionOverview, AcademicProgress) and the teacher
compiler entry page, which are exactly the screens an evaluator opens first.

The fix is mechanical, not a redesign — the design tokens already exist:

| Replace | With |
| --- | --- |
| `bg-white` | `bg-card` or `bg-background` |
| `text-gray-900` / `-800` | `text-foreground` |
| `text-gray-600` / `-500` / `-400` | `text-muted-foreground` |
| `bg-gray-50` / `-100` | `bg-muted` |
| `border-gray-200` / `-300` | `border-border` |

- [ ] Convert the 43 files, starting with `components/admin-dashboard/`.
- [ ] Add an ESLint rule banning raw `gray-*` / `bg-white` in `components/` so it cannot
      regress.
- [ ] Review both themes side by side afterwards.

### Fix — there are two theme systems and they disagree

`components/theme-provider.tsx` is a hand-rolled React context, but `next-themes` is also
a dependency and `components/ui/sonner.tsx:3` reads `useTheme` **from next-themes**.
Nothing sets next-themes' state, so toasts resolve to its default while the rest of the
app follows the custom context. Toasts can render in the wrong theme.

The custom provider also causes a flash of the wrong theme on every page load: it
initialises `useState<"light" | "dark">("light")` and only corrects inside `useEffect`,
so a dark-mode user sees a light flash after hydration. `next-themes` exists precisely to
solve this with a pre-hydration script.

- [ ] Delete `components/theme-provider.tsx`, wrap the app in next-themes'
      `ThemeProvider` with `attribute="class"`, and add `suppressHydrationWarning` to
      `<html>`. The header toggle and sonner then share one source of truth.

### Fix — no error or not-found boundaries anywhere

There is no `error.tsx`, `global-error.tsx`, or `not-found.tsx` in the entire `app/`
tree. Any unhandled server error shows the raw Next.js error screen, and any mistyped URL
shows the stock 404.

This is easy to miss because `app/error/page.tsx` and `app/maintenance/page.tsx` exist —
but those are *routes* you have to navigate to, not boundaries React renders when
something fails. Nothing routes to them automatically.

- [ ] Add `app/error.tsx` and `app/not-found.tsx` with branded fallbacks and a way back.
- [ ] Add `app/dashboard/error.tsx` so a failure inside one dashboard page does not blank
      the whole shell.

### Fix — 13 of 32 table components break the mobile layout

These render a `<Table>` with no horizontal scroll container, so on a phone the table
forces the whole page body to scroll sideways:

`parent-managements/parent-details.tsx` · `parent-managements/parents-table.tsx` ·
`profile/login-history-table.tsx` · `school-management/schools-table.tsx` ·
`score-entry/StudentScoreRow.tsx` · `session-management/all-terms-table.tsx` ·
`session-management/sessions-table.tsx` · `student-management/academic-records.tsx` ·
`student-management/student-details.tsx` · `teacher/teacher-attendance-view.tsx` ·
`teacher/teacher-classes-view.tsx` · `teacher-management/teachers-table.tsx` ·
`user-management/user-management-table.tsx`

The other 19 already wrap in `overflow-x-auto`, so the pattern is established — these
were just missed. `session-management/terms-table.tsx` was fixed during this review and
is the reference.

- [ ] Wrap each in `<div className="overflow-x-auto">`.
- [ ] For the score-entry grid specifically, consider a sticky first column so student
      names stay visible while scrolling to the exam column.

### Improve — dead duplicate layout and header

`components/dashboard/layout.tsx` is imported by nothing, and it is the only importer of
`components/dashboard/header.tsx` (147 lines). The live pair is
`components/dashboard/dashboard-layout-client.tsx` → `components/dashboard-header.tsx`
(150 lines). The two headers differ by three lines, so maintaining both means fixing every
header bug twice — and one of the copies has no effect at all.

- [ ] Delete `components/dashboard/layout.tsx` and `components/dashboard/header.tsx`.

### Improve — loading states cover most but not all routes

66 of 82 dashboard routes have a `loading.tsx`. The gaps show as a frozen page during
navigation rather than a skeleton.

- [ ] Add the missing 16, or move to a single shared skeleton at the segment level.

### Improve — the UI layer opts out of type safety

**143 uses of `: any`, `<any>`, or `any[]`** in `app/` and `components/`. The heaviest:
`grading-systems-manager.tsx` (14), `StudentTransitionsOverview.tsx` (12),
`TransitionSelectionControls.tsx` (9), `SessionCalendarView.tsx` (8).

Combined with `typescript: { ignoreBuildErrors: true }` in `next.config.ts` (see the test
plan), this means prop contracts between pages and components are essentially unchecked —
which is how `parent-search-dialog.tsx:94` ended up reading an `email` property that does
not exist on the object it receives.

### Improve — accessibility is partial, and unmeasured

41 `aria-*` attributes and 36 `sr-only` labels against 43 icon-only buttons, so most but
not all icon buttons are labelled. No `<img>` is missing `alt`. That is a reasonable
baseline, but nothing here has been measured against a real audit.

- [ ] Run axe or Lighthouse on the six highest-traffic screens (admin dashboard, students
      list, score entry, attendance, teacher dashboard, parent dashboard) and fix by
      report rather than by guesswork.
- [ ] Verify keyboard traversal of the score-entry grid — a dense table of inputs is
      where keyboard support usually breaks, and it is the screen teachers use most.

---

## Part 2 — Data flow, admin and teacher

### The core issue: three patterns, none finished

| Pattern | Where | Count |
| --- | --- | --- |
| Server component queries Prisma directly | most list and detail pages | majority |
| TanStack Query in a client component | compiler, results, score entry, and the tables converted during this review | 9 files |
| Raw `useEffect` + `useState` + server action | student management, teacher assignment, attendance, transitions, analytics | 13 files |

A standardization is already in flight and is the right one: `lib/query-keys.ts` now
provides a central key factory plus `queryTiming` constants (`stable` 5 min,
`interactive` 2 min, `live` 30 s), adopted by 7 components. Finish that migration rather
than starting a different one.

**Gap worth naming: `queryKeys` has namespaces for `scoreEntry`, `teacher`, and
`superAdmin` — but none for `admin`.** Every admin screen the question is about (students,
teachers, parents, classes, subjects, class terms, transitions) is unrepresented, which is
why those are the files still on the raw-`useEffect` pattern.

- [ ] Add an `admin` namespace to `queryKeys` covering students, teachers, parents,
      classes, subjects, classTerms, and transitions.
- [ ] Convert the 13 raw-`useEffect` components to `useQuery` / `useMutation` using it.
      `session-management/terms-table.tsx` is the reference conversion.

### Fix — the QueryClient is created at module scope

`components/dashboard/dashboard-layout-client.tsx:15` does
`const queryClient = new QueryClient()` at module level. React Query's documented pattern
for the App Router is `useState(() => new QueryClient())`, precisely because a
module-scope client can be shared across renders and, during server rendering of a client
component, across requests — meaning one user's cached data can be served to another.

- [ ] Move it into `useState(() => new QueryClient())` and set sensible global defaults
      there instead of per-call.

### Improve — the teacher score-entry screen is a four-step waterfall

`TeacherCompilerInterface.tsx` is well-built — proper `queryKey`s, `enabled` gating,
`staleTime`, and a `useMutation` with `onSuccess` that marks rows saved and toasts a real
count. The issue is the shape of the chain, not the code:

1. `getTeacherTerms` + `getTeacherCurrentTerm` (parallel)
2. an effect then sets `form.termId` — an extra render before anything else can start
3. `getTeacherClassTerms(termId)`
4. `getTeacherSubjectsForClassTerm` + `getTeacherClassTermStudents` (parallel)
5. `getTeacherAssessmentsWithStatus(classId, subjectId, termId)`

A teacher waits on four sequential round trips before the grid is usable, and step 2 adds
a render cycle for something the server already knows.

- [ ] Resolve the teacher's terms and current term on the server in
      `teacher/compiler/page.tsx` and pass them as `initialData`. That removes steps 1
      and 2 from the critical path and the grid becomes reachable in two hops.
- [ ] Derive the initial `termId` from props instead of setting it in an effect.

### Improve — server-side revalidation is applied inconsistently

Six action files perform mutations with no `revalidatePath` at all:

| File | Mutations | `revalidatePath` |
| --- | --- | --- |
| `parent-management.ts` | 5 | 0 |
| `school-calendar.ts` | 2 | 0 |
| `compiler-improved.ts` | 1 | 0 |
| `teacher-assessments.ts` | 1 | 0 |
| `teacher-compiler.ts` | 1 | 0 |
| `student-transitions.ts` | 1 | 0 |

These are **not** currently broken — I checked each. The callers compensate:
`parent-create-form.tsx:78` and `parents-table.tsx:142` call `router.refresh()`,
`parent-details.tsx:162` calls `invalidateQueries`, `StudentTransitionTable.tsx:105`
invokes an `onTransitionComplete()` callback, and the compiler screens refetch through
React Query. Data does update.

The problem is that correctness depends on every future caller remembering. Compare
`term-management.ts` (14 `revalidatePath` calls for 4 mutations) — there, freshness is
guaranteed by the action regardless of who calls it.

- [ ] Make every mutating action revalidate the paths it affects, and treat client-side
      invalidation as an optimisation on top rather than the only mechanism.

### What is already right

Worth stating plainly, because it constrains how much should change:

- Every list and detail page is a server component querying Prisma directly with the
  school filter applied — no client round trip, no over-fetching, no exposed ids.
- `getDashboardData` batches ten queries into a single `Promise.all` instead of awaiting
  them in sequence.
- The teacher compiler's mutation path handles partial saves, tracks dirty rows, and
  reports a real saved count.
- Empty states are present and specific throughout ("No terms have been created for this
  session yet.", "No payment records yet.").
- 66 of 82 routes have loading skeletons.

---

## Priority order

**Visual credibility — cheap, high impact, do first**

1. Convert the 538 hardcoded colours to design tokens, starting with
   `components/admin-dashboard/`.
2. Collapse onto next-themes and delete the custom provider.
3. Add `error.tsx` and `not-found.tsx` boundaries.
4. Wrap the 13 unwrapped tables in `overflow-x-auto`.

**Architecture — do alongside**

5. Move the QueryClient into `useState`.
6. Add the `admin` namespace to `queryKeys`.
7. Convert the 13 raw-`useEffect` components.
8. Add `revalidatePath` to the six action files that lack it.
9. Server-render the teacher compiler's initial term.

**Cleanup**

10. Delete the dead `dashboard/layout.tsx` + `dashboard/header.tsx` pair.
11. Add the 16 missing `loading.tsx` files.
12. Replace the 143 `any` types, worst files first.
13. Run axe on the six main screens and fix by report.

## Not covered

Judged from source and route behaviour, not from looking at rendered pages — the browser
pane would not composite, so no screenshots were taken. Still needs a human pass:

- [ ] Whether the visual hierarchy and density actually read as enterprise-grade.
- [ ] Both themes side by side after the token conversion.
- [ ] Real-device mobile testing, especially the score-entry grid.
- [ ] Whether the admin dashboard's four tabs earn their place, given two of them
      currently render identical content (see the test plan, section 2).
