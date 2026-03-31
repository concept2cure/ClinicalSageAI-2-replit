# Stage 1 — Repo Truth Refresh and Canonical Ownership Map

Stage: Stage 1 — Repo Truth Refresh and Canonical Ownership Map  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `11dd2bbba54193f85d75eb55ada201967e7d75d0`  
Method: direct file review + importer/mount/path proof from current repo head only

## Files opened for evidence (Stage 1 scope)

- `client/index.html`
- `client/src/main.tsx`
- `client/src/main.jsx`
- `client/src/App.jsx`
- `client/src/concept2cure/router/ZenRouter.tsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/portal-v2/ClientPortalV2.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `server/index.ts`
- `server/auth.ts`
- `server/db.ts`
- `server/db.js`
- `server/middleware/auth.ts`
- `server/middleware/auth.js`
- `server/middleware/authAdapter.ts`
- `server/routes/concept2cure.ts`
- `server/routes/ana-ri.ts`

## Canonical ownership map (required statuses)

| Critical concern | Status | Current owner(s) | Evidence |
|---|---|---|---|
| Browser bootstrap path | **canonical** | `client/index.html` -> `client/src/main.tsx` | `client/index.html:45`; `client/src/main.tsx:15-24` |
| Secondary browser bootstrap (`main.jsx`) | **dormant-candidate** | `client/src/main.jsx` exists but not loaded by index html | `client/src/main.jsx:1-13`; no `main.jsx` ref in `client/index.html` |
| Live root app shell | **canonical** | `client/src/App.jsx` | Providers + routes in `client/src/App.jsx:941-964`, route switch `:367-929` |
| Concept2Cure shell router | **canonical** | `client/src/concept2cure/router/ZenRouter.tsx` | `/concept2cure*` routes in `ZenRouter.tsx:288-531` |
| Canonical in-product shell | **canonical** | `client/src/concept2cure/ZenApp.tsx` | Imported/rendered by ZenRouter protected routes; workspace branch at `ZenApp.tsx:2886-2958` |
| Governed workspace orchestrator | **canonical** | `ProjectWorkspaceShell.tsx` | Imported by ZenApp (`ZenApp.tsx:58`) and rendered (`ZenApp.tsx:2953`) |
| Portal-v2 route tree from main app | **dormant-candidate** | `client/src/portal-v2/ClientPortalV2.tsx` | Defines `/client-portal/*` routes (`ClientPortalV2.tsx:228-406`) but no mount route found in `App.jsx` |
| Backend startup control plane | **canonical** | `server/index.ts` | Startup + middleware + mounts (`server/index.ts:51`, `:522`, `:600-624`, `:3866`, `:3951`) |
| Global API auth gate | **canonical** | `server/auth.ts` via `authMiddleware` in `server/index.ts` | `server/index.ts:51`, `:600-624`; `server/auth.ts:54-119` |
| HTTP auth routes | **compatibility** | `server/routes/auth.ts` mounted from `server/index.ts` | mount at `server/index.ts:522` |
| Per-route auth middleware family | **compatibility** | `server/middleware/auth.ts`, `server/middleware/auth.js` | `auth.ts:64+`; `auth.js:18+`; widespread route imports (verified separately) |
| Auth adapter layer | **compatibility** | `server/middleware/authAdapter.ts` wrapping `./auth` | `authAdapter.ts:12-16`, `:22-48` |
| Canonical DB bootstrap | **canonical** | `server/db.ts` | `db.ts:100`, `:106`, `:153` |
| DB compatibility facade | **compatibility** | `server/db.js` (imports `./db.ts`) | `db.js:2`, exports `db.js:252` |
| Core product API routes | **canonical** | `server/routes/concept2cure.ts` and `server/routes/ana-ri.ts` mounted by `server/index.ts` | mounts `server/index.ts:3866`, `:3951`; route defs in `ana-ri.ts:187,1430,1474,1495,1537`; middleware chain in `concept2cure.ts:150-152` |
| Alternate API route aggregator (`server/routes/index.ts`) | **ambiguous** | `mountApiRoutes` exists but no proof of mount in `server/index.ts` | `server/routes/index.ts:91`; no usage found in `server/index.ts` |

## Required Stage 1 protected files (do not delete/rewrite yet)

These remain protected for Stage 1 and too risky to chop prior to parity proof:

1. `server/index.ts` — runtime order owner for middleware and route mounts.
2. `server/auth.ts` — global `/api` auth context shape owner.
3. `server/db.ts` — canonical DB pool/Drizzle/bootstrap owner.
4. `server/db.js` — compatibility bridge still imported by runtime/services.
5. `server/middleware/auth.ts` — per-route auth contract still in use.
6. `server/middleware/auth.js` — alternate per-route auth behavior still in use.
7. `server/middleware/authAdapter.ts` — compatibility wrapper proving unfinished consolidation.
8. `server/routes/concept2cure.ts` — core product workflow and governed artifact APIs.
9. `server/routes/ana-ri.ts` — core AnA RI APIs.
10. `client/src/App.jsx` — current root shell and route ownership nexus.
11. `client/src/concept2cure/router/ZenRouter.tsx` — canonical Concept2Cure route gateway.
12. `client/src/concept2cure/ZenApp.tsx` — canonical in-product shell.
13. `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` — governed workspace lifecycle owner.

## Candidate files for Stage 2 proof-driven removal (do not remove in Stage 1)

| File | Current status | Why candidate | Proof required in Stage 2 |
|---|---|---|---|
| `client/src/main.jsx` | dormant-candidate | Duplicate bootstrap not loaded by `index.html` | importer proof + boot parity note |
| `client/src/hooks/use-auth.jsx` | dormant-candidate | Deprecated empty export | importer proof (none in client src) |
| `server/routes_update.ts` | dormant-candidate | Snippet-like file, no runtime mount/import proof | importer proof + mount-path proof |
| `server/routes/index.ts` | ambiguous | Alternate route aggregator not wired from primary bootstrap | proof no secondary entry depends on it |
| `client/src/portal-v2/ClientPortalV2.tsx` | dormant-candidate | Rich `/client-portal/*` router appears unmounted from `App.jsx` | explicit route ownership decision for `/client-portal/*` |

## Contradictions vs prior risky-file report

### Aligned
- `main.tsx` is live bootstrap (`client/index.html:45`).
- `App.jsx` remains a large live route owner.
- `server/index.ts` remains backend control plane.
- `server/db.ts` remains canonical DB spine.
- Auth middleware fragmentation remains real.
- `ProjectWorkspaceShell` remains load-bearing via `ZenApp`.
- `concept2cure.ts` and `ana-ri.ts` remain core mounted APIs.

### Material refinements / contradictions
1. **`server/auth.ts` is not the only auth owner in practice.**  
   It is canonical for global auth gate, but `server/routes/auth.ts` owns HTTP auth endpoints and many routes still import `server/middleware/auth(.ts/.js)`.
2. **`client/src/main.jsx` is present but not live-wired.**  
   It should be treated as dormant-candidate rather than live dual-bootstrap in runtime behavior.
3. **`client/src/portal-v2/ClientPortalV2.tsx` route tree appears disconnected from `App.jsx` routing.**  
   `/client-portal/*` links exist broadly, but no explicit `App.jsx` route ownership for portal-v2 component was proven.

## Stage 1 stop-condition check

- Material contradictions found: **Yes** (auth ownership split and `/client-portal` route reality).
- Action taken in Stage 1: contradictions documented in this manifest; no protected file deletion or structural rewrite performed.
- Critical concern ownership unknown: **No** (all critical concerns classified; one remains explicitly **ambiguous**: `server/routes/index.ts` mounting relevance).

## Stage 1 gate recommendation

**Result:** Stage 1 ownership mapping is complete and evidence-backed at current HEAD.  
**Recommendation:** Unlock Stage 2 **with constraints**:
- start with proof-driven candidates only,
- do not touch protected files structurally until parity tests are in place,
- resolve `/client-portal/*` ownership decision before any portal tree removals.
