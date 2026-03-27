# HRM Service Boundary (Host-Layer Contract)

**Status:** Draft for implementation planning  
**Date:** 2026-03-27

---

## Purpose

Define how an HRM-class reasoning engine can be evaluated and optionally hosted **behind** a stable Reasoning Tier API, without coupling product runtime to research-stack dependencies.

---

## Boundary Rules

1. HRM runs in isolated service/container.
2. No direct writes from HRM service to Concept2Cure DB.
3. No direct artifact creation from HRM service.
4. All acceptance/persistence decisions occur in Node app governance layer.
5. Service returns typed structured output only.

---

## API Shape (Conceptual)

### POST `/v1/reasoning/run`

**Request**
- `task_id`
- `reasoning_mode` (e.g., `hrm_recursive`, `verifier_loop`, `heuristic_fallback`)
- `objective`
- `inputs`
- `constraints`
- `timeout_ms`
- `policy_tags`

**Response**
- `task_id`
- `reasoning_mode`
- `objective`
- `inputs_used`
- `claims`
- `contradictions_found`
- `unresolved_items`
- `evidence_map`
- `recommendation`
- `confidence_band`
- `stop_reason`
- `human_review_required`
- `artifact_candidate_payload`

---

## Prohibited Coupling

- Importing CUDA/FlashAttention dependencies into Node monolith.
- Calling product DB from HRM runtime.
- Returning unstructured freeform-only outputs for regulated actions.
- Auto-promoting HRM outputs directly to final artifacts.

---

## Compatibility Modes

1. **HRM mode** (if available/healthy).
2. **Recursive verifier loop mode** (lighter fallback).
3. **Heuristic policy mode** (degraded but deterministic fallback).

Selection happens at gateway/policy layer in Concept2Cure, not inside UI.

---

## Security Requirements

- Internal-only network ingress.
- Service-to-service auth (signed token / mTLS).
- Input size limits and schema validation.
- Output schema validation + reject on malformed payload.
- Request/response audit envelopes with trace IDs.

