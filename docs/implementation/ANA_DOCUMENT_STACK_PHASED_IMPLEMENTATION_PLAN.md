# AnA Document Stack — Phased Implementation Plan

## Phase 1 (this run): architecture/contracts
- Complete repo truth + architecture docs.
- Define contracts in TypeScript (`contracts.ts`).
- Add feature flag map and helper.

## Phase 2 (started in this run): ingestion
- Add sidecar/CLI adapters for Tika, OCRmyPDF, Docling, Unstructured.
- Add `DocumentIntakePipeline` arbitration service.
- Add focused tests for fallback and OCR decisioning.

## Phase 3: evidence/citations
- Add GROBID adapter, Citation.js normalizer, scispaCy enrichment adapter.
- Add citation payload tests with scientific fixtures.
- **Progress:** adapter/service scaffolding started for GROBID + scispaCy + citation normalization.

## Phase 4: quality
- Add Vale adapter + Concept2Cure style packs.
- Add LanguageTool adapter.
- Attach advisory report to proposal flow.
- **Progress:** conversation-os routes now include feature-flagged quality/citation/diff endpoints.

## Phase 5: reviewer trust
- Add redlines generator adapter.
- Add diff2html HTML payload service.
- Attach artifacts to review/version surfaces.
- **Progress:** review diff artifact service added with redlines + diff2html fallback.

## Phase 6: final validation
- Complete veraPDF integration policy controls.
- Attach validation report into governed export consequence metadata.
- Optional policy hard-block mode by tenant configuration.
