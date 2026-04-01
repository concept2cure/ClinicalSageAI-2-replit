# Platform Full Audit — Efficiency, Architecture Sophistication, and Dead/Bloated Code

Date: 2026-04-01  
Branch audited: `cursor/customer-shaped-harness-build-5841`  
Method: full-repo doc + code audit with parallel subagent sweeps (backend, frontend, tests/CI, docs truth), plus automated file-size/duplicate-basename scans.

---

## Executive summary

You are right: there is substantial low-hanging fruit. The platform has strong core capabilities, but it also has:

1. **Duplicate authorities** (routes and providers) that reduce architectural professionalism.
2. **Large dead/stale surfaces** (unused files, duplicate JS/TS basenames, old route registries).
3. **Evidence debt** (CI gates and tests that appear strong but are partially warning-only or stale).
4. **Documentation contradictions** where reports lag behind current code.

Bottom line:
- **Core product capability exists.**
- **Operational polish and architecture coherence are incomplete.**
- The best next move is not broad rewrites; it is a staged cleanup program with proof gates.

---

## Audit trust policy used

- **Repo code > report docs** when contradictory.
- Risky-file reports are used as a **starting map**, not final truth.
- Each recommendation includes risk level and proof-first sequencing.

---

## Priority findings (ordered by severity)

## P0 — Critical architecture coherence issues

### 1) Duplicate `/api/projects` ownership with policy drift risk

There is an inline `app.get('/api/projects', ...)` in `server/index.ts` and a separate `/api/projects` router mount (`projects-management`) later.  
This creates split authority and order-dependent behavior.

Evidence:
- `server/index.ts` inline handler (`app.get('/api/projects', ...)`)
- `server/index.ts` later mount: `app.use('/api/projects', projectsRoutes...)`
- `server/routes/projects-management.ts` defines `router.get('/')`

Why this matters:
- One path can bypass checks implemented in the other.
- Hard to reason about tenancy/license constraints consistently.

Recommendation:
- Consolidate to one owner for `GET /api/projects`.
- Add a route-ownership truth table and regression tests before merging.

---

### 2) Duplicate `/api/regulatory` mounts with overlapping endpoints

Two different routers are mounted on `/api/regulatory`, and both define overlapping paths (`/search`).

Evidence:
- `server/index.ts` mount for `regulatory-registry`
- `server/index.ts` later mount for `regulatoryRoutes`

Why this matters:
- First-match routing can shadow behavior.
- “Fixes” can silently target the wrong handler.

Recommendation:
- Merge into a single canonical router or split prefixes (e.g., `/api/regulatory/registry` vs `/api/regulatory/intelligence`) with explicit ownership.

---

### 3) Monolithic server bootstrap (`server/index.ts`) still too dominant

`server/index.ts` remains a high-risk mega entrypoint with mixed concerns (mounting, inline handlers, runtime setup).

Evidence:
- `server/index.ts` line count from scan: ~7,886 lines.

Why this matters:
- Difficult to test mount order invariants.
- Increases change risk and review overhead.

Recommendation:
- Incremental extraction only (manifested route groups + invariant tests), not big-bang rewrite.

---

## P1 — High-value low-hanging cleanup opportunities

### 4) JS/TS duplicate basename explosion

Automated scan found **38 duplicate basenames** across `.ts/.js` or `.tsx/.jsx` pairs.

Examples:
- `client/src/main.jsx` + `client/src/main.tsx`
- `server/db.js` + `server/db.ts`
- `server/middleware/auth.js` + `server/middleware/auth.ts`
- `client/src/hooks/use-auth.jsx` + `client/src/hooks/use-auth.tsx`
- many duplicated UI primitives and hooks

Why this matters:
- Ambiguous canonical implementation.
- Drift and accidental stale imports.

Recommendation:
- Create a “canonical file map” and remove/deprecate alternates in controlled batches.

---

### 5) Frontend routing/provider split-brain (App vs ZenRouter)

Client shell has dual orchestration patterns:
- `App.jsx` with extensive route graph
- `ZenRouter.tsx` with Concept2Cure-specific routes

Also nested provider duplication risk surfaced (query/auth provider layering).

Why this matters:
- Hard to maintain one predictable app contract.
- Debug complexity for auth/session/routing issues.

Recommendation:
- Establish one canonical routing authority document.
- Remove duplicate provider wrapping where safe.

---

### 6) Dead/stale route registries likely still present

Audit evidence indicates legacy route registration files exist that are not clearly canonical (`server/routes.ts`, `server/routes/index.ts`, `server/routes.js`, etc.).

Why this matters:
- High confusion cost.
- Engineers can patch dead code accidentally.

Recommendation:
- Build a “mounted-in-runtime” list from `server/index.ts` and mark all non-mounted registries deprecated before deletion.

---

## P2 — CI/test integrity and confidence gaps

### 7) Lint/test gates include warning-only behavior

Evidence from workflows/scripts indicates some checks are non-blocking or bypassable by config/labels.

Why this matters:
- Green CI may overstate code health.

Recommendation:
- Tighten gates in phases:
  1. Track warning-only checks.
  2. Fail on newly introduced issues.
  3. Gradually enforce strict mode.

---

### 8) Integration test confidence mismatch

Some “integration” suites are environment-gated or structure-only checks and may not execute deep runtime paths consistently.

Recommendation:
- Separate test tiers explicitly:
  - Contract/static assertions
  - In-memory integration
  - Real DB integration
  - E2E/browser
- Report pass counts per tier in CI summary.

---

## P3 — Bloat hotspots with potential ROI

Top JS/TS files by line count (sample from automated scan):

- `client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx` (~26,554)
- `shared/schema.ts` (~18,198)
- `server/routes/concept2cure.ts` (~15,523)
- `client/src/pages/coauthor/CoAuthor.jsx` (~15,077)
- `server/index.ts` (~7,886)
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` (~5,081)
- `client/src/concept2cure/components/editor/EditorPanel.tsx` (~4,302)
- `client/src/concept2cure/ZenApp.tsx` (~4,247)
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` (~3,211)

Interpretation:
- These files are not automatically “bad,” but they are **high-risk change surfaces**.
- ROI is highest when extracting stable seams (adapters/config/lookup tables), not deep logic rewrites.

---

## Repo vs report disagreements (explicitly recorded)

Where docs and code disagree, trust repo and log correction:

1. Some historical reports claim CERV2/eSTAR governed export consequence is absent.
   - Current code and newer reconciliation docs indicate governed export consequence paths exist.
2. Phase completion reports conflict (e.g., “100% complete” vs “missing components”) while files now exist.
3. Some old UI/nav truth docs no longer match current shell/demotion behavior.

Action:
- Mark stale docs as superseded and maintain one current “truth reconciliation” doc per area.

---

## Recommended cleanup program (proof-first)

## Wave 1 (low risk, high confidence, immediate)

1. Canonical file map for duplicated basenames (TS/JS pairs) and remove obvious dead alternates.
2. Remove unreachable duplicate routes/providers where behavior is provably unchanged.
3. Add runtime route ownership matrix (path -> file -> owner).
4. Tighten CI to surface warning-only checks explicitly in PR summaries.

Success criteria:
- No behavior regressions on beta-critical smoke paths.
- Reduced duplicate file count from 38 by at least 25–40%.

## Wave 2 (medium risk, strong ROI)

1. Consolidate duplicate route authorities (`/api/projects`, `/api/regulatory`).
2. Extract `server/index.ts` mount groups into manifest modules with invariant tests.
3. Unify client router ownership and provider hierarchy.

Success criteria:
- One canonical authority per critical route family.
- Mount-order invariants tested.

## Wave 3 (higher risk, strategic)

1. Decompose largest monoliths with strict parity tests.
2. Normalize legacy JS-heavy client surfaces to TS where justified.
3. Update architecture docs to match final runtime truth.

---

## Candidate low-hanging deletions/quarantines (require proof checklist)

- `server/routes_update.ts` (if no import/runtime references)
- deprecated `client/src/hooks/use-auth.jsx` shim (if TS version is canonical)
- legacy alternate route registries not mounted in runtime
- duplicate `main.jsx` if `main.tsx` is confirmed sole entrypoint

Do not delete without:
- import graph check
- route mount confirmation
- test references check
- beta-critical smoke run

---

## Efficiency and sophistication scorecard (current state)

| Dimension | Score | Notes |
|---|---:|---|
| Runtime architecture coherence | 6/10 | Strong capability, duplicated authorities remain |
| Route authority clarity | 5/10 | Overlapping mounts and legacy registries |
| Frontend orchestration coherence | 6/10 | Good shell, mixed routing/provider ownership |
| CI confidence quality | 5/10 | Some gates warning-only or tier-misaligned |
| Dead/bloat management | 4/10 | Significant duplicate and large-file debt |
| Documentation trust alignment | 5/10 | Multiple stale/contradictory reports |

Overall: **5.2/10**  
Direction: clear path to 7+/10 with staged cleanup and proof gates.

---

## Recommended next action for you

Approve a **Wave 1 cleanup mandate** focused only on:
1) duplicate basenames,  
2) obvious dead files,  
3) route ownership matrix,  
4) CI warning-to-fail hygiene for new issues.

This gives immediate professionalism gains without destabilizing regulated flows.

