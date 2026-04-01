# Stage 8 - Current Canonical State (Merge Reconciliation and Canonical Lock)

Date: 2026-04-01
Reviewer branch: `cursor/-bc-d266059a-12f4-4d65-af37-647370353b36-b1bb`
Compared workstream: `origin/cursor/critical-files-management-f38a`
Base branch: `origin/concept2cure-v2`

## 1) Code-grounded branch truth

The active review branch is currently in sync with base (`0 ahead / 0 behind` vs `origin/concept2cure-v2`), but the cleanup workstream branch targeted for reconciliation is materially diverged:

- `origin/concept2cure-v2...origin/cursor/critical-files-management-f38a`
- Ahead/behind: `60 33` (base has 60 unique commits, workstream has 33 unique commits)
- Changed files: 50 files
- Diff volume: `3723 insertions, 595 deletions`

This confirms the founder-level risk statement: integration drift is now the bottleneck, not discovery.

## 2) Required critical file drift check (base vs workstream)

The following files were explicitly opened/compared:

| File | Drift observed vs base | Risk |
|---|---|---|
| `client/src/App.jsx` | Route truth cleanup: canonical `/concept2cure/*` path emphasis, `/client-portal/*` fence redirect, nav item contraction, loading UI standardization. | High |
| `client/src/concept2cure/ZenApp.tsx` | Large shell mutation: project home cards/search/resume flow, thread/context propagation into AnA, sidebar nav mapping updates, project handoff behavior changes. | High |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | Large extraction: in-file `SectionRequirementsPanel` removed and imported from new file. | High |
| `server/index.ts` | No diff in this compare. | Medium (protected organ, but unchanged here) |
| `server/routes/auth.ts` | No diff in this compare. | Medium |
| `server/db.ts` | No diff in this compare. | Medium |
| `server/db.js` | Compatibility expansion: re-export canonical db helpers (`getDb`, `runMigrations`, `ensureAuthTables`, `transaction`, `healthCheck`) while preserving legacy import shapes. | High |
| `server/middleware/auth.ts` | No diff in this compare. | Medium |
| `server/middleware/auth.js` | Compatibility aliases added (`verifyJwt`, `hasPermission`) and export shape widened for older JS routes. | High |
| `server/routes/concept2cure.ts` | No diff in this compare. | High (protected organ, unchanged here) |

Additional high-impact drift also exists in:

- `server/routes/chat.ts` (thread ownership/project scoping and stricter thread listing behavior)
- `tests/e2e/workspace-smoke.e2e.ts` (new Stage 7 pulse tests and auth bootstrap path)
- `server/__tests__/routes/smoke.test.ts` (expanded backend contract assertions)

## 3) Complete changed-file ledger and classification

Classification statuses used in this stage:

- `merge-now`: can land directly with minimal reconciliation risk
- `re-review`: must be manually reconciled against base branch drift
- `defer`: keep in workstream for later stage, not required for Stage 8 landing slice
- `drop`: explicitly exclude from merge candidate
- `docs-only`: documentation evidence, not runtime source of truth

### 3.1 Ledger by file family

| File family | Files | Status | Why |
|---|---|---|---|
| Shell entry and canonical route surfaces | `client/src/App.jsx`, `client/src/concept2cure/ZenApp.tsx`, `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`, `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`, `client/src/concept2cure/components/workspace/SectionRequirementsPanel.tsx` | re-review | Core beta-path behavior and handoff semantics; high conflict and regression blast radius. |
| Secondary nav chrome | `client/src/components/common/NavigationBanner.jsx`, `client/src/components/navigation/UnifiedTopNav.jsx`, `client/src/components/navigation/UnifiedTopNavV3.jsx`, `client/src/components/navigation/UnifiedTopNavV4.jsx` | defer | Valuable polish but not merge-blocking for canonical Stage 8 lock. |
| Auth/redirect compatibility in client | `client/src/concept2cure/auth/redirectUtils.ts`, `client/src/concept2cure/auth/__tests__/computeRedirect.test.ts`, `client/src/main.jsx`, `client/src/portal-v2/ClientPortalV2.tsx`, `client/src/portal-v2/index.ts`, `client/src/utils/authToken.ts` | re-review | Compatibility fences are useful but can silently diverge auth assumptions. |
| Project data shaping | `client/src/concept2cure/hooks/useProjects.ts` | re-review | Affects shell/project list behavior and active-project continuity. |
| Test and pulse net | `tests/e2e/workspace-smoke.e2e.ts`, `tests/stage6-governed-workspace-verifier.test.ts`, `client/src/__tests__/shellTruthRoutes.test.ts`, `client/src/concept2cure/router/__tests__/projectModuleRoutePolicy.smoke.test.ts`, `server/__tests__/routes/smoke.test.ts`, `server/__tests__/security/auth-db-contract-smoke.test.ts`, `server/__tests__/security/auth-invalid-expired-jwt.test.ts` | merge-now | Protective evidence net; should move forward with Stage 8 and extend in Stage 9. |
| Backend compatibility and route behavior | `server/db.js`, `server/middleware/auth.js`, `server/routes/chat.ts`, `server/routes/index.ts`, `server/services/enhancedEmbeddingService.ts` | re-review | Auth/db/route compatibility and retrieval behavior changes require explicit ownership decisions. |
| Pure cleanup deletions and low-risk cleanup | `server/routes_update.ts` (deleted), `client/src/hooks/use-auth.jsx` (deleted), `tsconfig.json` | merge-now | Low-risk, evidence-backed cleanup wins. |
| Stage evidence docs | `docs/beta-work/stage-1-*.md` through `stage-7-*.md`, `docs/reports/claude-ui-northstar-execution-checklist-2026-03-31.md`, `docs/reports/claude-ui-northstar-gap-assessment-2026-03-31.md`, `docs/reports/clickthrough-seg3-projects.md` | docs-only | Useful audit trail; not runtime truth by themselves. |

### 3.2 Explicit statuses for all changed files

| File | Status |
|---|---|
| `client/src/App.jsx` | re-review |
| `client/src/__tests__/shellTruthRoutes.test.ts` | merge-now |
| `client/src/components/common/NavigationBanner.jsx` | defer |
| `client/src/components/navigation/UnifiedTopNav.jsx` | defer |
| `client/src/components/navigation/UnifiedTopNavV3.jsx` | defer |
| `client/src/components/navigation/UnifiedTopNavV4.jsx` | defer |
| `client/src/concept2cure/ZenApp.tsx` | re-review |
| `client/src/concept2cure/auth/__tests__/computeRedirect.test.ts` | re-review |
| `client/src/concept2cure/auth/redirectUtils.ts` | re-review |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | re-review |
| `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` | re-review |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | re-review |
| `client/src/concept2cure/components/workspace/SectionRequirementsPanel.tsx` | re-review |
| `client/src/concept2cure/hooks/useProjects.ts` | re-review |
| `client/src/concept2cure/router/__tests__/projectModuleRoutePolicy.smoke.test.ts` | merge-now |
| `client/src/hooks/use-auth.jsx` | merge-now |
| `client/src/main.jsx` | re-review |
| `client/src/portal-v2/ClientPortalV2.tsx` | re-review |
| `client/src/portal-v2/index.ts` | re-review |
| `client/src/utils/authToken.ts` | re-review |
| `docs/beta-work/stage-1-ownership-manifest.md` | docs-only |
| `docs/beta-work/stage-1-route-ownership-matrix.md` | docs-only |
| `docs/beta-work/stage-1-runtime-path-schematic.md` | docs-only |
| `docs/beta-work/stage-2-delete-proof-pack.md` | docs-only |
| `docs/beta-work/stage-2-post-cut-smoke-notes.md` | docs-only |
| `docs/beta-work/stage-3-auth-db-canonical-plan.md` | docs-only |
| `docs/beta-work/stage-3-request-contract-table.md` | docs-only |
| `docs/beta-work/stage-4-backend-route-manifest.md` | docs-only |
| `docs/beta-work/stage-4-beta-api-contract.md` | docs-only |
| `docs/beta-work/stage-5-frontend-shell-truth.md` | docs-only |
| `docs/beta-work/stage-5-route-ownership-after.md` | docs-only |
| `docs/beta-work/stage-6-governed-workspace-map.md` | docs-only |
| `docs/beta-work/stage-6-workspace-smoke-pack.md` | docs-only |
| `docs/beta-work/stage-7-demo-click-path.md` | docs-only |
| `docs/beta-work/stage-7-ui-beta-truth-audit.md` | docs-only |
| `docs/reports/claude-ui-northstar-execution-checklist-2026-03-31.md` | docs-only |
| `docs/reports/claude-ui-northstar-gap-assessment-2026-03-31.md` | docs-only |
| `docs/reports/clickthrough-seg3-projects.md` | docs-only |
| `server/__tests__/routes/smoke.test.ts` | merge-now |
| `server/__tests__/security/auth-db-contract-smoke.test.ts` | merge-now |
| `server/__tests__/security/auth-invalid-expired-jwt.test.ts` | merge-now |
| `server/db.js` | re-review |
| `server/middleware/auth.js` | re-review |
| `server/routes/chat.ts` | re-review |
| `server/routes/index.ts` | re-review |
| `server/routes_update.ts` | merge-now |
| `server/services/enhancedEmbeddingService.ts` | re-review |
| `tests/e2e/workspace-smoke.e2e.ts` | merge-now |
| `tests/stage6-governed-workspace-verifier.test.ts` | merge-now |
| `tsconfig.json` | merge-now |

No file family is currently classified as `drop` based on code evidence gathered in Stage 8.

## 4) Canonical lock decision (Stage 8 recommendation)

Preferred integration path: **fresh RC branch from `concept2cure-v2` plus selective cherry-pick of validated slices**, then manual reconcile of high-risk organs.

Why this is preferred:

1. The workstream is both ahead and behind, and high-risk files (`App.jsx`, `ZenApp.tsx`, `ProjectWorkspaceShell.tsx`, auth/db compatibility files) are active.
2. A blind branch merge imports stale drift and conflict noise as one blob.
3. Selective slice landing keeps auditability while preserving controlled blast radius.
4. This approach is consistent with stop conditions: no convenience-driven merge and no uncontrolled rewrite during classification.

Fallback strategy:

- Mixed strategy: merge `origin/concept2cure-v2` into cleanup workstream, resolve conflicts there, then merge back with strict gates.
- Use only if commit-level slice extraction is impractical.

## 5) Founder summary (Stage 8 gate)

- Stage: Stage 8 - Merge Reconciliation and Canonical State Lock
- Branch / commits reviewed: `origin/concept2cure-v2` vs `origin/cursor/critical-files-management-f38a` (`60 behind / 33 ahead` from base perspective)
- Files opened for evidence: all 50 changed files plus explicit critical file drift checks listed above
- Files classified: complete table included (merge-now / re-review / defer / docs-only)
- Protected organs locked: see `docs/beta-work/stage-8-protected-organs-lock.md`
- Evidence docs created: this file + merge-risk matrix + protected-organs lock
- Conflict risks found: high in shell core, workspace shell extraction, auth/db compatibility shims, chat route behavior
- Recommendation: **fresh RC branch with selective cherry-pick of validated slices; manual reconcile for high-risk organs**
- Unlock next stage? **Yes, for Stage 9 only after Stage 8 reconciliation plan is accepted**
