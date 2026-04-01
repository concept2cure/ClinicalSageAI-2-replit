# 510(k) Backend Truth Pass

Date: 2026-04-01
Scope: beta-visible 510(k) hero path (`intake -> predicate -> equivalence -> compliance -> document editor -> vault -> export`).

## Endpoint inventory (hero path)

| UI step | Endpoint | Backing status | Persistence truth | Notes |
|---|---|---|---|---|
| Project hydration / stage resume | `GET /api/510k-project/:projectId/stage` | production-backed | database-backed | Mounted through `server/routes/510k-project.routes.ts`. |
| Predicate stage restore | `GET /api/510k-workflow/:projectId/stage-data?stage=predicate_search&section=predicates` | fallback-backed | mixed (db + local fallback) | Called during CERV2 boot for recovered predicate state. |
| Predicate stage save | `POST /api/510k-workflow/:projectId/stage-data` | fallback-backed | mixed (db + local fallback) | Persists selected predicate payload when available. |
| Project module linkage | `GET /api/projects/:projectId/modules` | production-backed | database-backed | Contract validated by module route tests. |
| 510(k) project create | `POST /api/510k-project/create` | production-backed | database-backed | Used by guided project creation path. |
| Document/vault rendering | `EnhancedDocumentVault` internal APIs | legacy/mixed | mixed | Existing vault path still supports local cache restore. |
| Export action | `handleSubmissionReady` + section export actions | fallback-backed | mixed | Full eSTAR generation intentionally disabled in beta; section export remains enabled. |

## Local fallback findings

1. CERV2 still contains explicit localStorage write-through cache and project fallback creation for offline/server-error scenarios.
2. These fallback branches are useful operationally but are now fenced from beta-visible navigation by the 510(k) beta allowlist.
3. Full eSTAR generation remains intentionally disabled and should remain non-claimable in beta collateral.

## Recommended next fixes

1. Replace fallback project creation with an explicit error state for beta mode to avoid local-only project confusion.
2. Move predicate/equivalence/compliance persistence into a single `/api/510k-project`-scoped contract to eliminate mixed persistence truth.
3. Add durable telemetry sink (DB/table or event bus) for beta issue capture route (`/api/telemetry/beta-workspace/*`).
