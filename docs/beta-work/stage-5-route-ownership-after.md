# Stage 5 — Route Ownership After (Frontend Shell Truth)

Stage: Stage 5 — Frontend Shell Truth Cleanup  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `cb2e17de` (`cb2e17de`) (post-Stage-5 pre-test implementation snapshot)

## Before vs After ownership matrix

| Surface | Before Stage 5 | After Stage 5 | Classification after |
|---|---|---|---|
| Browser entrypoint | `client/index.html` -> `client/src/main.tsx` | unchanged | canonical |
| Root app shell | `client/src/App.jsx` | unchanged | canonical |
| Root `/` handling in `MainApp` | `Route path="/" -> ZenRouter` plus a second duplicate `Route path="/" -> Redirect('/concept2cure')` | duplicate root redirect route removed | canonical |
| Login aliases (`/sign-in`, `/auth`, `/login`) | outer `App` redirected aliases to `/concept2cure/login`; inner `MainApp` also routed `/login` and `/signup` to `ZenRouter` | unchanged behavior in this stage | compatibility (retained) |
| `/client-portal/*` handling in `App.jsx` | no explicit route ownership; relied on catch-all redirect | explicit fences added for `/client-portal` and `/client-portal/:rest*` to `/concept2cure` | compatibility fence |
| Catch-all handling | unmatched routes -> `/concept2cure` | unchanged | canonical |
| `main.jsx` | dormant bootstrap, fenced via Stage 2 comment | unchanged | dormant-candidate (tolerated) |
| `portal-v2/ClientPortalV2.tsx` route tree | rich `/client-portal/*` tree with no proven mount from `App.jsx` | unchanged implementation, now explicitly fenced by `App.jsx` route ownership | dormant-candidate (fenced from beta entry) |
| Nav "Client Portal" links | several nav surfaces sent users to `/client-portal` labels | top-level nav labels retargeted to `/concept2cure` in edited surfaces | canonical steering |
| Post-login role fallback | `computeRedirect` defaulted client roles to `/client-portal` | client roles now default to `/concept2cure` | canonical steering |

## Route ownership notes (after)

1. **Canonical beta browser path** remains:
   - `client/index.html` -> `client/src/main.tsx` -> `App.jsx` -> `ZenRouter` -> `ZenApp`.
2. **Canonical project shell path** remains:
   - `/concept2cure` and `/concept2cure/project/:projectId/*` through `ZenRouter` protected routes.
3. **Legacy portal path is now explicit compatibility behavior**:
   - `/client-portal/*` is intentionally redirected to `/concept2cure` in `App.jsx`.
4. **Duplicate shell truth reduced**:
   - removed unreachable duplicate root route in `App.jsx`.

## Legacy routes still tolerated in Stage 5

- `main.jsx` remains present as compatibility scaffolding (not loaded by browser entrypoint).
- Inner `MainApp` `/login` and `/signup` routes still exist in parallel with outer alias redirects; this was intentionally not deep-rewritten in Stage 5.
- `portal-v2` tree remains in repo but is no longer implied as a primary beta entry.

## Validation notes (route ownership after)

- Route ownership is now explicit for `/client-portal/*` in the live root shell.
- Top-level entry/navigation signals are aligned to Concept2Cure canonical shell in edited nav components.
- Tests updated/added to protect redirect and project-route policy semantics.

## Stage 5 targeted smoke checks (post-implementation)

- `npx vitest run --config vitest.config.ts client/src/concept2cure/router/__tests__/projectModuleRoutePolicy.smoke.test.ts client/src/__tests__/shellTruthRoutes.test.ts`
  - Result: **PASS** (2 files, 10 tests)
- `npx jest --config client/jest.config.js client/src/concept2cure/auth/__tests__/computeRedirect.test.ts`
  - Result: **PASS** (1 file, 9 tests)
