# Stage 7 — UI-Only Beta Honesty Pass (Truth Audit)

Stage: Stage 7 — UI-Only Beta Honesty Pass  
Branch: `cursor/critical-files-management-f38a`  
Stage 7 implementation commit: `082ef07c` (`082ef07c`) baseline before this UI honesty cleanup  
Stage 7 UI honesty cleanup commit: `TBD`  
Branch / commit reviewed for archival evidence: `TBD`

## Mission

Make the visible UI stop lying by implication. Expose only beta-safe surfaces that map to real routes and real shell behavior.

## Scope reviewed

- `client/src/App.jsx`
- `client/src/components/navigation/UnifiedTopNavV3.jsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/router/ZenRouter.tsx`
- `client/src/concept2cure/ZenApp.tsx`
- `tests/e2e/workspace-smoke.e2e.ts` (Stage 7 pulse checks)

## Truth classification matrix (visible surfaces)

| Surface | Current user-visible label | Route/handler truth | Stage 7 decision |
|---|---|---|---|
| Root entry | `/` | Delegates to `ZenRouter` landing flow (`/concept2cure` or `/concept2cure/login`) | Expose |
| Login aliases | `/login`, `/sign-in`, `/auth` | Redirect to `/concept2cure/login` | Expose (compatibility) |
| Legacy client portal | `/client-portal`, `/client-portal/*` | Redirect fence to `/concept2cure` | Expose as fence only (no primary nav promotion) |
| Top nav “Switch Module” | `/dashboard` | No explicit route mount in `App.jsx`; falls through catch-all | Demote to canonical shell route |
| Top nav CSR row (dashboard/search/library/compare) | `/csr-intelligence`, `/csr/search`, `/csr-library`, `/csr/compare-list` | Not aligned with mounted CSR routes in `App.jsx` | Hide from primary nav |
| Sidebar “AI Assistants” | `onNavigate('apps')` | No explicit `apps` map in `SIDEBAR_NAV_TO_LAYOUT`; falls back to projects | Relabel to honest destination |
| Sidebar “Documents” (global) | `onNavigate('artifacts-center')` | No explicit `artifacts-center` map; falls back to projects | Relabel to honest destination |
| Sidebar “Setup” (global) | `onNavigate('setup')` | No explicit `setup` map; falls back to projects | Relabel to honest destination |
| Sidebar “Overview” (project tab) | `onNavigate('overview')` | No explicit `overview` map; falls back to projects | Relabel to honest destination |
| Sidebar workspace tools/editor/intelligence/review/vault/submit | mapped via `SIDEBAR_NAV_TO_LAYOUT` | Real shell navigation | Expose |

## Contradictions fixed in Stage 7

1. **Top-nav false promise:** “Switch Module” implied dedicated module switcher but pointed to an unmounted route.  
   - Fixed by relabeling and redirecting to canonical shell (`/concept2cure`).
2. **Top-nav dead-signage:** CSR mini-nav row linked to mismatched/non-mounted paths.  
   - Fixed by removing row from primary nav.
3. **Sidebar implication mismatch:** several labels implied destination-specific navigation but were mapped to fallback projects.  
   - Fixed by label honesty updates so click result matches user expectation.

## Runtime safety findings during Stage 7

- Found and fixed runtime crash in `ZenApp.tsx`: `ReferenceError: Cannot access 'projectArtifacts' before initialization`.
- Cause: usage in callbacks before declaration order (TDZ).
- Fix: move `projectArtifacts` query above first usage.

## Validation posture

- Stage 7 pulse suite (`tests/e2e/workspace-smoke.e2e.ts`, `PULSE-*`) is used for browser-level route heartbeat:
  - root entry
  - protected deep-link login redirect
  - `/client-portal/*` fence
  - authenticated project route into shell/workspace

This is a route-and-shell truth check, not full feature-depth E2E certification.

