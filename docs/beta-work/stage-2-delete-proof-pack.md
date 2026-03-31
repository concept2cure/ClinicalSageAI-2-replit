# Stage 2 — Delete proof pack

Stage: Stage 2 — Proof-Driven Low-Risk Deletions and Deprecation Fence  
Branch / commit reviewed: `cursor/critical-files-management-f38a` (post-cut branch HEAD)  
Method: importer/mount/entrypoint proof from current code + Stage 1 ownership constraints

## Candidate classification table (required one row each)

| Candidate file | Classification | Proof of importer / mount status | Stage 2 action taken | Residual risk |
|---|---|---|---|---|
| `server/routes_update.ts` | **delete now** | `rg "routes_update"` returns docs only; no server/client/tests importers or mounts | **Deleted** | Low runtime risk; docs still may mention old file |
| `client/src/hooks/use-auth.jsx` | **delete now** | `rg "use-auth\\.jsx|hooks/use-auth"` returns docs only; no client runtime importers | **Deleted** | Low runtime risk; docs may still reference removed path |
| `client/src/main.jsx` | **deprecate only** | `client/index.html` loads `/src/main.tsx` (`client/index.html:45`); main.jsx not in live bootstrap path | **Kept + deprecation fence comment** | Duplicate entrypoint remains available for accidental reuse |
| `client/src/portal-v2/ClientPortalV2.tsx` | **protect for now** (fence) | Full `/client-portal/*` tree exists in file, but no explicit mount from `App.jsx` proven in Stage 1/2 | **Kept + deprecation fence comment** | High ambiguity risk until `/client-portal/*` ownership decision |
| `client/src/portal-v2/index.ts` | **deprecate only** | Barrel exists; no proven canonical root-shell usage for `@/portal-v2` package root imports | **Kept + deprecation fence comment** | Future imports may treat this as canonical unless ownership is resolved |
| `server/routes/index.ts` | **ambiguous / proof-required** | `mountApiRoutes` defined in this file; no proven use in `server/index.ts` live bootstrap path | **Kept + proof-required deprecation fence** | Dual-route-registry drift risk if reused without ownership decision |

## Stop-condition checks

| Stage 2 stop condition | Result |
|---|---|
| Delete only after importer/mount proof | **Pass** for deleted files |
| Do not touch protected organs | **Pass** (no protected file edits) |
| Stop if deleting requires protected-organ edits | **Pass** (none required) |
| Stop on fuzzy proof | **Pass with fence** for ambiguous files (not deleted) |

## Validation notes

- Attempted command: `npm run typecheck`
- Result: environment-level blocker (`tsc: not found`), so full TypeScript compile validation was not runnable in this agent environment.
- Mitigation used in this stage: explicit importer/mount/path verification with `rg` + direct file-read evidence captured in this proof pack and smoke notes.

## Protected files check (explicit)

No edits were made to:
- `client/src/App.jsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `server/index.ts`
- `server/auth.ts`
- `server/db.ts`
- `server/db.js`
- `server/middleware/auth.ts`
- `server/middleware/auth.js`
- `server/middleware/authAdapter.ts`

## Stage 2 decisions summary

- **Actual deletions:** `server/routes_update.ts`, `client/src/hooks/use-auth.jsx`
- **Fences/deprecations only:** `client/src/main.jsx`, `client/src/portal-v2/ClientPortalV2.tsx`, `client/src/portal-v2/index.ts`, `server/routes/index.ts`
- **No hide-only route rewiring performed** in Stage 2 to avoid protected-organ edits and avoid widening scope.
