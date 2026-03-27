# OSS Stack Golden Tasks (Regulated Domain)

## Purpose
Define non-toy, regulatory-domain tasks used to evaluate ingestion, retrieval, governance, workflow reliability, and observability before GA.

## Task families

### 1) Parsing quality
- Ingest FDA 510(k)-style PDF with mixed tables/figures.
- Ingest CER-style DOCX with nested section hierarchy.
- Validate section headings, table cell fidelity, and metadata capture.

### 2) Evidence retrieval quality
- Retrieve evidence for explicit regulatory claim queries using scoped project/artifact filters.
- Validate that returned snippets are citable by source hash + section/page offsets.

### 3) Policy enforcement correctness
- Attempt export without review approval in production-like mode (must fail closed).
- Attempt export with proper review approval + governance metadata (must pass).

### 4) Workflow durability
- Start long-running job, induce retry condition, then cancel and resume.
- Validate idempotency, timeout handling, and clear terminal state.

### 5) Observability completeness
- Validate ingestion/retrieval/policy/workflow traces emit required fields.
- Confirm policy decision IDs and workflow IDs are correlated in trace events.

### 6) Pilot controls
- Byaldi pilot compares lift vs Qdrant baseline; must meet benchmark gate.
- E2B pilot validates isolation, timeout bounds, and governed output routing.
