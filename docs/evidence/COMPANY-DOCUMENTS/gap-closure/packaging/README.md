# eCTD original integrity and report legal packages

Node 22, local branch `concept2cure-v2`, 2026-10-18. These are uncommitted integration results; parent release verification owns the eventual exact commit/SHA, full TypeScript, production build and remote checks.

- `tests-green.txt`: **301 tests / 21 files passed** after canonical legal-registry cutover and restored controlled mutations. Includes actual final-ZIP extraction, real report PDF text/seal/signature/draft assertions, signature parser/validator tests, PDF/A policy refusals, current legal/source/project admission, registry placement and existing report/PDF interactions.
- `registry-cutover-green.txt`: 41 tests / four PGlite fixtures passed using the actual `20261018_company_legal_registry.sql` and canonical `syncCompanyLegalRegistry`; no settings-array fallback.
- `source-propagation-red.txt`: temporarily removing core adapter `sourceIntegrity` propagation makes canonical Vault-to-final-ZIP provenance regression fail. Source restored before green.
- `report-final-member-red.txt`: temporarily appending one byte only at ZIP legal-member write makes the positive route artifact test fail: the final archive verification returns 409 instead of delivery. Source restored exactly before green.
- `eslint.txt`: zero errors; 16 warnings in pre-existing large functions/files. New original-integrity, report-package, reporting UI and test helpers have zero warnings. No rule disables, baselines or production dependencies added.

Artifact/contract details are in `docs/design/COMPANY_ORIGINAL_PDF_INTEGRITY.md` and `docs/design/COMPANY_REPORT_LEGAL_PACKAGES.md`. Structural signature detection is not cryptographic signature validation. Tests use structurally signed fixtures rather than trusted signer credentials, and explicitly mocked conversion/validation results where toolchain behavior is under test. Actual veraPDF process handling is separately exercised by the signature/validation helper suite. Source-member equality is checked against extracted compressed archive bytes, not merely against in-memory staging.

The report archive is delivered through the existing chained report export audit. It is not retained as a server-side binary re-download record. The exact ZIP SHA-256 is bound by the audit and response header; full selected metadata/presentation proof travels inside the user's ZIP. This evidence makes no deployment, agency acceptance, legal completeness or cryptographic trust claim.
