# Medical Writing Red-Flag Patterns (Regulatory Affairs)

**Status:** Active control list  
**Date:** 2026-03-27

Use this list during human review and UAT to catch unsafe phrasing in regulated outputs.

---

## 1) High-Risk Overclaim Patterns (Must Avoid)

Examples that should trigger review defects unless explicitly evidenced and scoped:

- "proven safe and effective" (without explicit scope and source context)
- "no risk" / "risk-free"
- "guaranteed" clinical outcome language
- "definitively demonstrates" when evidence is preliminary
- "equivalent in all respects" without bounded criteria

## 2) Missing-Uncertainty Patterns (Must Correct)

- Omits confidence qualifiers for low/medium-quality evidence
- Hides contradictory evidence in narrative summary
- Uses absolute language where evidence is heterogeneous

## 3) Required Safety/Review Qualifiers

Include where applicable:

- "requires human regulatory review"
- "based on currently available evidence"
- "evidence limitations include ..."
- "final determination remains with qualified reviewer"

## 4) Citation and Traceability Red Flags

- claim appears without source anchor
- source is cited but does not support stated claim
- mixed claims are attributed to a single weak source

## 5) Escalation Rules

Any run with:
- >= 1 unremediated high-risk overclaim pattern, or
- >= 3 unresolved traceability red flags

is an automatic **run fail** pending remediation.
