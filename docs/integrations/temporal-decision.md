# Temporal Integration Decision

Checked upstream docs on 2026-03-31:
- https://docs.temporal.io/develop/typescript
- https://docs.temporal.io/develop/typescript/core-application
- https://docs.temporal.io/develop/typescript/temporal-client
- https://docs.temporal.io/self-hosted-guide

## Required runtime(s)
- Temporal server/cluster (self-hosted or Temporal Cloud).
- TypeScript worker runtime for workflows/activities.
- Backend API runtime for workflow start/signaling.

## Docker service required?
- **Local dev**: recommended via Temporal dev server / docker compose stack.
- **Production**: managed cluster or self-hosted cluster.

## Required env vars
- `TEMPORAL_ENABLED` (default `false`)
- `TEMPORAL_ADDRESS` (e.g. `localhost:7233`)
- `TEMPORAL_NAMESPACE` (default `default`)
- `TEMPORAL_TASK_QUEUE` (e.g. `concept2cure-governed`)

## Expected local dev impact
- Optional additional infra service.
- Workflows can remain fallback/local when disabled.

## Expected production topology
- Temporal frontend/history/matching/worker services (or Temporal Cloud) + dedicated Concept2Cure workers.
- Activity workers interact with existing DB/services using idempotent contracts.

## Fit for this repo
- Start with narrowly scoped governed workflows (evidence ingestion + compile/export class).
- Keep Bull/cron for low-risk legacy tasks during parity period.
- Preserve existing job tables for audit/inspectability; add temporal transport behind feature flag.
