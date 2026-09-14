# DigiSchool-Pro Roles And Compiler V2 Foundation

Status: Foundation completed

Date: 2026-08-28

## Purpose

Remove the next layer of hardcoding before building the remaining Compiler V2 screens.

This foundation makes the system flexible in two places:

- A school can assign multiple permission profiles to a user instead of depending only on
  one broad login role.
- A class term result set now has a workflow state, so results can move through review,
  publish, withdraw, and lock steps.

## Role And Permission Foundation

Added database models:

- `PermissionProfile`
- `UserPermissionProfile`

The broad login roles stay in place:

- `SUPER_ADMIN`
- `ADMIN`
- `ACCOUNTANT`
- `TEACHER`
- `PARENT`
- `STUDENT`

The new profiles sit under those roles. This means a school can have:

- School Manager
- Exams Officer
- Finance Officer
- HR and Payroll Officer
- Any custom profile the school creates later

Implemented:

- `lib/permissions.ts`
- `app/actions/permissions.ts`

The server can now:

- Seed system permission profiles for a school.
- Create custom permission profiles.
- Assign a profile to a user.
- Revoke a profile without deleting history.
- Resolve effective permissions from login role plus active profiles.

## Compiler V2 Workflow Foundation

Added database models:

- `ClassTermResultWorkflow`
- `ResultWorkflowEvent`

Added enums:

- `ResultWorkflowStatus`
- `PromotionEvaluationScope`

Result workflow statuses:

- `DRAFT`
- `REVIEWED`
- `PUBLISHED`
- `LOCKED`
- `WITHDRAWN`

Implemented in `app/actions/compiler.ts`:

- `getClassTermResultWorkflow`
- `reviewClassTermResults`
- `lockClassTermResults`
- `publishClassTermResults` now writes the workflow status.
- `unpublishClassTermResults` now marks the workflow as withdrawn.

Each workflow movement records:

- Previous status.
- New status.
- Actor id, name, and role.
- Optional note/reason.
- Audit log event.

## Promotion Policy Expansion

Extended `TransitionPolicy` with:

- `evaluationScope`
- `requiredSubjectIds`
- `minCoreSubjectsPassed`
- `requireAllSubjectsEntered`
- `allowManualOverride`

This prepares the full promotion engine for:

- Current-term evaluation.
- Session-average evaluation.
- Required/core subject checks.
- Strict missing-result checks.
- Schools that allow or block manual override.

Existing transition behavior remains compatible. By default, policy rules are still off
unless a school deliberately enables them.

## Pure Rule Coverage

Added:

- `lib/compiler-v2.ts`
- `lib/compiler-v2.test.ts`
- `lib/permissions.test.ts`

Covered:

- Effective permissions from roles plus profiles.
- Unknown permission strings are ignored, not granted.
- Accountants get finance permissions without school-manager powers.
- Cumulative subject averages across terms.
- Missing and unpublished cumulative result detection.
- Flexible promotion evaluation with average, pass count, core subjects, publication, and
  completeness rules.
- Result workflow transition validation.

## Migration

Added migration:

- `prisma/migrations/20260828130000_roles_and_compiler_v2_foundation/migration.sql`

Applied to the development database successfully.

## Verification

Commands passed:

- `npx prisma format`
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npx vitest run lib/permissions.test.ts lib/compiler-v2.test.ts`
- `npx vitest run --config vitest.integration.config.ts test/compiler-flow.integration.ts`
- `npm run type-check`
- `npm run lint`

Current focused counts:

- 9 new unit tests passed.
- Compiler integration passed.

## Remaining Compiler V2 Package Work

The foundation is complete, but the full package still needs UI and report wiring:

- Permission profile management screens.
- Sidebar/menu gating from permission profiles.
- Exams Officer dashboard area.
- Result workflow buttons and status badges on class result pages.
- Full cumulative three-term report screens and PDFs.
- Promotion preview using session-average/core-subject policy before transition execution.
- Analytics pages for class, subject, school, best/improved/declining students, and failure
  rate ranking.
