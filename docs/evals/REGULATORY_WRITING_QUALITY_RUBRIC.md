# Regulatory Writing Quality Rubric (Reasoning Tier)

**Status:** Active rubric  
**Date:** 2026-03-27

Use this rubric to score life-sciences regulatory and medical-writing outputs generated or assisted by Reasoning Tier.

---

## 1) Factual and Source Integrity (0-5)

- 5: All material claims are source-grounded, with no unsupported statements.
- 3: Minor unsupported phrasing or weak traceability that does not alter decision risk.
- 1: Multiple unsupported claims or unverifiable assertions.
- 0: Critical factual errors or fabricated support.

## 2) Regulatory Conformance (0-5)

- 5: Output aligns with expected structure and constraints for intended submission context (e.g., 510(k), CER, eCTD module context).
- 3: Mostly aligned but requires moderate structural edits.
- 1: Significant deviations from regulatory writing expectations.
- 0: Non-conformant format unsuitable for review use.

## 3) Clinical Risk Framing and Safety Language (0-5)

- 5: Risks are specific, proportionate, and use calibrated language.
- 3: Risk framing present but occasionally vague or overconfident.
- 1: Understates or overstates risk in ways that could mislead review.
- 0: Unsafe risk framing or omitted critical safety caveats.

## 4) Medical-Writing Clarity and Traceability (0-5)

- 5: Clear narrative flow, concise sections, and explicit evidence traceability.
- 3: Readable but requires substantive editorial cleanup.
- 1: Fragmented narrative with weak traceability.
- 0: Unusable for regulated drafting workflows.

## 5) Change-Control Friendliness (0-5)

- 5: Proposed edits are reviewable, scoped, and easy to accept/reject with rationale.
- 3: Changes are mostly reviewable but need manual decomposition.
- 1: Diff quality hinders human review.
- 0: Changes cannot be reliably reviewed.

---

## Minimum Acceptability Thresholds

For GA-candidate runs, all thresholds must be met:

- Factual and Source Integrity: >= 4
- Regulatory Conformance: >= 4
- Clinical Risk Framing and Safety Language: >= 4
- Medical-Writing Clarity and Traceability: >= 4
- Change-Control Friendliness: >= 4

Any score <= 2 in any dimension is automatic run-level **fail** and requires corrective action before sign-off.

---

## Reviewer Evidence Requirements

Each scored run must include:

- Scenario ID and artifact ID(s)
- Cited source list used by reviewer
- Top 3 observed strengths
- Top 3 observed deficiencies
- Required remediation actions and owner

