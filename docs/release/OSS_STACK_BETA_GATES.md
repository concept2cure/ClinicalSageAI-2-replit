# OSS Stack Beta Gates

## Beta entry criteria
1. Repo-truth reconciliation updated against current code surfaces.
2. All contracts (`*.v1`) implemented with conformance tests.
3. Feature flags exist for each OSS subsystem; default state is safe/off unless explicitly approved.
4. Rollback notes documented per subsystem.

## Beta readiness criteria by capability

### Ingestion
- Parser arbitration scorecard on regulated corpus (quality + failure-mode stats).
- Fallback behavior validated for parser failures and malformed inputs.

### Retrieval
- Qdrant baseline meets evidence recall thresholds.
- Citation payload/provenance integrity tests pass.

### Governance
- Policy path demonstrates fail-closed behavior on review/export/approval actions.
- No bypasses in protected routes.

### Workflow
- Retry/cancel/resume/timeout behaviors validated for long-running jobs.

### Observability
- OpenTelemetry spans emitted for core ingestion/retrieval/policy/workflow operations.
- Langfuse traces linked for LLM-assisted paths.

## Pilot-only gates
- **Byaldi**: remains pilot-only unless it improves retrieval metrics without governance regressions.
- **E2B**: remains pilot-only unless sandbox safety, timeout bounding, and output traceability pass.

## Hard blockers
- Any breakage of governed export consequence pathways.
- Any direct experimental write into regulated artifact tables.
- Missing rollback controls for newly enabled subsystem.
