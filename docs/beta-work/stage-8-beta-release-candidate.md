# Stage 8 — Beta Release Candidate Pack

Date: 2026-04-01  
Branch reviewed: `cursor/customer-shaped-harness-build-5841`  
Base expectation: `concept2cure-v2` controlled-beta posture

---

## 1) Objective and scope

This pack finalizes Stage 8 for a **beta release candidate** by:

1. listing beta-safe modules/routes/journeys,
2. documenting known limits honestly,
3. recording rollback guidance for risky changes in stages 2-7,
4. providing a partner/demo runbook, and
5. issuing a founder-level go/no-go recommendation.

Out of scope: GA expansion, platform rewrites, net-new architecture.

---

## 2) Files opened for evidence

- `docs/reports/CONTROLLED_BETA_FREEZE_2026-03-27.md`
- `docs/reports/CONTROLLED_BETA_LAUNCH_READINESS_2026-03-27.md`
- `docs/reports/BETA_PROOF_PACKAGE_2026-03-27.md`
- `docs/reports/BETA_CANDIDATE_VALIDATION_2026-03-27.md`
- `docs/reports/server-routes-audit-2026-03-30.md`
- `docs/audits/repo-risk-pass-2026-03-26.md`
- `docs/proof/BETA_LAUNCH_LANE_PROOF.md`
- `docs/proof/GUIDED_DEMO_CHECKLIST.md`
- `docs/release/ANA_DOCUMENT_STACK_ROLLBACK.md`
- `client/src/concept2cure/router/ZenRouter.tsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `server/index.ts`
- targeted tests under `tests/` and `server/services/intelligence/__tests__/`

---

## 3) Beta-safe modules, routes, and journeys

### 3.1 Beta-safe modules (controlled scope)

| Surface | Stage 8 status | Evidence |
|---|---|---|
| Zen shell (6 global + project tabs) | Beta-safe with caveats | `CONTROLLED_BETA_FREEZE_2026-03-27.md` |
| Concept2Cure router + project module paths | Beta-safe | `client/src/concept2cure/router/ZenRouter.tsx` |
| Governed export + authoring workflow guardrails | Beta-safe (validated in smoke) | test results below |
| AnA RI core path | Beta-safe with one failing mock test | `npm run test:ana` output |
| RIM core module | Beta-safe (green smoke) | `rim.test.ts` output |

### 3.2 Route inventory (RC-relevant)

| Area | Route family |
|---|---|
| Core app | `/concept2cure`, `/concept2cure/project/:projectId`, `/concept2cure/project/:projectId/:rest*` |
| Auth/onboarding | `/concept2cure/login`, `/concept2cure/signup`, `/concept2cure/onboarding` |
| Public demo | `/concept2cure/demo` |
| Module paths | `/concept2cure/project/:projectId/(510k|pma|cer|ind|ectd|cmc)` |
| Core APIs | `/api/concept2cure`, `/api/ana-ri`, `/api/authoring`, `/api/chat`, `/api/documents`, `/api/reports` |

### 3.3 Founder-selected demo journeys (beta contract)

1. **Partner guided path (public):** `/concept2cure/demo` then guided CTA.
2. **Auth + tenant path (critical):** login and project context resolution.
3. **Governed workspace path (critical):** artifact/edit/lifecycle/export path.
4. **AnA path (critical):** RI health + orchestrator + gap analysis.
5. **Critical module path:** RIM signal/judgment test lane.

---

## 4) Validation executed (required smoke set)

### 4.1 Commands run

- `npm install` ✅
- `npm run typecheck` ❌ (repo-wide unrelated failures outside Stage 8 scope)
- `npm run smoke:e2e-assembly` ❌ (blocked: missing `TEST_DATABASE_URL`/`DATABASE_URL`)
- `npx vitest run tests/routes/governed-export-e2e.test.ts tests/resolution/e2e-authoring-workflow.test.ts` ✅
- `npm run test:ana` ❌ (1 failing test: mocked command executor import-fail scenario)
- `npx vitest run server/services/intelligence/__tests__/rim.test.ts` ✅
- `npx vitest run tests/guided-demo-path.test.ts` ❌ (5 stale/contract drift assertions)
- `npx vitest run tests/services/roleBasedAccess.test.ts tests/services/mfaService.test.ts` ❌ (mock/expectation failures)

### 4.2 Smoke gate result

- **Green:** governed workspace export/authoring tests, RIM tests.
- **Red:** auth/tenant smoke subset, guided demo contract assertions, one AnA health mock test.
- **Env-blocked:** full e2e assembly due to DB env variables.

Per Stage 8 stop conditions, this is **not** an unrestricted release state.

---

## 5) Low-risk Stage 8 implementation changes

One RC-safe coherence fix was applied:

- `client/src/concept2cure/ZenApp.tsx`
  - Added explicit sidebar nav mappings so these IDs no longer silently fall back to `projects`:
    - `apps -> apps`
    - `artifacts-center -> artifacts-center`
    - `setup -> setup`
    - `overview -> project-home`
    - `work -> documents`
    - `review-tab -> review`
    - `submit -> submissions`

Rationale: this is a thin, reversible correction improving navigation honesty for beta demos.

---

## 6) Known limits and hidden/deferred surfaces

See: `docs/beta-work/stage-8-known-limits.md`

Highlights:
- Vault capability representation differs across docs (browse-only vs data-room upload context).
- Demo narrative surfaces include paths now demoted in live shell.
- Some route audits report unmounted or fragile routes; not all are part of beta-safe path.
- Repo-wide typecheck is not currently a release gate pass.

---

## 7) Remaining protected organs and deferred post-beta refactors

Protected:
- `client/src/concept2cure/ZenApp.tsx` (no broad rewrite in Stage 8)
- `server/index.ts` mount order and bootstrap topology
- auth/tenant core, governed artifact/export/provenance/audit chains

Deferred:
- broad route consolidation cleanup,
- legacy/dead surface removals without proof,
- full type-system debt outside RC-critical path.

---

## 8) Rollback notes (stages 2-7)

See:
- `docs/reports/CONTROLLED_BETA_FREEZE_2026-03-27.md`
- `docs/release/ANA_DOCUMENT_STACK_ROLLBACK.md`

Stage 8 additive rollback for this branch:
- Revert commit containing `SIDEBAR_NAV_TO_LAYOUT` mapping additions in `ZenApp.tsx`.
- No schema/data migration introduced in Stage 8 pack.

---

## 9) Stage result and recommendation

### Result

Stage 8 documentation pack is complete; required docs created; targeted smoke run executed with explicit red/green outcomes.

### Recommendation

**internal beta only**

Reason:
- critical governed workspace and RIM lanes are green,
- but auth/tenant smoke subset, guided demo contract tests, and one AnA mock-failure test are red,
- plus full e2e assembly is env-blocked in this environment.

Do **not** unlock external guided beta until red checks are addressed or explicitly risk-accepted.

---

## 10) Founder summary template (completed)

Stage: Stage 8 — Beta Release Candidate Pack  
Branch / commit reviewed: `cursor/customer-shaped-harness-build-5841` / (see latest git log)  
Files opened for evidence: listed in section 2  
Files changed: 
- `client/src/concept2cure/ZenApp.tsx`
- `docs/beta-work/stage-8-beta-release-candidate.md`
- `docs/beta-work/stage-8-known-limits.md`
- `docs/beta-work/stage-8-demo-runbook.md`
Files deleted: none  
Files explicitly protected: `server/index.ts`, auth/tenant core, governed artifact/export authority  
Evidence docs created: all three Stage 8 docs above  
Tests/smoke checks run: listed in section 4  
Result: mixed (critical lanes green, several required smoke tests red)  
Open risks / contradictions: see `stage-8-known-limits.md`  
Recommendation: **internal beta only**  
Unlock next stage? **No**

