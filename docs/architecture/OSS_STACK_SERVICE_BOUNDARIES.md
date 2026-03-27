# OSS Stack Service Boundaries

## Core principle
Each plane owns one job well and integrates through contracts. Ownership is explicit; no-go areas are explicit.

## A) Ingestion plane

### Owns
- Parser selection and arbitration (Docling primary, Unstructured fallback).
- Extraction normalization and chunk provenance construction.

### No-go
- No policy decisioning.
- No export/review approval decisions.
- No direct writes to core regulated artifact tables.

## B) Retrieval / evidence plane

### Owns
- Qdrant collection schema and retrieval query contract.
- Evidence recall payload format with citation provenance.
- Optional Byaldi pilot path routing under feature flag.

### No-go
- No document parsing.
- No policy gate overrides.
- No direct artifact governance persistence.

## C) Governance / observability plane

### Owns
- Policy decision contract and centralized policy evaluation flow (OPA target).
- OpenTelemetry trace event schema and instrumentation standards.
- Langfuse integration boundaries for LLM trace/eval visibility.

### No-go
- No scattering policy decisions into route-level ad hoc logic.
- No bypass around existing fail-closed export/review gates.

## D) Workflow / compute plane

### Owns
- Temporal workflow definitions and job state transitions.
- Retry/cancel/timeout semantics for long-running jobs.
- E2B sandbox execution boundary contracts (pilot only).

### No-go
- No default-path sandbox execution in critical drafting/export loops.
- No direct sandbox writes to regulated artifact tables.

## E) Eval / release plane

### Owns
- Golden-task sets, scoring rubric, and release blockers.
- Benchmark gates and rollback triggers.

### No-go
- No subjective “looks good” release decisions.

## Integration contracts required before merge
1. Normalized document schema
2. Parser arbitration contract
3. Evidence recall contract
4. Policy decision contract
5. Trace event schema
6. Long-running job contract
7. Sandbox execution contract
