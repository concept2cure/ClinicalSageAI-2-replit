# Route Prefix Authority Matrix (Phase B)

Date: 2026-04-01  
Branch: `cursor/customer-shaped-harness-build-5841`

Purpose: non-destructive authority map for duplicate route-prefix mounts in `server/index.ts` prior to any consolidation work.

Required review artifact linkage:
- Generated matrix used by CI merge-path gate: `docs/reports/route-ownership-matrix-latest.md`.
- Gate command: `npm run ci:route-ownership-matrix:check`.

## Findings summary

- This matrix is **evidence-only** and does not change runtime routing.
- `server/routes_fixed.ts` and `server/routes/index.ts` are now explicitly marked **deprecated/unmounted** to avoid accidental edits.
- Duplicate prefixes remain active by design in several places and require parity tests before consolidation.

## Prefix matrix

| Prefix | Mount points (server/index.ts) | Current risk | Suggested canonical authority (for future phase) |
|---|---|---|---|
| `/api/ai` | 965 (`aiRoutes`), 1031 (`aiAssistanceRoutes`), 3934 (`createAIClaimsRoutes`) | Order-sensitive overlaps possible | Keep separate only if path sets are disjoint and tested; otherwise merge under one router authority file |
| `/api/reports` | 2367 (`reportsGenerationRoutes`), 2368 (`reportsManifestRoutes`) | Medium (overlap potential) | Consolidate into one `reports` authority router with sub-routers |
| `/api/documents` | 1760 (`versionDiffRoutes`), 7158 (`documents-unified`), 7166 (`sourceLinks`), 7182 (`documentIntelligence`) | High (multi-authority prefix) | Keep one documents gateway router with explicit sub-route ownership table |
| `/api/projects` | 7057 (`projects-management`), 7119 (`moduleRoutes`) | Medium (different responsibilities) | Maintain dual mounts only with explicit non-overlap contract (`/` vs `/:id/modules`) |
| `/api/ind` | 3922 (`indGenerationRoutes`), 6996 (`indRoutes`) | Medium (route family drift risk) | Route generation endpoints under explicit `/api/ind/generate/*` and keep core under `/api/ind/*` |
| `/api/regulatory` | 3927 (`regulatory-registry`), 7240 (`regulatoryRoutes`) | High (`/search` appears in both) | Choose single `/search` authority and split alternate router to non-conflicting prefix |

## Deprecated/unmounted files (Phase B action)

| File | Runtime status | Action taken |
|---|---|---|
| `server/routes/index.ts` | Not mounted from `server/index.ts` | Added deprecation banner + no-console guidance |
| `server/routes_fixed.ts` | Not mounted from `server/index.ts` | Added deprecation banner + no-console guidance |

## Proof references

- `server/index.ts` mount evidence:
  - `/api/ai` (965, 1031, 3934)
  - `/api/reports` (2367, 2368)
  - `/api/documents` (1760, 7158, 7166, 7182)
  - `/api/projects` (7057, 7119)
  - `/api/ind` (3922, 6996)
  - `/api/regulatory` (3927, 7240)
- Duplicate `/search` handlers:
  - `server/routes/regulatory-registry.ts` line 91
  - `server/routes/regulatoryRoutes.ts` line 72

## Next-safe step (not done in this phase)

Before any prefix consolidation:

1. Build path-level overlap map for each duplicate prefix.
2. Add parity tests for top beta-critical calls (`/api/documents`, `/api/projects`, `/api/regulatory`).
3. Move to a single-authority router per concern only after green parity evidence.
