# MERGE BACK EXECUTION PLAN — Stage 8 Refresh (2026-04-01)

## Slice 1 — Proof-safe docs and tests

- **Exact files:**
  - `docs/integration/OUTSTANDING_INTEGRATION_QUEUE.md`
  - `docs/integration/MERGE_RISK_MAP_REFRESH.md`
  - `docs/integration/PR_DISPOSITION_PLAN.md`
  - `docs/integration/CURRENT_CANONICAL_STATE.md`
  - `docs/integration/MERGE_BACK_EXECUTION_PLAN.md`
  - `docs/proof/STAGE8_CONVERGENCE_DECISION_PACK.md`
  - `tests/e2e/beta-core-pulse.e2e.ts`
- **Preconditions:** none.
- **Tests:** lint/typecheck for test file; optional Playwright dry run.
- **Rollback:** revert doc/test commit.
- **Must land before human beta:** Yes.
- **Can wait until after RC:** No.

## Slice 2 — delete-safe and deprecation fence changes

- **Exact files:** only small, proven dead docs/scripts and fence labels (no runtime core).
- **Preconditions:** import graph + route-mount audit proof.
- **Tests:** route ownership smoke + build.
- **Rollback:** revert slice commit.
- **Must land before human beta:** Optional.
- **Can wait until after RC:** Yes.

## Slice 3 — shell truth changes

- **Exact files:** shell route wrappers and alias fences only (exclude protected organs unless unavoidable).
- **Preconditions:** no edits to protected files in this stage unless emergency fix approved.
- **Tests:** `client/src/__tests__/shellTruthRoutes.test.ts`, route policy smoke, workspace smoke.
- **Rollback:** immediate revert + restore prior route map.
- **Must land before human beta:** Yes if shell truth bug exists.
- **Can wait until after RC:** No for critical shell truth.

## Slice 4 — auth/db compatibility stabilization

- **Exact files:** `server/auth.ts`, `server/middleware/auth.ts`, `server/middleware/auth.js`, `server/middleware/authAdapter.ts`, `server/db.ts`, `server/db.js` (only minimal deltas).
- **Preconditions:** keep compatibility exports unchanged.
- **Tests:** auth/db smoke + invalid/expired JWT tests.
- **Rollback:** revert auth/db patchset.
- **Must land before human beta:** Yes.
- **Can wait until after RC:** No.

## Slice 5 — governed workspace subordinate extraction

- **Exact files:** governed route/service files (authoring/concept2cure write paths), excluding protected shell organs.
- **Preconditions:** demonstrate fail-closed behavior in regulated output paths.
- **Tests:** governed upload/export tests + document contract tests.
- **Rollback:** revert governed slice; disable impacted pathway with fail-closed maintenance flag if needed.
- **Must land before human beta:** Yes.
- **Can wait until after RC:** No.

## Slice 6 — browser pulse / beta path proof

- **Exact files:** `tests/e2e/beta-core-pulse.e2e.ts` and supporting fixtures only.
- **Preconditions:** canonical route aliases in place.
- **Tests:** playwright beta pulse + workspace smoke.
- **Rollback:** revert test slice (runtime unaffected).
- **Must land before human beta:** Yes.
- **Can wait until after RC:** No.

## Slice 7 — PR 334 targeted intake (if approved)

- **Exact files:** project conversation scope server files first; command/panel UI second.
- **Preconditions:** 335/333 safety slices landed and green.
- **Tests:** project mutation scope tests + shell truth + workspace smoke.
- **Rollback:** revert 334 slice only; retain previously landed fail-closed slices.
- **Must land before human beta:** Yes for scope safety; UI polish can wait.
- **Can wait until after RC:** command/panel UI subset can wait.

## Slice 8 — PR 335 targeted intake (if approved)

- **Exact files:** fail-closed fallback and tenant/org strictness files only.
- **Preconditions:** direct PR diff inspection available.
- **Tests:** chat route tests + tenant context enforcement checks.
- **Rollback:** revert 335 slice.
- **Must land before human beta:** Yes.
- **Can wait until after RC:** No.

## Slice 9 — PR 333 targeted intake (if approved)

- **Exact files:** governed upload/export fail-close enforcement only.
- **Preconditions:** verify no overlap regression with existing governed workspace flow.
- **Tests:** governed upload/export + artifact consequence tests.
- **Rollback:** revert 333 slice.
- **Must land before human beta:** Yes.
- **Can wait until after RC:** No.

## Slice 10 — PR 332 rescue slices only if explicitly proven safe

- **Exact files:** tiny rescue buckets only (docs/dev scripts/dead fixtures) with zero runtime path ownership.
- **Preconditions:** explicit rescue bucket proof pack; no protected-file impact.
- **Tests:** route mount audit + build + targeted smoke.
- **Rollback:** per-bucket revert.
- **Must land before human beta:** No.
- **Can wait until after RC:** Yes (recommended).

