# AnA Document Product Quality Stack — Architecture

## Objective
Upgrade AnA from draft generation to governed document product quality with auditable parsing, citation normalization, quality checks, reviewer diffs, and final-format validation.

## End-to-end pipeline
A. **Source intake**
1. Upload/file
2. Apache Tika metadata/type sniff
3. OCRmyPDF for scanned PDFs
4. Docling primary structured parse
5. Unstructured fallback parse (arbitration on confidence/text coverage)

B. **Evidence/citation normalization**
1. Parse output
2. GROBID reference extraction
3. Citation.js normalization/rendering
4. scispaCy enrichment (biomedical entities, abbreviations)

C. **Draft quality**
1. AnA draft candidate
2. Vale lint against Concept2Cure styles
3. LanguageTool cleanup suggestions
4. Proposal candidate with advisory report

D. **Reviewability**
1. Version A vs B
2. redlines artifact generation
3. diff2html browser rendering payload
4. Reviewer decision in governed flow

E. **Final validation**
1. Generated final package (PDF/DOCX/eCTD)
2. Existing governed export consequence
3. veraPDF compliance report attachment (feature-flagged)

## Control-plane principles
- App is orchestrator and only durable writer.
- Sidecars are stateless workers/validators.
- Sidecar outputs must include provenance metadata and request IDs.
- Fail-open advisory where policy not strict; fail-closed only where policy explicitly configured.

## Phase plan (delivery discipline)
1. Phase 1: contracts/docs/feature flags/service boundaries.
2. Phase 2: intake service + Tika/OCRmyPDF/Docling/Unstructured integrations.
3. Phase 3: evidence/citation stack.
4. Phase 4: quality stack (Vale/LanguageTool).
5. Phase 5: reviewer diff stack (redlines/diff2html).
6. Phase 6: final validation stack (veraPDF with policy controls).


## Current implementation notes
- Intake arbitration service implemented (Tika/OCRmyPDF/Docling/Unstructured adapters).
- Quality stack composes Concept2Cure medical-writing heuristics with Vale/LanguageTool adapters in advisory mode.
- Citation normalization scaffolding includes GROBID extraction + Citation.js adapter + scispaCy enrichment hooks.
- Review diff scaffolding now includes redlines sidecar adapter + diff2html HTML fallback rendering service.
