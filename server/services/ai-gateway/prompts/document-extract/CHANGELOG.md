# document-extract — CHANGELOG

## v1.0 — 2026-06-04

- Initial. Extracts a document's structural outline, discrete claims (with
  locators), and referenced sources for a given CTD section. JSON-only output;
  the claims/sources seed `evidence_links`. Guardrail: extract only what is
  present — never invent claims, locators, or citations.
