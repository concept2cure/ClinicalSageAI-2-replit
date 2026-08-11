# Build Order 14 — Governed Export & Ops Activation Architecture

## Export Guard Architecture

The CI export guard scans all governed POST routes to ensure every export endpoint
is registered in the governed route registry. The guard operates in two scopes:

1. **Governed POST routes**: every POST-based export endpoint must appear in the
   governed registry. Missing entries cause CI failure.
2. **Sample export routes (GET)**: these no longer exist. The guard now asserts
   their **absence**.

The second tier used to read: sample routes are exempt from the governed
registry by design, and the guard verifies each is gated behind
`isSampleExportEnabled`, which is disabled in production builds. That was true
and it was not enough. `GET /api/cerv2/export/sample/:docType` and its `/docx`,
`/zip` and `/json` variants rendered downloadable documents from an in-memory
placeholder store (`server/services/mockVault.ts`). Being dev-gated was the
mitigation; not existing is the fix — a guard is one environment variable away
from being wrong, and an exported file outlives the process that made it.

Both the routes and `mockVault` are deleted, and
`scripts/ci/check-governed-export-routes.mjs` fails if a `router.get('/sample/`
reappears. Asserting absence is also strictly stronger than asserting a
guard was present: the old check only fired when it found sample routes, so it
would have passed by finding nothing.

Every route in this service that emits a document is now a governed POST behind
`authMiddleware` + `requireEditorAccess`, serving real authored content.

## Scheduled Maintenance

| Property | Value |
|----------|-------|
| Queue | Bull (Redis-backed) |
| Job type | `platform_maintenance` |
| Cron | `0 3 * * *` (3 AM daily) |
| Handler | `runPlatformMaintenance` |

The maintenance job performs:
- **Token cleanup**: expires stale JWT refresh tokens and orphaned sessions.
- **Bridge integrity**: validates cross-service data contracts remain consistent.
- **Metadata backfill**: fills missing computed fields on records created before schema changes.

Failures are logged with full context and retried per Bull's default retry policy.

## Readiness Modes

| Mode | Exit code on critical failure | Use case |
|------|-------------------------------|----------|
| `--warn-only` (default) | 0 (always) | Local dev, advisory checks |
| `--strict` | 1 | CI gates, pre-deploy validation |

Both modes run identical checks. The difference is exit behavior only.
Critical failures (DB unreachable, missing env vars, ungoverned routes) are always
reported. In strict mode they block the pipeline; in warn-only they print warnings.
