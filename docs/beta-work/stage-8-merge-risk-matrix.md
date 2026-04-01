# Stage 8 - Merge Risk Matrix

Date: 2026-04-01
Base: `origin/concept2cure-v2`
Workstream: `origin/cursor/critical-files-management-f38a`
Comparison result: `60 33` (`base...workstream`)

## Purpose

This matrix covers Stage 8 merge-risk decisions for the highest-impact files, with explicit risk, ownership, and recommended merge method.

Legend:

- Risk: Low / Medium / High
- Method: `direct-merge`, `manual-reconcile`, `rc-cherry-pick`

## A-class product truth files (must be explicit)

| File | Diff signal | Conflict risk | Owner | Recommended method | Notes |
|---|---:|---|---|---|---|
| `client/src/App.jsx` | 24 insertions / 38 deletions | High | Frontend shell | manual-reconcile | Route truth and compatibility fences changed (`/client-portal/*`, root, auth path handling). |
| `client/src/concept2cure/ZenApp.tsx` | 306 insertions / 97 deletions | High | Frontend shell | manual-reconcile | Core shell/handoff/thread/context behavior changed; large blast radius. |
| `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` | 157 insertions / 66 deletions | High | Frontend shell | manual-reconcile | Primary nav semantics changed ("Workspace Home", "Documents", "Intelligence"). |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | 62 insertions / 31 deletions | High | AnA UI | manual-reconcile | Thread hydration/resume and parent thread sync added. |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | 1 insertion / 203 deletions | High | Workspace shell | manual-reconcile | Section requirements panel extracted out of monolith. |
| `client/src/concept2cure/components/workspace/SectionRequirementsPanel.tsx` | New file (+204) | High | Workspace shell | rc-cherry-pick | Must land atomically with `ProjectWorkspaceShell.tsx` extraction. |

## B-class test and proof net files (required for protected landing)

| File | Diff signal | Conflict risk | Owner | Recommended method | Notes |
|---|---:|---|---|---|---|
| `tests/e2e/workspace-smoke.e2e.ts` | +126 | Medium | QA/E2E | rc-cherry-pick | Adds Stage 7 pulse checks, root/login/fence/project-route heartbeat. |
| `client/src/__tests__/shellTruthRoutes.test.ts` | New file (+43) | Low | Frontend QA | rc-cherry-pick | Route truth tripwire. |
| `client/src/concept2cure/router/__tests__/projectModuleRoutePolicy.smoke.test.ts` | New file (+46) | Low | Frontend QA | rc-cherry-pick | Module route policy guardrails. |
| `tests/stage6-governed-workspace-verifier.test.ts` | New file (+108) | Low | Workspace QA | rc-cherry-pick | Governing workspace structure proof. |
| `server/__tests__/routes/smoke.test.ts` | +129 | Medium | Backend QA | rc-cherry-pick | Mount contract assertions and endpoint behavior smoke. |
| `server/__tests__/security/auth-db-contract-smoke.test.ts` | New file (+170) | Medium | Security QA | rc-cherry-pick | Auth/db compatibility contract proof. |
| `server/__tests__/security/auth-invalid-expired-jwt.test.ts` | New file (+85) | Low | Security QA | rc-cherry-pick | Token rejection regression guard. |

## C-class compatibility and infrastructure shims

| File | Diff signal | Conflict risk | Owner | Recommended method | Notes |
|---|---:|---|---|---|---|
| `server/db.js` | 24 insertions / 4 deletions | High | Backend platform | manual-reconcile | Export-shape compatibility wrapper widened. |
| `server/middleware/auth.js` | +33 | High | Backend auth | manual-reconcile | Adds alias exports (`verifyJwt`, `hasPermission`) for legacy callers. |
| `server/routes/index.ts` | +6 | Medium | Backend platform | direct-merge | Adds explicit "not canonical mount owner" fence comment. |
| `client/src/main.jsx` | +8 | Medium | Frontend platform | direct-merge | Stage 2 fence comment for deprecated entrypoint. |
| `client/src/portal-v2/ClientPortalV2.tsx` | +5 | Medium | Frontend platform | re-review in RC | Compatibility behavior needs checked against current base UX. |
| `client/src/portal-v2/index.ts` | +7 | Medium | Frontend platform | re-review in RC | Route/export compatibility shim change. |
| `client/src/utils/authToken.ts` | +33 | Medium | Frontend auth | manual-reconcile | Token handling impacts auth continuity assumptions. |
| `server/routes/chat.ts` | 31 insertions / 6 deletions | High | Backend chat/AnA | manual-reconcile | Thread ownership/project scoping/listing semantics changed. |

## D-class cleanup wins

| File | Diff signal | Conflict risk | Owner | Recommended method | Notes |
|---|---:|---|---|---|---|
| `server/routes_update.ts` | deleted (-5) | Low | Backend platform | direct-merge | Dead duplicate route aggregator removal. |
| `client/src/hooks/use-auth.jsx` | deleted (-4) | Low | Frontend platform | direct-merge | Legacy unused hook removal. |
| `tsconfig.json` | 1 deletion | Low | Platform | direct-merge | Minor cleanup; low runtime risk. |

## E-class docs and stage evidence

| File family | Conflict risk | Owner | Recommended method | Notes |
|---|---|---|---|---|
| `docs/beta-work/stage-1-*.md` through `stage-7-*.md` | Low | Product ops | direct-merge | Keep as evidence pack but not runtime source of truth. |
| `docs/reports/claude-ui-northstar-*.md` | Low | Product ops | direct-merge | Historical evidence; retain. |
| `docs/reports/clickthrough-seg3-projects.md` | Low | Product ops | direct-merge | Journey evidence update. |

## F-class re-review set caused by behind-base drift

These are the required "open both sides and reconcile" files from Stage 8:

- `client/src/App.jsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- `server/db.js`
- `server/middleware/auth.js`
- `server/routes/chat.ts`
- `client/src/utils/authToken.ts`

## Stage 8 preferred merge method

Preferred: `rc-cherry-pick` for test net and low-risk cleanup, plus `manual-reconcile` for protected high-risk organs.

Why:

1. Workstream has meaningful ahead and behind divergence.
2. A full blind merge bundles high-risk shell/auth compatibility shifts into one opaque conflict set.
3. Slice-based landing keeps merge blast radius bounded and testable.
