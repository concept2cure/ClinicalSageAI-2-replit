# Reasoning Tier Failure Modes and Fail-Closed Behavior

**Status:** Draft v1  
**Date:** 2026-03-27

---

## Failure Model

Reasoning Tier is optional and must never break core drafting/export workflows.

---

## Failure Modes

### FM-01 Service unavailable
- **Signal:** network timeout / connection failure.
- **Behavior:** return structured degraded response; do not create proposal automatically.
- **Fallback:** standard non-Reasoning Tier path.

### FM-02 Timeout exceeded
- **Signal:** runtime exceeds action-class budget.
- **Behavior:** `stop_reason=timeout`, `human_review_required=true`.
- **Fallback:** partial analysis discarded unless policy allows partial with warning.

### FM-03 Low evidence coverage
- **Signal:** evidence map under threshold.
- **Behavior:** mark unresolved; block artifact candidate promotion.
- **Fallback:** request additional evidence inputs.

### FM-04 Contradiction resolution failure
- **Signal:** critical contradictions found with no dominant recommendation.
- **Behavior:** force reviewer challenge flow; no auto-accept.

### FM-05 Schema contract violation
- **Signal:** malformed response payload.
- **Behavior:** reject response, log policy error, no downstream writeback.

### FM-06 Cost/latency circuit open
- **Signal:** budget exceedance or repeated degradation.
- **Behavior:** disable reasoning mode for affected action class until reset.

### FM-07 Policy denial
- **Signal:** action requested without required context/role/policy tags.
- **Behavior:** deny request; emit auditable denial record.

---

## Fail-Closed Policies

1. No valid evidence map -> no proposal.
2. No confidence band -> no proposal.
3. `human_review_required=true` -> no silent acceptance.
4. Critical contradictions unresolved -> block promotion.
5. Service degraded -> route continues without Reasoning Tier.

---

## Observability Requirements

- Request count by action class.
- Success/failure by stop reason.
- Timeout rate.
- Degraded fallback rate.
- Mean latency and p95/p99 per reasoning mode.
- Policy denials by reason.

---

## Incident Playbook (Minimal)

1. Detect anomaly via SLO breach.
2. Flip feature flag for affected action class.
3. Continue normal workflow on fallback path.
4. Capture failing traces + payload hashes.
5. Post-incident contract test before re-enable.

