# Stage 7 — UI-Only Beta Honesty Pass (Truth Audit)

Stage: Stage 7 — UI-Only Beta Honesty Pass  
Branch: `cursor/critical-files-management-f38a`  
Stage 7 implementation baseline: `082ef07c` (`082ef07c`)  
Stage 7 cleanup chain: `185ab0fd` -> `d8046d56` -> `7e49bcac` -> `d097be99`  
Branch / commit reviewed for archival evidence (current): `d097be99`

## Wave A / Batch A1 follow-on (canonical shell exposure policy)

- Added explicit route-rank comments in `client/src/App.jsx`:
  - **primary beta path**: `/`, `/concept2cure/login`, `/concept2cure/signup`, `/concept2cure`, `/concept2cure/*`
  - **compatibility fences**: `/login`, `/signup`, `/sign-in`, `/auth`, `/client-portal/*`
  - **secondary/deep-link module surfaces**: all other mounted module routes
- This batch does not remove routes; it codifies route rank to prevent accidental primary-nav promotion of non-canonical surfaces.

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

## Wave A / Batch A2 follow-up (explicit nav contract hardening)

- Primary sidebar ids are now explicitly mapped in `SIDEBAR_NAV_TO_LAYOUT`:
  - `project-home`
  - `overview`
  - `apps`
  - `artifacts-center`
  - `setup`
  - `submit`
  - `work`
  - `review-tab`
- `ZenApp` sidebar handler no longer uses `?? 'projects'` for primary nav ids.
- Result: promoted sidebar labels now route deterministically instead of relying on fallback behavior.

## Wave A / Batch A3 follow-up (top-nav calm utility pass)

- Simplified `UnifiedTopNavV3` into truthful utility chrome:
  - retained: back/forward, canonical workspace home, settings/client/org controls, Ask RI action
  - removed/de-emphasized: decorative gradient-heavy CTA competition and dead-signage pressure
- Added compact utility button style aligned to calm shell language.
- Reduced top-nav visual noise without removing capability.

## Wave A / Batch A4 exposure matrix lock (this pass)

### Exposed (primary beta path)

- Canonical shell entry and auth:
  - `/`
  - `/concept2cure/login`
  - `/concept2cure/signup`
  - `/concept2cure`
  - `/concept2cure/*`
- Promoted workspace actions:
  - Sidebar workspace Editor / Intelligence / References / Review / Submit
  - Top utility: Open Workspace, Ask RI

### Exposed as compatibility fences (non-primary)

- `/login`, `/sign-in`, `/auth` -> `/concept2cure/login`
- `/client-portal`, `/client-portal/*` -> `/concept2cure`
- `/billing`, `/billing/*` -> `/concept2cure/billing`

### Secondary / deep-link module surfaces (routable, not first-rank CTA)

- Module-heavy routes mounted in `App.jsx` (CMC, CERV2 variants, admin surfaces, reports, tools, etc.)
- Kept available to avoid capability loss, but explicitly marked as secondary in shell comments and docs.

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

