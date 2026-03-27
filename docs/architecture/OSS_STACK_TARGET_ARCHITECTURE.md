# OSS Stack Target Architecture

## Architectural intent
Build a layered, governed architecture where parsing, retrieval, policy, workflow, and observability evolve independently behind explicit contracts.

## Plane model

### 1) Ingestion plane
- Primary parser: Docling.
- Fallback parser: Unstructured.
- Output: normalized document contract preserving section hierarchy, tables, metadata, and provenance.
- Boundary: no direct writes to regulated artifact tables.

### 2) Retrieval / evidence plane
- Baseline retrieval backbone: Qdrant (vector + metadata filters).
- Optional pilot: Byaldi multimodal late-interaction retrieval behind feature flag.
- Output: evidence payload with citation-ready provenance fields.
- Boundary: retrieval returns evidence; it does not mutate governed artifacts.

### 3) Governance / observability plane
- Policy decision target: OPA (incremental migration from current in-app policy evaluation).
- Telemetry spine: OpenTelemetry.
- LLM tracing/evals: Langfuse.
- Optional: SigNoz only if blind spots remain after OTel/Langfuse.

### 4) Workflow / compute plane
- Durable workflows: Temporal for resumable/cancellable long-running jobs.
- Optional isolated compute: E2B pilot for sandboxed transforms.
- Boundary: sandbox output returns through governed app-controlled writeback paths.

### 5) Eval / release plane
- Golden tasks, scorecards, and gate automation.
- Promotion only when measurable criteria are met.

## Why this architecture is safe for regulated operations
- Policy and export gates remain fail-closed.
- Experimental capabilities stay feature-flagged and benchmark-gated.
- Provenance and audit linkage are first-class payload requirements.
- Existing governed export consequence pathways remain authoritative until explicit migration sign-off.
