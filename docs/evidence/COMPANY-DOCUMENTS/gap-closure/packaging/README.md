# eCTD original integrity and report legal packages

## What already exists

`server/services/ectd/leaf-source-resolver.ts` admits and materializes the exact Vault source; `core-to-packager.ts` carries it into `submission-gateways/regional-packager.ts`, which owns PDF finalization, regional XML, actual DTD checks and ZIP output. `sequence-manifest.ts` retains the shipped leaf identity. The company-document completion extends those paths with source-integrity and original-PDF proof; it introduces no parallel packager or approval path. `assemble-from-core.ts` also retains the canonical saved company-requirement gate. Before this completion, downstream normalization could rewrite a registered legal or signed original.

## Historical October 18 results

Node 22, local branch `concept2cure-v2`, 2026-10-18. Parent release verification owns the eventual exact commit/SHA, full TypeScript, production build and remote checks; the results below retain their original date.

- `tests-green.txt`: **301 tests / 21 files passed** after canonical legal-registry cutover and restored controlled mutations. Includes actual final-ZIP extraction, real report PDF text/seal/signature/draft assertions, signature parser/validator tests, PDF/A policy refusals, current legal/source/project admission, registry placement and existing report/PDF interactions.
- `registry-cutover-green.txt`: 41 tests / four PGlite fixtures passed using the actual `20261018_company_legal_registry.sql` and canonical `syncCompanyLegalRegistry`; no settings-array fallback.
- `source-propagation-red.txt`: temporarily removing core adapter `sourceIntegrity` propagation makes canonical Vault-to-final-ZIP provenance regression fail. Source restored before green.
- `report-final-member-red.txt`: temporarily appending one byte only at ZIP legal-member write makes the positive route artifact test fail: the final archive verification returns 409 instead of delivery. Source restored exactly before green.
- `eslint.txt`: zero errors; 16 warnings in pre-existing large functions/files. New original-integrity, report-package, reporting UI and test helpers have zero warnings. No rule disables, baselines or production dependencies added.

Artifact/contract details are in `docs/design/COMPANY_ORIGINAL_PDF_INTEGRITY.md` and `docs/design/COMPANY_REPORT_LEGAL_PACKAGES.md`. Structural signature detection is not cryptographic signature validation. Tests use structurally signed fixtures rather than trusted signer credentials, and explicitly mocked conversion/validation results where toolchain behavior is under test. Actual veraPDF process handling is separately exercised by the signature/validation helper suite. Source-member equality is checked against extracted compressed archive bytes, not merely against in-memory staging.

The report archive is delivered through the existing chained report export audit. It is not retained as a server-side binary re-download record. The exact ZIP SHA-256 is bound by the audit and response header; full selected metadata/presentation proof travels inside the user's ZIP. This evidence makes no deployment, agency acceptance, legal completeness or cryptographic trust claim.

## October 23 upstream integration

`verification-2026-10-23.json` records the merged-source checks and latest results from **33 unique suites, 367 passed, zero failed or skipped**. The first 32-suite run passed 347 cases and correctly refused 11 cases in two malformed-PDF fixtures. Those fixtures now use the existing `goldenPdf` qualification helper; the 20-case rerun also includes the other consumer of the shared FDA backbone helper. `post419-fda-fixture-tests.txt` retains that complete rerun. No production parser, PDF/A policy, DTD gate or conformance assertion was weakened.

The reviewed merge preserves exact source metadata through the core adapter, unchanged originals and their final-ZIP hash verification, required original PDF/A validation, actual DTD execution, and saved legal-requirement refusals. The same checks exercise upstream authoritative applicant/added-market application facts, captured identity snapshots, strict prior manifests and lifecycle folds, sourced gateway size limits and FDA form deduplication. Company identity-review/correspondence integration is qualified separately by its owning workstream; this record does not claim that work or a live agency transmission.
