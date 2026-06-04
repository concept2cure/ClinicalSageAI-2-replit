# document-classify — CHANGELOG

## v1.0 — 2026-06-04

- Initial. Classifies an ingested document to a CTD section code, module,
  granularity node, and document type with a calibrated confidence and a
  grounded rationale. JSON-only output. Guardrail: never fabricate a section
  code — return `sectionCode: null` with `confidence < 0.5` when uncertain.
