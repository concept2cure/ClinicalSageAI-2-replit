# Stage 8 — Merge Risk Map (`concept2cure-v2` vs `cursor/critical-files-management-f38a`)

## Evidence capture date
- 2026-04-01 (UTC)

## Exact compare attempt (live repo)
Commands executed in this working copy:

```bash
git rev-parse --verify concept2cure-v2
git rev-parse --verify cursor/critical-files-management-f38a
./scripts/integration/stage8_compare_map.sh
```

Result in this clone:
- `fatal: Needed a single revision` for both refs.
- Scripted compare output artifact: `docs/integration/COMPARE_COMMAND_OUTPUT.txt` → `ERROR: missing ref 'concept2cure-v2'`.
- No remote is configured (`git remote -v` returns empty), so direct branch diff (`git diff concept2cure-v2...cursor/critical-files-management-f38a`) is blocked in this environment.

- Compare automation validated by `tests/integration/stage8_compare_map.test.sh` in isolated git fixture.

## Fallback compare summary (from in-repo latest audits)
The latest tracked cross-branch audits in-repo state:
- `cursor/critical-files-management-f38a` is reported as **ahead 33 / behind 0**, touching about **50 files** relative to `concept2cure-v2`.
- It is explicitly called out as a high-priority unmerged branch.

Source evidence:
- `docs/reports/harness-feature-audit-and-next-steps-2026-04-01.md`
- `docs/reports/ANA_CORE_STRENGTHENING_AUDIT_2026-03-29.md`

## Risk-tiered file map (Stage 8 integration control)

> This tiering is based on **current live code surfaces** plus documented branch risk context. It is intended for controlled merge slicing, not blind bulk merge.

### Tier 1 — high blast radius (do not merge blindly)
- `client/src/App.jsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/router/ZenRouter.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `server/index.ts`
- `server/routes/concept2cure.ts`
- `server/routes/chat.ts`
- `server/auth.ts`
- `server/db.ts`
- `server/middleware/auth.ts`

Why Tier 1:
- Canonical routing + shell truth + governed workspace orchestration + auth/db contract surfaces.
- High coupling to beta-safe path and potential cross-branch drift.

### Tier 2 — medium risk (merge only with targeted tests first)
- `client/src/main.tsx`
- `client/src/main.jsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- `client/src/concept2cure/components/workspace/SectionRequirementsPanel.tsx`
- `client/src/concept2cure/auth/redirectUtils.ts`
- `client/src/concept2cure/router/projectModuleRoutePolicy.ts`
- `tests/concept2cure/project-module-route-policy.test.ts`
- `tests/computeRedirect.test.ts`
- `tests/e2e/workspace-smoke.e2e.ts`
- `server/db.js`
- `server/middleware/auth.js`
- `server/middleware/authAdapter.ts`
- `server/routes/index.ts`
- `server/__tests__/routes/smoke.test.ts`
- `server/__tests__/security/auth-hardening.test.ts`

Why Tier 2:
- Important compatibility and route-policy truth, but lower centrality than Tier 1 runtime cores.

### Tier 3 — low risk / likely merge-safe
- `docs/beta-work/stage-8-beta-release-candidate.md`
- `docs/beta-work/stage-8-demo-runbook.md`
- `docs/beta-work/stage-8-known-limits.md`
- `docs/integration/*` (this stage)
- `docs/proof/*` (this stage)
- `tests/e2e/beta-core-pulse.e2e.ts` (new Stage 8 pulse proof test)

Why Tier 3:
- Documentation and additive verification artifacts with no production runtime behavior changes.

## Files changed in both branches (explicit status)
- **Cannot be mechanically enumerated in this clone** because neither target branch ref exists locally.
- Enforced by scripted compare (`scripts/integration/stage8_compare_map.sh`) output captured in `docs/integration/COMPARE_COMMAND_OUTPUT.txt`.
- Latest in-repo branch-audit evidence indicates meaningful overlap risk exists on high-churn route/server surfaces and should be assumed until remote compare is run in a fully connected git environment.

## Files that must NOT be merged blindly
- `client/src/App.jsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `server/index.ts`
- `server/routes/concept2cure.ts`
- `server/routes/chat.ts`
- `server/auth.ts`
- `server/db.ts`
- `server/middleware/auth.ts`

## Integration recommendation
**Recommendation: transplant safe slices into a fresh branch.**

Rationale:
1. Direct rebase/merge confidence is reduced because branch refs are unavailable in this local clone.
2. Current risk concentration is in shell/auth/workspace/runtime cores.
3. Stage 8 priority is provable integration safety; therefore, land docs + pulse proof + low-risk test slices first, then perform remote conflict surgery for Tier 1/2 runtime surfaces.

Suggested execution pattern:
1. Land Slice A (docs + proof + pulse tests).
2. Rehydrate remote refs and run exact compare via `./scripts/integration/stage8_compare_map.sh concept2cure-v2 cursor/critical-files-management-f38a`.
3. Perform file-by-file conflict surgery for Tier 1 and Tier 2 slices with mandatory targeted tests.
