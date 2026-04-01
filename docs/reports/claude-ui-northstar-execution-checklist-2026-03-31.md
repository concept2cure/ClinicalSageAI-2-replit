# Concept2Cure v2 -> Claude North Star Execution Checklist

Date: 2026-03-31  
Source assessment: `docs/reports/claude-ui-northstar-gap-assessment-2026-03-31.md`  
Execution mode: incremental, reversible, no capability loss

---

## How to use this checklist

- Each batch is intentionally small and commit-safe.
- Run batches in order.
- Do not start a later batch until the previous batch validation passes.
- If a batch fails validation, stop and fix in-batch before moving on.

---

## Guardrails (non-negotiable)

1. Canonical shell remains `/concept2cure`.
2. Do not remove capability, only change visibility/prominence/wiring clarity.
3. Primary surfaces must be truthful:
   - Label -> route/mode -> observed behavior must match.
4. Use governed registry components when touching UI component composition:
   - `client/src/component-registry.ts`
5. Preserve chat-first and calm UI principles from:
   - `.claude/skills/claude-ui-design-principles.md`

---

## Batch 0 — Baseline freeze and route truth snapshot

### Goal
Capture baseline so every later change is diffable.

### Files to open
- `client/src/App.jsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/components/navigation/UnifiedTopNavV3.jsx`
- `tests/e2e/workspace-smoke.e2e.ts`

### Actions
- Record current primary route/mode map in stage evidence docs.
- Confirm Stage 7 pulse tests pass before further UI convergence changes.

### Validation
- `npx playwright test tests/e2e/workspace-smoke.e2e.ts --grep "PULSE-" --project=chromium`

### Commit
- `chore: snapshot north star baseline evidence`

---

## Batch 1 — Canonical shell exposure policy in App shell

### Goal
Reduce route-museum ambiguity and define primary vs secondary route exposure policy.

### Files to change
- `client/src/App.jsx`
- `docs/beta-work/stage-7-ui-beta-truth-audit.md`

### Actions
- Add explicit "primary beta path" comments around canonical routes:
  - `/`, `/concept2cure/login`, `/concept2cure`, `/concept2cure/*`
- Keep compatibility fences but mark as non-primary:
  - `/client-portal/*`, `/login`, `/sign-in`, `/auth`
- Mark module-heavy routes as secondary/deep-link in comments.
- Do not remove routes yet, only clarify intent and rank.

### Validation
- `npx vitest run --config vitest.config.ts client/src/__tests__/shellTruthRoutes.test.ts`
- `npx playwright test tests/e2e/workspace-smoke.e2e.ts --grep "PULSE-01|PULSE-03" --project=chromium`

### Commit
- `refactor: codify canonical shell exposure policy`

---

## Batch 2 — Navigation semantics contract (no fallback ambiguity)

### Goal
Eliminate primary-nav fallback behavior that obscures true destination intent.

### Files to change
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `docs/beta-work/stage-7-ui-beta-truth-audit.md`

### Actions
- Define canonical nav dictionary in `ZenApp.tsx` (single source for primary nav ids).
- Ensure all primary sidebar ids have explicit `SIDEBAR_NAV_TO_LAYOUT` entries.
- Remove dependence on `?? 'projects'` fallback for primary items.
- Keep fallback only for legacy/internal ids.
- Align sidebar labels to actual layout outcomes (already partly started in Stage 7).

### Validation
- `npx vitest run --config vitest.config.ts tests/stage6-governed-workspace-verifier.test.ts client/src/__tests__/shellTruthRoutes.test.ts`
- `npx playwright test tests/e2e/workspace-smoke.e2e.ts --grep "PULSE-04" --project=chromium`

### Commit
- `refactor: enforce explicit sidebar nav-to-layout contract`

---

## Batch 3 — Top-nav honesty and calm-surface reduction

### Goal
Bring top-nav behavior and tone closer to Claude-like calm and truthful utility.

### Files to change
- `client/src/components/navigation/UnifiedTopNavV3.jsx`
- optionally `client/src/components/navigation/UnifiedTopNav.jsx` (if still mounted on active surfaces)

### Actions
- Keep only truthful utility actions in top row:
  - back/forward, workspace home, settings, tenant/client controls.
- Keep "Ask RI" behavior if it triggers real assistant.
- Remove decorative/marketing-style emphasis in utility controls.
- Avoid promoting unmounted or ambiguous routes.
- Maintain calm visual hierarchy:
  - reduce gradients and high-contrast CTA competition in persistent chrome.

### Validation
- Manual smoke: navigate top-nav controls from a live authenticated session.
- `npx playwright test tests/e2e/workspace-smoke.e2e.ts --grep "PULSE-" --project=chromium`

### Commit
- `refactor: simplify top nav to truthful beta utility actions`

---

## Batch 4 — Module exposure matrix (prominence, not deletion)

### Goal
Keep all capabilities available while exposing only beta-safe pathways prominently.

### Files to change
- `docs/beta-work/stage-7-ui-beta-truth-audit.md`
- `docs/beta-work/stage-7-demo-click-path.md`
- `client/src/App.jsx` (comment-level exposure tags)
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` (if labels/order need refinement)

### Actions
- Classify major surfaces:
  - Expose (primary)
  - Expose with label
  - Hide from primary nav (still routable)
  - Internal only
- Ensure primary promoted set includes:
  - canonical shell
  - workspace editor/governed docs
  - AnA/intelligence
  - references/vault linkage
- Keep secondary modules discoverable via deep-link, not first-rank nav clutter.

### Validation
- Walk partner click path end-to-end and verify no route embarrassment.
- `npx playwright test tests/e2e/workspace-smoke.e2e.ts --grep "PULSE-" --project=chromium`

### Commit
- `docs: lock module exposure matrix and partner demo path`

---

## Batch 5 — Visual consistency hardening against governed primitives

### Goal
Close polish gap using existing governed components and state wrappers.

### Files to touch (as needed by surfaced drift)
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/components/navigation/UnifiedTopNavV3.jsx`
- Any directly mounted shell primitives

### Actions
- Replace ad-hoc controls with governed primitives where missing:
  - `Button`, `Badge`, `Input`, `Tooltip` patterns.
- Ensure state surfaces use `statesV2` patterns for loading/error/empty where applicable.
- Normalize typography and spacing to calm baseline.

### Validation
- `npx vitest run --config vitest.config.ts client/src/__tests__/shellTruthRoutes.test.ts tests/stage6-governed-workspace-verifier.test.ts`
- Focused visual/manual walkthrough of canonical shell only.

### Commit
- `refactor: align shell chrome to governed claude-style primitives`

---

## Batch 6 — Final partner path certification

### Goal
Produce founder-ready certification that the showcased path is coherent and honest.

### Files to update
- `docs/beta-work/stage-7-demo-click-path.md`
- `docs/beta-work/stage-7-ui-beta-truth-audit.md`

### Actions
- Re-run and capture final pulse outputs.
- Record commit chain clearly:
  - baseline
  - implementation
  - validation snapshot
- Summarize any residual risks explicitly.

### Validation
- `npx playwright test tests/e2e/workspace-smoke.e2e.ts --grep "PULSE-" --project=chromium`
- Optional: targeted workspace smoke subset for promoted surfaces only.

### Commit
- `docs: certify north star beta path validation snapshot`

---

## Practical command sequence (per batch)

1. Make changes.
2. Run targeted tests only (route truth + pulse checks).
3. `git add <batch files>`
4. `git commit -m "<batch message>"`
5. `git push -u origin cursor/critical-files-management-f38a`
6. Update PR.

---

## Success definition

You are at North Star convergence when all are true:

1. A new user has one obvious entry path and no ambiguous primary CTA.
2. Partner demo path is coherent end-to-end without route embarrassment.
3. Primary shell reads as calm, restrained, conversation-first.
4. Major capability remains available, but only beta-safe surfaces are prominently exposed.
5. Label -> route/mode -> behavior mismatches are eliminated in promoted navigation.

