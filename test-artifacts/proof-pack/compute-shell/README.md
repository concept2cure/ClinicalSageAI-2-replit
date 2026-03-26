# Compute × Shell Proof Pack

## Non-visual runtime evidence (captured)

1. `server/__tests__/services/artifactComputeWorker.test.ts`
   - proves HTML sanitization,
   - proves blocked network attempt,
   - proves invalid output type rejection from isolated worker path.
2. `server/__tests__/services/computeService.integration.test.ts`
   - proves job -> output persistence -> governed artifact writeback metadata,
   - proves writeback failure handling updates failed job/attempt state.
3. Compute detail API payload contract now includes consequence fields:
   - runtime profile
   - runtime maturity
   - output format
   - artifact summary
   - placement state
   - provenance ref
   - audit ref
   - attempts + outputs

## Request/response-style payload fields to verify

- `GET /api/concept2cure/compute/projects/:projectId/jobs/:jobId`
  - `job_id`
  - `runtime_profile_key`
  - `runtime_maturity`
  - `output_format`
  - `artifact_id`
  - `artifact_title`
  - `artifact_status`
  - `artifact_version`
  - `placement_state`
  - `provenance_ref`
  - `audit_ref`
  - `attempts[]`
  - `outputs[]`

## Screenshot manifest

Browser screenshots were **not capturable** in this execution environment because the `browser_container` tool is unavailable.

Planned capture set:
- workspace-compute-panel.png
- compute-job-launched.png
- compute-job-completed.png
- governed-artifact-editor-open.png
- governed-artifact-provenance-audit.png
- shell-context-1366x768.png
- shell-context-1440x900.png

