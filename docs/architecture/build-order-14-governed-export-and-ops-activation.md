# Build Order 14 — Governed Export & Ops Activation Architecture

## Export Guard Architecture

The CI export guard scans all governed POST routes to ensure every export endpoint
is registered in the governed route registry. The guard operates in two scopes:

1. **Governed POST routes**: every POST-based export endpoint must appear in the
   governed registry. Missing entries cause CI failure.
2. **Sample export routes (GET)**: these are exempt from the governed POST registry
   by design. Instead, the guard verifies each sample route is gated behind
   `isSampleExportEnabled`, which is disabled in production builds.

This two-tier approach prevents bypass: production exports are governed, and
dev-only sample exports cannot leak into production.

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
