# Paystack Slice 0 Readiness Record

**Purpose:** Evidence and decisions required before DigiSchool-Pro begins Slice 1.  
**Reviewed:** 25 September 2026  
**Gate status:** **CONDITIONAL PASS FOR TEST-MODE ENGINEERING — LIVE REMAINS BLOCKED**

## Evidence already available

| Check | Current evidence | Status |
|---|---|---|
| Paystack account exists | Dashboard screenshot shows account `Digisoft Commu...` / business ID `825961` | Confirmed |
| Test environment available | Dashboard is visibly in test mode | Confirmed |
| Two-factor authentication | Dashboard displays “Set up 2FA”; owner explicitly accepted this risk for now | Risk accepted; still recommended before live |
| Repository secret placeholders | Safe blank `PAYSTACK_*` names added to environment templates | Complete |
| Live business activation/KYC | No approval evidence supplied | Not confirmed |
| Platform/subaccount approval | Proposed in architecture; no written Paystack confirmation supplied | Not confirmed |
| Canonical origin | `https://schoolpro.digisoft.com.ng` supplied by owner | Confirmed |
| Test credentials | Supplied in chat and visible in a screenshot | Compromised; rotate before API testing |

No API key value was copied into the repository. Because the test secret was posted in chat
and displayed in a screenshot, it must be replaced with **Generate new secret key** before
the application makes any Paystack request. The replacement value belongs only in the
local/cPanel secret environment.

## Owner actions required in Paystack

- [ ] Enable 2FA for the Paystack owner account and retain recovery codes securely (owner
  deferred this for test development; it remains a live-readiness recommendation).
- [ ] Confirm the account's legal business name and complete/verify activation requirements.
- [ ] Confirm that the account may operate DigiSchool-Pro as a multi-school platform using one subaccount per school.
- [ ] Ask Paystack to confirm onboarding/KYC obligations for the platform and each school.
- [ ] Ask Paystack to confirm settlement ownership, timing, holds, reserves, and refund/dispute liability.
- [ ] Ask Paystack to confirm the permitted platform commission model and processing-fee bearer behaviour.
- [ ] Ask Paystack to confirm DVA eligibility, identity-validation rules, naming, pricing, and account-limit expansion for the later project.
- [ ] Rotate the exposed test secret, store the replacement only in the environment, and
  never paste the replacement into chat or documentation.

## Product decisions requiring owner approval

The recommended values are shown so approval can be concise.

| Decision | Recommended first-release value | Approved value/status |
|---|---|---|
| Merchant model | Support `PLATFORM_MANAGED` school subaccounts and future `SCHOOL_OWNED` connections | Approved for flexible foundation |
| Initial currency | `NGN` only | Approved for foundation |
| Initial channels | `card`, `bank_transfer` | Approved as configurable defaults |
| Partial payment | Configurable per school, default disabled until the school chooses | Approved for foundation |
| Paystack fee policy | Configurable per school; default school/subaccount pays | Approved for foundation |
| Platform commission | Disabled/zero until commercial terms are approved | Approved for foundation |
| Refund authority | Request plus separate approval by authorized finance users | Pending |
| Unapplied money | Hold in review/suspense; never discard or over-allocate | Pending |
| Initial rollout | One approved pilot school | Pending |
| DVA | Deferred to Slice 9 | Pending |

## Deployment details requiring confirmation

| Item | Required value |
|---|---|
| Canonical application origin | `https://schoolpro.digisoft.com.ng` |
| Test callback URL | `https://schoolpro.digisoft.com.ng/payments/paystack/callback` or approved final route |
| Live callback URL | Same route on the live origin |
| Test webhook URL | `https://schoolpro.digisoft.com.ng/api/webhooks/paystack` |
| Live webhook URL | `https://schoolpro.digisoft.com.ng/api/webhooks/paystack`, configured in live settings later |
| cPanel cron capability | Confirm schedule frequency and protected command/URL mechanism |
| Outbound server IP | Confirm whether stable before enabling Paystack API IP restrictions |

The exact route paths may be finalized in Slice 1/2, but the canonical HTTPS origin must be
known before callback allowlisting or live dashboard configuration.

## Secret-handling requirement

After the variable names are added to example templates, actual values belong only in the
local/deployment secret environment:

```text
PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY
PAYSTACK_ENV
PAYSTACK_WEBHOOK_URL
```

- The secret key must never use the `NEXT_PUBLIC_` prefix.
- Test and live credentials must never be mixed.
- Secret values must never be committed, logged, placed in screenshots, or sent through chat.
- A rotation and previous-signature transition procedure must exist before live mode.

## Paystack support message

The account owner can send this concise request to Paystack:

> We operate DigiSchool-Pro, a multi-tenant school-management platform in Nigeria. We plan
> to receive parent school-fee payments through one platform integration and settle each
> school through its own Paystack subaccount. Please confirm whether this model is approved
> for our business category; the KYC required from the platform and each school; settlement,
> refund and dispute responsibility; allowed platform commissions; fee-bearer behaviour;
> and any reserves or limits. For a later phase, please also confirm Dedicated Virtual
> Account eligibility, customer/BVN validation requirements, account naming, current fees,
> and whether the default account limit can be raised for multiple schools.

## Gate to Slice 1

Test-mode engineering has a conditional pass because configuration is disabled by default
and no API calls are included in Slice 1. Full Slice 0/live readiness passes only when:

- the owner reconsiders and enables 2FA before live use, or records a formal live risk acceptance;
- the owner approves the first-release product decisions above;
- the canonical deployment origin is recorded;
- the exposed test secret is rotated and replacement credentials are safely available in the deployment environment;
- the Paystack questions have at least been formally submitted, with any uncertain
  commercial behaviour kept configurable and disabled by default;
- the responsible person and target date for live KYC approval are recorded.

Once those conditions are met, Slice 1 may add the provider-neutral schema, state machines,
unique constraints, allocation intent, durable event inbox, and shared idempotent ledger
service. Slice 1 must not embed an unconfirmed commission, fee, DVA, or settlement rule.

## Conditional-gate outcome

The owner authorized test-mode development without 2FA and requested a flexible school
setup. Slice 1 therefore proceeded without credentials or Paystack API calls. The resulting
model supports no gateway, a platform-managed school subaccount, and a future school-owned
connection. All configurations remain disabled by default. See
[paystack-slice-1-completion.md](./paystack-slice-1-completion.md).
