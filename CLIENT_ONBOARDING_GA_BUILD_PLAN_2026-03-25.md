# Client Account + Plan/Model/Modules + Activation Onboarding (GA Build Plan)

**Date:** 2026-03-25  
**Scope:** End-to-end client lifecycle from signup to paid activation and first entry into AnA V1 RI.

---

## 1) Current-State Snapshot (What Exists Today)

## A. Account creation and org bootstrap
- Backend `/api/auth/signup` currently creates:
  - `organizations` row,
  - admin `users` row,
  - `organization_users` admin membership,
  - optional Stripe customer creation.
- This is a working org bootstrap path, but it is not a complete commercial onboarding flow.

## B. Company-level onboarding wizard (UI)
- There is a Portal V2 `OnboardingWizard` with steps for:
  1. Organization
  2. Business model
  3. Subscription
  4. Compliance
  5. Users
  6. Review
- It displays estimated monthly pricing from archetype pricing config.
- It attempts Stripe checkout redirect after completion.

## C. Billing + Stripe support
- Billing routes exist for checkout, pricing, status, portal, and webhooks.
- Stripe checkout supports Link and webhook event processing.

## D. License and module entitlements
- `license-manager` includes tier hierarchy and feature gate map.
- Module catalog + subscription rows are supported (`available_modules`, `module_subscriptions`).

## E. AnA org-level onboarding automation
- `ana-platform-controller` + `/api/ana/platform/onboard` can:
  - configure defaults,
  - create starter project,
  - auto-enable tier-based modules.

## F. CTD onboarding pipeline
- Separate CTD onboarding schema exists (`ctd_onboarding_projects`, `ctd_onboarding_documents`, `ctd_compliance_gaps`) for content ingestion/compliance gap analysis.

---

## 2) Critical Gaps vs Desired Flow

You asked for this lifecycle:
1. Create account
2. Select license plan + model + modules
3. See monthly total
4. Activate client
5. Run company-level wizard
6. Run user/role-level wizard
7. Enter AnA V1 RI

### Gap G1 — Tier enum mismatch across frontend/backend
- Portal V2 onboarding uses `SubscriptionTier` type values (`starter/professional/enterprise/...`) but wizard constants and checks still use uppercase IDs and `'free'` checks in places.
- Billing checkout route validates lower-case `'standard'|'professional'|'enterprise'` only.
- Result: inconsistent payload contract and potential checkout failure depending on path.

### Gap G2 — Onboarding wizard is not hard-wired to a reliable backend orchestration path
- `OnboardingWizard` expects `onComplete` callback, but route-level wiring currently mounts it directly.
- This creates risk that onboarding data is not atomically persisted/enforced before checkout.

### Gap G3 — No unified “plan + model + module + monthly total” quote engine
- Current wizard shows base pricing + per-user/storage notes, but no true finalized quote object.
- No explicit first-class “AI model selection” pricing stage tied to contract metadata.
- Module entitlements exist, but quote math is not centralized into one source-of-truth billing estimator.

### Gap G4 — Activation state machine is incomplete
- Stripe webhook processing updates billing state, but there is no explicit end-to-end activation workflow status machine that gates next steps:
  - `account_created`
  - `billing_pending`
  - `billing_active`
  - `company_onboarding_pending`
  - `user_role_onboarding_pending`
  - `ready_for_ana_ri`

### Gap G5 — User/role-level full setup wizard is fragmented
- Role/permission tooling exists (RBAC pages/components), but no single guided post-activation user/role setup wizard with completion criteria.

### Gap G6 — Entry control into AnA V1 RI is not tied to onboarding completion
- AnA modules and routes exist, but there is no strict onboarding completion gate before allowing full production use.

### Gap G7 — Frontend shell currently demotes some onboarding routes
- In Concept2Cure shell, onboarding pages are noted as demoted/redirected, which can conflict with required GA onboarding journey.

---

## 3) Target GA Process Map (Single Golden Path)

## Phase 0: Pre-account
1. Marketing/signup page captures: email, password, company legal name, industry mode.
2. Create provisional org + admin user.
3. Set lifecycle status = `account_created`.

## Phase 1: Commercial configuration (Quote)
4. Company selects:
   - license tier,
   - AI model pack (base/default + optional premium model add-ons),
   - module bundle (core + optional modules),
   - expected seat count and storage band.
5. Pricing service calculates **Quote v1**:
   - base plan,
   - model add-ons,
   - module add-ons,
   - seats,
   - storage,
   - discounts/annual term,
   - subtotal/tax/total monthly equivalent.
6. Quote is stored and versioned (`quote_id`, `version`, `currency`, `term`).
7. Lifecycle status = `billing_pending`.

## Phase 2: Payment + activation
8. Create Stripe checkout session using quote snapshot metadata.
9. User pays with Stripe/Link.
10. Webhook marks subscription active and writes immutable billing event.
11. Lifecycle status = `billing_active`.

## Phase 3: Company-level onboarding wizard
12. Guided company setup:
   - compliance defaults,
   - security defaults (MFA/session/password/IP allowlist),
   - data residency/retention,
   - default submission archetype,
   - organization-wide AI behavior defaults.
13. Trigger AnA org onboarding automation endpoint.
14. Lifecycle status = `company_onboarding_completed`.

## Phase 4: User/role-level onboarding wizard
15. Guided identity + access setup:
   - invite users,
   - assign role templates,
   - enforce SoD checks,
   - assign module access,
   - require training acknowledgements/e-sign policy acceptance.
16. Mark each user onboarding checklist completion.
17. Lifecycle status = `user_role_onboarding_completed`.

## Phase 5: Production entry to AnA V1 RI
18. Run readiness gate:
   - billing active,
   - company wizard complete,
   - admin user complete,
   - minimum role coverage achieved.
19. Unlock first-run AnA RI landing experience with guided first project creation.
20. Lifecycle status = `ready_for_ana_ri`.

---

## 4) Build Plan to Finish for GA

## Track A — Contract normalization (P0)
1. Normalize tier enums end-to-end:
   - frontend type + wizard constants + backend route validation.
2. Normalize module IDs and model pack IDs into canonical IDs.
3. Add one versioned pricing contract shared by UI + backend.

**Deliverable:** `pricing-contract.ts` + test fixtures + migration-safe mapping table.

## Track B — Quote engine + Stripe integration hardening (P0)
1. Build `QuoteService` server-side:
   - deterministic quote calculation,
   - auditable quote snapshots,
   - tax placeholder hooks.
2. Checkout must reference `quote_id` (not raw UI tier string).
3. Stripe webhook resolves quote -> activation state transition.

**Deliverable:** `/api/onboarding/quote`, `/api/onboarding/checkout`, activation transition handlers.

## Track C — Lifecycle state machine (P0)
1. Add `organization_lifecycle_state` table (or columns on organizations + history table).
2. Enforce legal transitions only.
3. Expose admin telemetry dashboard for stuck accounts.

**Deliverable:** state machine service + background reconciler + alerting.

## Track D — Company onboarding wizard orchestration (P1)
1. Replace callback-only completion with backend orchestration endpoint.
2. Persist all company settings transactionally.
3. Trigger `ana-platform/onboard` with idempotency key.

**Deliverable:** `/api/onboarding/company/complete` with audit logs.

## Track E — User/role onboarding wizard (P1)
1. Build dedicated wizard:
   - user invites,
   - role template assignment,
   - SoD validation,
   - module access matrix,
   - policy/training acknowledgement.
2. Add completion scoring and required minimums.

**Deliverable:** `/api/onboarding/users/*` endpoints + UI workflow + completion metrics.

## Track F — AnA V1 RI readiness gate (P1)
1. Build middleware/feature gate:
   - deny full access until lifecycle `ready_for_ana_ri`.
2. Add first-run launchpad into AnA RI with contextual checklist.

**Deliverable:** guard + launchpad + audit events.

## Track G — GA hardening and operability (P1/P2)
1. End-to-end tests:
   - signup -> quote -> checkout -> webhook -> onboarding -> RI entry.
2. Admin operations:
   - manual override tooling,
   - replay webhooks,
   - retry onboarding jobs.
3. Analytics:
   - time-to-activate,
   - onboarding drop-off by step,
   - module adoption rate.

**Deliverable:** runbooks, dashboards, SLOs.

---

## 5) Suggested Data Model Additions

- `org_onboarding_state`
  - `organization_id`, `state`, `updated_at`, `updated_by`, `reason`
- `org_onboarding_state_history`
  - immutable transition log
- `billing_quotes`
  - `quote_id`, `organization_id`, `version`, `line_items`, `total_monthly`, `term`, `currency`, `expires_at`
- `billing_quote_line_items`
  - plan/model/module/seat/storage granularity
- `onboarding_checklists`
  - per company + per user checklist item status
- `model_entitlements`
  - org-level and user-level model access (if differentiated)

---

## 6) GA Readiness Milestones

## Milestone M1 (2 weeks) — Commercial path deterministic
- Unified pricing contract complete.
- Quote API and checkout quote linkage complete.
- Tier/model/module payload compatibility fixed.

## Milestone M2 (2 weeks) — Activation and onboarding deterministic
- Lifecycle state machine live.
- Company wizard backend orchestration done.
- User/role wizard MVP complete.

## Milestone M3 (1–2 weeks) — Controlled RI launch
- Readiness gate + launchpad enabled.
- End-to-end tests green.
- Operations runbook + dashboards live.

---

## 7) Immediate Next 10 Engineering Tasks

1. Fix tier enum contract mismatch across portal + billing APIs.
2. Add backend `POST /api/onboarding/quote` and canonical quote schema.
3. Change checkout to accept `quote_id` only.
4. Add org lifecycle state table + transition service.
5. Wire Stripe webhook to lifecycle transition (`billing_pending` -> `billing_active`).
6. Refactor onboarding wizard completion to server-orchestrated endpoint.
7. Implement company onboarding completion idempotency and audit trail.
8. Build user/role onboarding wizard with SoD checks.
9. Add AnA RI readiness middleware + first-run launchpad page.
10. Add e2e happy-path test for first real client activation.

---

## 8) Decision Notes

- Stripe + Link remains payment rail (as requested).
- Neon DB remains auth/data backbone.
- Everything else (onboarding, entitlements, lifecycle, RI gating, automation orchestration) stays first-party in your stack.
- This plan preserves existing foundations (license manager, billing routes, AnA onboarding service, CTD onboarding schema) and closes orchestration + contract gaps for GA.
