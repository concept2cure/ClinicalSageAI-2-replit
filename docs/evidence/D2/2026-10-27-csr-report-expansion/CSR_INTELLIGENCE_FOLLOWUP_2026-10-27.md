# CSR reference expansion: source-verified continuation

Workstream: W1/D2 (existing Authoring/AnA evidence path). This is a partial, measured correction, **not** a complete CSR deployment or an approved model-training run.

## What already exists

- `server/services/clinical-regulatory-evidence/evidence-spine.service.ts`: canonical governed source system.
- `server/services/clinical-regulatory-evidence/public-reference-sources.ts`: permitted-use and checksum-bound source-page reader.
- `scripts/cre/prepare-public-reference-seed.mjs`: existing curated seed tool; a push does not install its database records.
- `server/data/public-csr-reference/manifest.json`: prior admitted/candidate release.
- `scripts/ingest-corpus.ts`: ClinicalTrials.gov registry ingestion (not PDF CSR ingestion).
- `scripts/parse_csrs_to_csv.py`: legacy training-metadata export; keyword-derived success labels corrected in this batch.

## New retained evidence processing

The retained Library package `LMN201_CSR_Reference_Expansion_2026-10-27.zip` contains eleven NIH/BPCA main CSR bodies. The source archive itself is preserved; original SHA-256: `c93fb0e1f54b71d9514cb37417c8a043df2b188c34f456d6110a9d58a0e021ee`, size 153,323,279 bytes.

A second, **staging-only** Library artifact `Concept2Cure_NIH_CSR_Page_Derivatives_2026-10-27.zip` contains source-bound native-text derivatives for **3,821 physical pages across 11 reports**, SHA-256 `fd5d3d37bac0317ec9b2573c56386cf8e03dcdd13d5a75e6d7d689527e9e186e`, size 1,561,985 bytes. Every page has its own hash and physical page number. Extraction and content hashing were verified. The 271 low-text pages (241 image-heavy low-text pages) are flagged for OCR or source-image review. No scientific verification of values/tables and no production import is claimed.

Every source is external reference material, NOT LMN-201 client results, and no model-training rights are inferred. Public download rights are distinct from model training or redistribution permission. All source evidence must remain retained.

## Material software correction

The old CSV export script treated `significant` as trial success, so `not statistically significant` became a positive label. The new export requires explicit reviewed `success_adjudication` containing a boolean outcome, source reference, criterion, and reviewer. Missing fields leave the outcome unreviewed rather than silently inferred. `scripts/tests/test_parse_csrs_to_csv.py` covers seven positive and negative integrity cases; all seven were executed locally and passed. These tests do not establish the full repository CI verdict.

## Remaining admission and quality gates

1. Persist unchanged original report bytes under the existing governed source/Vault rules; verify checksums against the Library archive.
2. Qualify rights, extraction coverage, chart/table/footnote alignment, and provenance before promotion.
3. Route only permitted, checked references through the existing CRE seed and approved AnA retrieval tool. Verify database rows and deployed responses.
4. Evaluate source-to-section writing quality using blinded study-family splits and expert medical-writing/biostatistics review, including LMN-201 denominator/odds-ratio reconciliation.
5. Preserve one canvas, one governed editor and one AnA. Never present benchmark references as client study evidence.

Not claimed: additional independent PDF downloads in this turn, commercial model fine-tuning, production source admission, TypeScript gate completion or agency-submission readiness.

## Additional GSK CSR main-body staging — rights-restricted

Two previously retained original redacted GSK clinical study reports were independently opened, inspected and converted to hash-bound **unreviewed** page extracts:

| Original Library file | Pages | Original SHA-256 |
|---|---:|---|
| GSK104106_Final_Year10_Redacted_Clinical_Study_Report.pdf | 1,940 | b078056109314724f37141ba331ff244a49894d513b7f0629846918960fc34dc |
| GSK114312_Redacted_Clinical_Study_Report.pdf | 477 | 175cc7970c2283fb13d4425987cb7e3e6ed7f2c00709a8ec38c4318fcdd4eecd |

Total additional staged: **2 redacted report bodies, 2,417 pages**. Their 951,949-byte page-derivative zip is retained in Library as `Concept2Cure_GSK_CSR_Restricted_Derivatives_2026-10-27.zip`, SHA-256 `e4a8c5d47d4345535fcd1e6c79e0a9710db61d9c6e762f995d9b67fd4a8fa27d`. Each page's content hash and source PDF identity were checked.

**Rights status: RESTRICTED.** No model training, commercial retrieval, redistribution or production Cortex admission is authorized by this processing. Registration/disclosure of a CSR on a sponsor portal does not itself confer those rights. Full scientific source review, license review and tenant-safe admission remain uncompleted.

Combined newly staged source extracts in this session: **13 report bodies / 6,238 pages** (11 NIH + 2 GSK). This count is not 13 newly acquired original files: all originals were already retained in the user's Library. No independent new PDF download is claimed.
