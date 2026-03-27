# Reasoning Tier UAT Evidence Template

**Status:** Active template  
**Date:** 2026-03-27

---

## 1) Run Header

- UAT cycle id:
- Run id:
- Date (UTC):
- Environment (staging/preprod):
- Build/version:
- Policy version:
- Operator:

---

## 2) Participant Metadata

- Participant role (Regulatory / Clinical / QA / Product Ops):
- Participant identifier (non-PII alias):
- Session length (minutes):
- Scenario id (UAT-01 to UAT-05):

---

## 3) Scenario Execution Record

- Task id:
- Inputs used:
- Expected behavior:
- Actual behavior:
- Stop reason (completed / blocked / degraded-mode fallback):
- Time-to-outcome (minutes):

---

## 4) Governance and Traceability Checks

Mark each as **Pass / Fail / N/A**.

- `artifact_id` present
- `artifact_version` present
- `artifact_status` present
- `provenance_ref` present and resolvable
- `audit_ref` present and resolvable
- `downloadable_output_ref` present for downloadable outputs
- consequence source type expected for scenario
- fail-closed behavior observed on forced fault path (where applicable)

---

## 5) Reviewer Quality Signals

- Contradictions found:
- Unresolved contradictions:
- Unsupported-claim count:
- Reviewer confidence (1-5):
- Recommendation clarity (1-5):
- Evidence traceability score (1-5):
- Free-text reviewer notes:

Regulatory-writing rubric scores (`docs/evals/REGULATORY_WRITING_QUALITY_RUBRIC.md`):
- Factual and Source Integrity (0-5):
- Regulatory Conformance (0-5):
- Clinical Risk Framing and Safety Language (0-5):
- Medical-Writing Clarity and Traceability (0-5):
- Change-Control Friendliness (0-5):

Red-flag phrase scan (`docs/evals/MEDICAL_WRITING_RED_FLAG_PATTERNS.md`):
- High-risk overclaim findings count:
- Missing-uncertainty findings count:
- Traceability red flags count:
- All critical findings remediated? (yes/no):

Terminology consistency check (`docs/evals/REGULATORY_TERMINOLOGY_GLOSSARY.md`):
- Terminology drift findings count:
- Scope/indication phrasing drift found? (yes/no):
- Edit policy compliance (`docs/release/REASONING_TIER_MEDICAL_WRITING_EDIT_POLICY.md`) verified? (yes/no):

---

## 6) Defects and Risks

- Defects opened (IDs):
- Severity mix (P0/P1/P2/P3):
- Risk accepted? (yes/no):
- Mitigation owner:
- Mitigation due date (UTC):

---

## 7) Run Disposition

- Run result: **Pass / Conditional Pass / Fail**
- Conditions (if conditional pass):
- Sign-off required from:
  - [ ] Regulatory lead
  - [ ] QA/compliance lead
  - [ ] Product ops lead
- Final comments:
- Regulatory Affairs recommendation (Approve / Conditional / Reject):

---

## 8) Attachments Checklist

- [ ] Prompt/inputs packet attached
- [ ] Raw system response attached
- [ ] Governance consequence payload attached
- [ ] Audit/provenance lookup evidence attached
- [ ] Defect tickets linked
- [ ] Recording/transcript reference attached (if available)

---

## 9) Storage Convention

Store finalized evidence under:

`docs/release/evidence/reasoning-tier-uat/<cycle-id>/<run-id>.md`

Use UTC date prefixes for deterministic ordering, e.g.:

`docs/release/evidence/reasoning-tier-uat/cycle-02/2026-04-11_uat-03_run-07.md`
