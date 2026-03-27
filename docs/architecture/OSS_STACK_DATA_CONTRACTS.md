# OSS Stack Data Contracts

## Contracting rules
- Contracts are versioned and additive.
- Consumers must reject unknown breaking versions.
- All contracts carry correlation/provenance fields for audit linkage.

## 1) Normalized Document Contract (`normalized_document.v1`)

### Required fields
- `document_id`, `organization_id`, `project_id`
- `source_uri`, `source_hash`, `ingested_at`
- `parser`: `{ primary: string, fallback_used: boolean, parser_version: string }`
- `sections[]`: `section_id`, `heading_path[]`, `page_range`
- `elements[]`: typed nodes (`paragraph`, `table`, `figure`, `list`) with offsets
- `provenance`: parser run id, source fingerprint, extraction confidence map

### Invariants
- Section IDs are stable for the same source hash.
- Table extraction captures row/column structure if available.
- No downstream writeback permission implied.

## 2) Parser Arbitration Contract (`parser_arbitration.v1`)

### Required fields
- `decision_id`, `source_type`, `source_size_bytes`
- `selected_parser` (`docling` | `unstructured`)
- `fallback_trigger` (nullable enum)
- `quality_signals` (structure, table density, extraction confidence)
- `duration_ms`, `decision_at`

## 3) Evidence Recall Contract (`evidence_recall.v1`)

### Required fields
- `query_id`, `organization_id`, `project_id`, `artifact_scope`
- `retrieval_path` (`baseline_qdrant` | `pilot_byaldi`)
- `results[]`: `score`, `document_id`, `version_id`, `section_id`, `snippet`, `offsets`
- `citation_payload`: provenance ids + source hash + render-safe snippet metadata

### Invariants
- Every result must be citable back to a source/version/section.
- Pilot path outputs must be structurally equivalent to baseline output.

## 4) Policy Decision Contract (`policy_decision.v1`)

### Required fields
- `decision_id`, `policy_backend` (`in_app` | `opa`), `policy_version`
- `input_context` (org/project/user/action/resource)
- `effect` (`allow` | `deny` | `require_human_review`)
- `reasons[]`, `obligations[]`, `evaluated_at`

### Invariants
- Deny and require-human-review are terminal unless explicitly resolved by governed flow.
- Policy decisions must be trace-correlated.

## 5) Trace Event Schema (`trace_event.v1`)

### Required fields
- `trace_id`, `span_id`, `parent_span_id`
- `organization_id`, `project_id`, `user_id` (when applicable)
- `route`, `operation`, `outcome`, `latency_ms`
- optional links: `policy_decision_id`, `workflow_id`, `retrieval_query_id`

## 6) Long-Running Job Contract (`long_running_job.v1`)

### Required fields
- `job_id`, `job_type`, `workflow_backend` (`app` | `temporal`)
- `state`, `attempt`, `timeout_s`, `retry_policy`
- timestamps: `submitted_at`, `started_at`, `heartbeat_at`, `completed_at`

### Invariants
- Jobs must be cancellable unless explicitly marked non-cancellable with justification.
- Timeout is mandatory.

## 7) Sandbox Execution Contract (`sandbox_execution.v1`)

### Required fields
- `execution_id`, `sandbox_provider` (`e2b`), `sandbox_profile`
- `input_manifest`, `resource_limits`, `timeout_s`, `network_policy`
- `output_manifest`, `audit_log_ref`, `status`

### Invariants
- Sandbox output cannot directly mutate regulated artifact tables.
- Outputs must pass governed app writeback path and policy checks.
