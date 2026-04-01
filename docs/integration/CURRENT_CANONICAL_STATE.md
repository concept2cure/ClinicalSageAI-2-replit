# Stage 8 — Current Canonical State (Single Source of Truth)

This document is the Stage 8 canonical runtime map for the current live repository snapshot.

## 1) Canonical browser entry
- Primary browser entry at `/` redirects to `/concept2cure`.
- Main app shell is routed through `client/src/App.jsx` and then `client/src/concept2cure/router/ZenRouter.tsx` for Concept2Cure paths.

## 2) Canonical login/auth entry
- Canonical login route: `/concept2cure/login`.
- `computeRedirect` in `client/src/concept2cure/auth/redirectUtils.ts` is the redirect truth gate:
  - accepts only safe internal paths (`/`-prefixed, non-protocol-relative)
  - rejects external and suspicious whitespace redirects
  - defaults to `/concept2cure`
  - permits redirect targets only under `/concept2cure` and `/client-portal`
  - rejects traversal/backslash/control-character payloads
  - preserves query/hash for canonical in-app deep links
  - allows `/client-portal` default only for explicit `client_user` / `client_admin` roles.

## 3) Canonical project shell
- Canonical authenticated shell route family:
  - `/concept2cure`
  - `/concept2cure/project/:projectId`
- Shell orchestration center: `client/src/concept2cure/ZenApp.tsx`.
- Router authority for protected app pathing: `client/src/concept2cure/router/ZenRouter.tsx`.

## 4) Canonical governed workspace
- Canonical governed workspace surface: `ProjectWorkspaceShell`.
- File: `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`.
- Must preserve integrated create/open/edit/placement/provenance/review/audit/editor-handoff behavior without orchestration fracture.

## 5) Canonical AnA/chat surface
- Canonical persistent chat surface: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`.
- Chat API runtime anchors: `server/routes/chat.ts` and related orchestrator services.

## 6) Compatibility fences
- `/client-portal/*` remains a compatibility surface and must not become dead-route truth.
- Legacy API mount in `server/routes/index.ts` is explicitly deprecated and guarded behind `ENABLE_LEGACY_API_INDEX=true`.
- Auth middleware compatibility bridge remains present across:
  - `server/middleware/auth.ts`
  - `server/middleware/auth.js`
  - `server/middleware/authAdapter.ts`
- `server/auth.ts` bearer parsing is canonicalized via strict Bearer token extraction + finite numeric tenant parsing.

## 7) Tolerated dormant surfaces
- Dormant/legacy route surfaces in `App.jsx` can remain for compatibility, but are not primary beta promotion path.
- Deprecated route shim behaviors may remain if fail-safe and tested.

## 8) Demoted surfaces
- Legacy named worlds/modules commented as removed in router/shell comments are demoted and not the canonical beta lane.
- Legacy API aggregator (`server/routes/index.ts`) is demoted to compatibility-only status.

## 9) Beta-safe primary path
1. `/`
2. `/concept2cure/login`
3. `/concept2cure`
4. `/concept2cure/project/:projectId`
5. governed workspace visible and interactive

## 10) Secondary deep-link surfaces
- Supported project module deep-links under `/concept2cure/project/:projectId/:module/...` are governed by:
  - `client/src/concept2cure/router/projectModuleRoutePolicy.ts`
  - `client/src/concept2cure/router/ZenRouter.tsx`
- Current supported module keys: `510k`, `pma`, `cer`, `ind`, `ectd`, `cmc`.

## 11) Not-for-promotion surfaces
The following are explicitly not founder-demo primary path surfaces:
- dead-end or deprecated legacy portal routes
- deprecated route museums in `App.jsx` not covered by shell truth tests
- unproven deep links lacking pulse/browser proof

## 12) Canonical safety constraints (Stage 8)
Protected organs for this stage:
- `client/src/App.jsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `server/index.ts`

No deep rewrites are permitted in Stage 8 integration-lock scope.
