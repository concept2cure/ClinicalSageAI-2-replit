# Project Module Route Contract (ZenRouter + ZenApp)

## Scope
- Project-scoped routes under: `/concept2cure/project/:projectId/...`
- Supported module routes: `510k`, `pma`
- Source of truth: `client/src/concept2cure/router/projectModuleRoutePolicy.ts`

## Route Shapes
- Exact:
  - `/concept2cure/project/:projectId/510k`
  - `/concept2cure/project/:projectId/pma`
- Nested:
  - `/concept2cure/project/:projectId/510k/:rest*`
  - `/concept2cure/project/:projectId/pma/:rest*`

## Embedded vs Standalone Policy
- Feature flag: `EMBED_MODULES_IN_SHELL`
- Policy resolver: `getProjectModuleRoutePolicy(path, embedModulesInShell)`
  - `shouldRenderInShell = moduleRoute && flagEnabled`
  - `shouldRenderStandalone = moduleRoute && !flagEnabled`

## Runtime Responsibilities
- `ZenRouter`
  - Keeps shell as route spine.
  - Registers standalone module routes only when `shouldEmbedModulesInShell === false`.
- `ZenApp`
  - Uses the same resolver to detect embedded module mode from current URL.
  - Reads `projectId`, `module`, and nested sub-path from the shared parsed route policy.
- Module bridges (`Project510kBridge`, `ProjectPMABridge`)
  - Resolve `projectId` via `parseProjectRoute(...)` instead of separate exact/nested assumptions.

## Auth Redirect Contract
- Unauthenticated protected route redirect:
  - `/concept2cure/login?returnTo=<encoded original path>`
- Builder helper: `buildLoginRedirectPath(currentPath)`
- Post-login redirect consumer:
  - `computeRedirect(...)` accepts `returnTo`, validates internal path, and restores route intent.

