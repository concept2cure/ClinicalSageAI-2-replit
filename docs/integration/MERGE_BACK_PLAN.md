# Stage 8 — Controlled Merge-Back Plan

## Strategy
Do not merge cleanup as one block. Use controlled slices with stop conditions and rollback points.

## Preflight gate (must pass before any slice)
1. Run `./scripts/integration/stage8_compare_map.sh concept2cure-v2 cursor/critical-files-management-f38a`.
2. If either ref is missing, stop merge-back promotion and fetch/rehydrate refs first.
3. Attach compare output artifact to release evidence.
4. Validate compare script behavior with `tests/integration/stage8_compare_map.test.sh` before using it as merge gate.

---

## Slice 1 — delete-safe / deprecation fence
### Files
- `server/routes/index.ts` (deprecation guard behavior only)
- route-fence comments/labels in low-risk docs and tests

### Why grouped
- Isolates compatibility fence and deprecation semantics from runtime behavior churn.

### Required tests
- `npx vitest run server/__tests__/routes/smoke.test.ts`

### Stop conditions
- Any route unexpectedly disappears from current public/protected contract.

### Rollback
- Revert this slice commit only; restore previous deprecation shim behavior.

---

## Slice 2 — auth/db compatibility stabilization
### Files
- `server/auth.ts`
- `server/db.ts`
- `server/db.js`
- `server/middleware/auth.ts`
- `server/middleware/auth.js`
- `server/middleware/authAdapter.ts`
- `server/__tests__/security/auth-hardening.test.ts`

### Why grouped
- Auth and DB compatibility are tightly coupled contract surfaces and should be promoted atomically with security tests.

### Required tests
- `npx vitest run server/__tests__/security/auth-hardening.test.ts`
- any local auth/db contract smoke available in CI matrix

### Stop conditions
- expired/invalid JWT behavior changes
- organization context isolation regression
- DB init/adapter mismatch

### Rollback
- Revert full slice as a unit; do not partial-roll back adapter without auth core.

---

## Slice 3 — shell-truth and redirect
### Files
- `client/src/concept2cure/auth/redirectUtils.ts`
- `client/src/concept2cure/router/projectModuleRoutePolicy.ts`
- `tests/computeRedirect.test.ts`
- `tests/concept2cure/project-module-route-policy.test.ts`

### Why grouped
- Redirect integrity and project-route policy represent one trust contract.

### Required tests
- `npx vitest run tests/computeRedirect.test.ts tests/concept2cure/project-module-route-policy.test.ts`

### Stop conditions
- login returnTo intent lost
- unsafe redirect acceptance
- project deep-link policy drift

### Rollback
- Revert slice and restore previous redirect parser/policy pair.

---

## Slice 4 — governed-workspace safe extraction
### Files
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- safe subordinate workspace units only (if separately modified and test-covered)
- `tests/e2e/workspace-smoke.e2e.ts`

### Why grouped
- Workspace orchestration is high-risk and must move in a dedicated guarded slice.

### Required tests
- `npx playwright test tests/e2e/workspace-smoke.e2e.ts`
- targeted workspace vitest/jest suite (if present)

### Stop conditions
- blank-state workspace rendering
- broken create/open/edit/placement or return flow
- provenance/review/audit entry regressions

### Rollback
- Revert full workspace slice; do not cherry-pick partial orchestration edits.

---

## Slice 5 — beta pulse / shell proof
### Files
- `tests/e2e/beta-core-pulse.e2e.ts`
- `docs/proof/BETA_CORE_PULSE_PROOF.md`

### Why grouped
- Adds browser-level proof without runtime blast radius.

### Required tests
- `npx playwright test tests/e2e/beta-core-pulse.e2e.ts`

### Stop conditions
- any core pulse case unstable on repeated runs
- route ambiguity between `/concept2cure` and `/client-portal/*`

### Rollback
- Revert proof slice only; no runtime impact.

---

## Slice 6 — UI honesty / nav semantics
### Files
- `client/src/concept2cure/router/ZenRouter.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- minimal `client/src/concept2cure/ZenApp.tsx` touch only where essential

### Why grouped
- Keeps shell semantics and user-visible route intent coherent.

### Required tests
- shell truth and route policy tests
- beta core pulse e2e
- manual click-through sanity on sidebar->workspace

### Stop conditions
- shell ambiguity increases
- CTA routes to dead/unmapped surfaces

### Rollback
- Revert entire nav semantics slice to preserve coherent shell truth.

---

## Slice 7 — docs and evidence
### Files
- `docs/beta-work/*`
- `docs/integration/MERGE_RISK_MAP.md`
- `docs/integration/CURRENT_CANONICAL_STATE.md`
- `docs/integration/MERGE_BACK_PLAN.md`

### Why grouped
- Non-runtime, founder/operator communication and control-tower evidence.

### Required tests
- `node --test tests/ops/stage8-ga-readiness.test.mjs`

### Stop conditions
- documentation contradicts runtime truth.

### Rollback
- Revert docs-only commits.

---

## Stage 8 land-now recommendation
Safe to land now:
- Slice 5 (beta pulse proof assets)
- Slice 7 (integration control docs)
- selected parts of Slice 3 only if tests pass cleanly

Defer for conflict surgery:
- Slice 2, Slice 4, Slice 6
- any deep runtime edits in `App.jsx`, `ZenApp.tsx`, `ProjectWorkspaceShell.tsx`, `server/index.ts`
