# Biostats SAP Capability Gap Assessment (AnA)

_Date: 2026-03-25_

## SME Needs vs Current Delivery

| SME Need | Prior Delivery | Gap | Closure Implemented |
|---|---|---|---|
| Rapid-start SAP templates for common regulatory scenarios | Manual field-by-field setup | High setup friction and inconsistent assumptions | Added one-click SME templates for Phase III efficacy, Device NI, and IVD accuracy with regulator-grade defaults |
| Explicit SAP strategy controls (multiplicity, estimand, missing data, comparator) | Mostly implicit / backend-only support | Critical SAP assumptions not easily controlled from UI | Added dedicated SAP Strategy Controls panel and wired fields to workflow payload |
| Global regulator coverage for statistical framing | FDA/EMA/MHRA/PMDA only in panel | Missing visible support for NMPA/TGA/Health Canada | Added expanded regulator options to panel |
| Deterministic full-SAP document package generation | Multi-doc generation available but with ambiguous full-mode behavior | Confusing switch states and partial-failure ambiguity | Added deterministic SAP document set constant, full-mode lock semantics, and fail-fast messaging |
| Project-context governance controls | Present | Minor UX ambiguity | Retained and grouped project binding / dossier attach / review controls in activation block |

## Resulting Coverage

AnA Biostats now exposes all major SAP authoring levers that a biostatistics SME expects for operational drafting:
- study/endpoint design
- multiplicity strategy
- estimand strategy
- missing-data handling strategy
- comparator framing
- project + dossier + review governance controls
- governed template/document package generation

## Next Recommended Iteration

1. Add a traceability preview panel (Assumption → SAP section → artifact).
2. Add template versioning and organization-level template override support.
3. Add a validation heatmap for regulator-specific SAP expectations per selected region.
