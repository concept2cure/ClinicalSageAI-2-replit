# Temporal Integration Decision

## Upstream references checked
- TypeScript SDK docs: https://docs.temporal.io/develop/typescript
- TS SDK API reference: https://typescript.temporal.io/
- Self-host deployment reference (official compose repo): https://github.com/temporalio/docker-compose

## Required runtime(s)
- Temporal server cluster/runtime.
- Temporal worker process (Node/TypeScript) and client-side starter.

## Docker required?
- **Local dev:** optional but recommended for quick bootstrap.
- **Production:** dedicated Temporal deployment (self-hosted or managed cloud).

## Required env vars
- `OSS_WORKFLOW_TEMPORAL_ENABLED`
- `TEMPORAL_ADDRESS` (e.g. `localhost:7233`)
- `TEMPORAL_NAMESPACE`
- `TEMPORAL_TASK_QUEUE`

## Local dev impact
- Keep Bull and cron running for existing tasks.
- Start with narrow governed workflows only.

## Expected production topology
- Separate Temporal server + worker deployment with typed workflow/activity code.
- App/API acts as workflow starter and state observer.

## Fit for this repo
- Introduce a governed workflow spine boundary now; keep backward-compatible fallback while Temporal rollout is phased.
- First workflow target: evidence ingestion/enrichment and export/report compile path.
