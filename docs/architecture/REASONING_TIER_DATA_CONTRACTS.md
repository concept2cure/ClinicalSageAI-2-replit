# Reasoning Tier Data Contracts

**Status:** Draft v1  
**Date:** 2026-03-27

---

## 1) Invocation Contract

### `ReasoningRunRequest`

```json
{
  "task_id": "string",
  "reasoning_mode": "hrm_recursive|verifier_loop|heuristic_fallback",
  "objective": "string",
  "action_class": "contradiction_scan|reviewer_challenge|evidence_reconciliation|strategy_memo|version_impact_review",
  "inputs": [{ "id": "string", "type": "artifact|section|evidence|diff", "content": "string" }],
  "constraints": {
    "max_depth": 4,
    "latency_budget_ms": 30000,
    "require_citations": true,
    "policy_tags": ["regulated", "high_stakes"]
  },
  "context": {
    "organization_id": "string",
    "project_id": "string",
    "conversation_id": "string",
    "user_id": "string"
  }
}
```

---

## 2) Result Contract

### `ReasoningRunResult`

```json
{
  "task_id": "string",
  "reasoning_mode": "string",
  "objective": "string",
  "inputs_used": ["input-id"],
  "claims": [{ "id": "c1", "text": "...", "status": "supported|contradicted|unresolved" }],
  "contradictions_found": [{ "id": "x1", "description": "...", "severity": "low|medium|high|critical" }],
  "unresolved_items": [{ "id": "u1", "question": "..." }],
  "evidence_map": [{ "claim_id": "c1", "source_ids": ["s1"], "strength": "weak|moderate|strong" }],
  "recommendation": { "summary": "...", "next_actions": ["..."] },
  "confidence_band": { "label": "low|medium|high", "score": 0.0 },
  "stop_reason": "completed|timeout|insufficient_evidence|policy_denied|service_unavailable",
  "human_review_required": true,
  "artifact_candidate_payload": { "format": "markdown", "content": "..." },
  "timing": { "started_at": "ISO", "completed_at": "ISO", "duration_ms": 1234 }
}
```

---

## 3) Policy/Compliance Envelope

All runs must attach:
- `trace_id`
- `policy_decision_id`
- `model_runtime_id`
- `prompt_hash` (if applicable)
- `input_hashes`

These fields are required for auditability and replay diagnostics.

---

## 4) Rejection Rules (Fail-Closed)

Reject result if any condition holds:
1. Missing `task_id` or `stop_reason`.
2. Missing `evidence_map` when `require_citations=true`.
3. `confidence_band` absent or malformed.
4. Unknown enum values in regulated action classes.
5. Payload exceeds size limits.

Rejected results must not create artifact proposals.

---

## 5) Proposal Conversion Contract

Only Conversation OS converts `ReasoningRunResult` -> `Proposal`.

Mandatory proposal metadata:
- reasoning run id
- evidence coverage score
- contradictions count by severity
- unresolved item count
- human review requirement
- known/inferred/missing partition

