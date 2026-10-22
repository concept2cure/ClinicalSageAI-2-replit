# Current Data Room / data management code assessment

Research only, 2026-10-14. Repository: concept2cure/ClinicalSageAI-2-replit, branch concept2cure-v2, pinned commit 87b27c897c5d1be20b0527009bcaf425ebbf3af6. All statements below distinguish source implementation from deployed activation. No code changed, no provider calls, no live tenant records read, no tests rerun. Checked-in test evidence inspected separately from current runtime verification.

## Main conclusion

The strongest existing asset is a governed evidence spine, not a generic virtual data room. The current code already records exact file identity, capture actor, source versions, where evidence is used, retained/withdrawn data consequences, deterministic metadata, readable text and structure-only dataset profiles. This is an appropriate base for a claim-to-evidence regulatory graph and reproducible filing compiler. The October 8 design document lists several gaps that have since been implemented; do not repeat those baseline gaps as current deficiencies.

The remaining opportunity is to make the stored evidence scientifically interpretable and automatically reusable across drugs, devices and IVDs, while preserving existing freeze, checksum, lineage and human confirmation gates. Retrieval quality, capacity, recovery and dataset packaging need improvement before scaling all worldwide filing needs.

## Implemented capabilities, source evidence

### Governed capture and original identity

- Canonical source in `cre_evidence_sources`; client-document INSERT and chained capture audit commit in the same transaction: `server/services/clinical-regulatory-evidence/evidence-spine.service.ts:125`.
- Atomic supersession: retire predecessor + create successor + audit together; refuses a second successor when predecessor is already retired: same file `:78`.
- Database trigger prevents edits to org/id/type/created_at; checksum, scope, previous version, creator and stored-file reference are write-once; retired source cannot become current again: `migrations/20261001_cre_evidence_sources_capture_immutability.sql:69`.
- Upload loader verifies org column and resolved org-prefixed path, blocks paths outside uploads root, verifies stored SHA-256 and throws on mismatch; legacy rows are explicitly unverifiable: `server/services/ana/uploaded-file-access.ts:130`, `:157`, `:235`. The current storage implementation reads local `uploads` paths; durable deployed volume/object-store configuration was not inspected.
- Chat-upload canonical capture is byte-based, scoped to numeric workspace or UUID regulatory program: `server/routes/chat/upload.ts:418`. This supersedes historical 2025 default-tenant / temporary-path proposal concerns.

### Shared processing, metadata, search and filing

- One deterministic processing module serves chat upload, adopt and derived spreadsheet files, extracts text, classifies likely placement, records declared version, project facts and study linkage: `server/services/clinical-regulatory-evidence/data-room-processing.ts:67`, `:99`, `:121`, `:175`, `:213`.
- Adoption reads and verifies stored bytes, rechecks file identity, records capture/audit, then processes: `server/routes/c2c/projects.ts:1527`, `:1558`, `:1571`. Spreadsheet edits create new bytes/new upload and process a source instead of mutating originals: `server/services/ana/uploaded-file-access.ts:564`.
- Product/application/agency facts are inherited from own project; registry/protocol/document-date/data-cut metadata found by labeled rules with matched text and offsets; studies match only the same project and org, and ambiguous studies select neither: `server/services/clinical-regulatory-evidence/catalog-facts.ts:105`, `:141`, `:162`.
- Server-side full-text search, status/kind/capture-date/current filters, validated paging, real totals and match snippets are implemented: `server/services/clinical-regulatory-evidence/data-room-search.ts:95`, `:114`, `:126`; source route includes where-used citation summary `server/routes/c2c/projects.ts:1907`, `:1943`. Implementation uses limit/offset paging, not the keyset design prose.
- Capture → classify → file counts derive over whole project rather than 200-row list: `server/services/vault/vault-data-room-filing.ts:95`.
- User can file selected sources into Vault without uploading again; each file traverses shared governed ingest; max 25 sources/batch; per-item filed/already-filed/refused; partial failure never called complete; machines only suggest placement: `server/services/vault/vault-data-room-filing.ts:1`, `:34`, `:188`, `:223`.

### Data management and clinical dataset awareness

- Structure-only CSV/TSV/XLSX/define.xml profile: column names/inferred types, row counts, table counts, rule-based SDTM/ADaM domain hints; no subject cell values duplicated in profile: `server/services/clinical-regulatory-evidence/dataset-profile.ts:10`, `:75`, `:98`, `:154`.
- Profiling bounds: 25 tables, 300 listed columns, 500-row type inference sample: same file `:42`. These are shape profiling, explicitly not CDISC conformance.
- Source-removal disposition distinguishes retain derived data, withdraw derived data and supersede; preview counts chunks/atoms/catalog/citations/downstream references, legal holds, approvals, named replacement and expiry-bound preview token: `shared/document-data-disposition.ts:1`.
- Service uses repeatable-read previews; serializable apply; role check (project lead or org manager), fresh impact hash, chained audit receipt and append-only disposition record: `server/services/document-data-disposition/service.ts:34`, `:49`, `:64`, `:84`.
- Runtime activation: ONLY `C2C_DOCUMENT_DISPOSITIONS_ENABLED='1'` enables apply; empty/default config means refused pending verified activation: `server/services/document-data-disposition/production-adapter.ts:6`; apply fail-closed `service.ts:86`. Deployment activation unknown. No assumption that checked-in service equals enabled production feature.

## Current limits and specific findings

### 1. Recovery gap: readable capture can stay unsearchable after derived persistence failure

`server/routes/chat/upload.ts:505` inserts `extractionStatus='extracted'` when extraction succeeds, before the separate write of `extracted_text`/catalog facts. `:553-558` catches a processing-persistence failure and merely logs it. The purported repair sweep selects ONLY `extraction_status='pending'` at `data-room-processing.ts:255-257`, so that already-extracted row is not repaired by the sweep. An identical re-upload resolves existing source and skips new processing (`upload.ts:427`). This is a source-supported failure-path finding, not a reproduced live incident.

Further, `processPendingSources` has no located production scheduler/worker/CLI caller: repository references outside its implementation were only tests. Durable retry/outbox with stage-state reconciliation should cover pending, failed and status/text inconsistency, rather than relying on a latent helper.

### 2. Grounding remains front-biased

`server/services/ana/draft-project-sources.ts:49-64` loads at most 8 selected documents, first 12,000 chars each, max 48,000 chars total. It honestly marks incompleteText, but evidence deep in a CSR/TLF can be missed. S5a/S5b delivered numerical checks/reproducible computation; passage-based selection is still absent in this bridge. Improve task-specific section/table retrieval with pinned locators and explicit coverage receipts. Whole-document comprehension and passage grounding are different responsibilities.

### 3. Search capacity and multilingual quality are bounded

- Title/text search indexes only first 900,000 extracted chars: `data-room-search.ts:63`. Query/snippet use English FTS `:117`, `:149`. A term later in a long report is outside this catalog search index, even though text was stored.
- Metadata title-page extraction scans first 20,000 chars and English labels (`catalog-facts.ts:44`, `:110`). This is intentional narrow behavior, not a multilingual/global identity resolver.
- OCR supports configurable language codes but default is English; supported-language capability list shows English/French/German/Spanish/Italian (`server/services/ocr/tesseractOcrService.ts:28`, `:33`). These are not proof of Japanese/Chinese/Arabic OCR quality or deployed models.
- `ExtractedDocumentText` has OCR confidence/page spans (`server/services/ocr/extractDocumentText.ts:32`), but `ExtractedCapture` only retains text/method/page count/words (`data-room-processing.ts:38`, `:105`). Page mapping and OCR confidence do not propagate through this Data Room processing envelope. Preserve page/cell geometry, extraction coverage, confidence and engine version to support original-page verification and safe numeric extraction.

### 4. OCR compute capacity is unbounded at intake

Upload cap is 50 MiB (`shared/constants/document-intake-formats.ts:45`). `extractCapture` calls extractor with no budget; PDF fallback calls `ocrPdfToText(buffer)` without maxPages/language controls (`extractDocumentText.ts:90`). `docs/evidence/D2-DATA-ROOM-CATALOG/2026-10-08-s3-catalog-facts/README.md:40` explicitly says intake page bound unfinished. Move large processing to durable bounded workers; partial read must state actual pages/coverage; avoid pretending an incomplete read is complete.

### 5. Scientific data and filing dataset packages remain outside launch scope

- .xpt/.sas7bdat/Dataset-JSON/.zip are absent from intake contract (`shared/constants/document-intake-formats.ts:17`).
- Profile `dataset-profile.ts:16` explicitly says not a conformance check or XPT reader. SDTM/SEND can share signatures and profiles collapse to SDTM; do not equate hint with verified standard.
- `define.xml` profile is regex-based shape reading (`:140`), not a standards parser/schema validator; should be upgraded only in a scientific-data adapter slice.
- `server/services/cdisc/cdisc-package-readiness.ts:21` states no XPT/define.xml is read and caller-declared metadata drives readiness. CSV/XLSX profiling does not establish value-level CDISC or study-data package compliance.
- Leaf source resolver enforces PDF staging (`server/services/ectd/leaf-source-resolver.ts:66`, `:577`, `:753`), so standardized dataset package capability must be added explicitly. FDA rules registry reports not-checked dataset packaging (`server/services/ind/ctd/fda-technical-rules.ts:124`, `:138`).
- Existing founder launch-scope decision defers these capabilities (`docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md:109` section 6). This research can recommend the next scope; implementation should align with authorized product decision.

### 6. Source-family identity needs a stronger revision signal

Chat automatically supersedes exactly one current same-title/project/type source (`evidence-spine.service.ts:438`, `:476`; `upload.ts:469`). It refuses ambiguous multiple matches, but a generic `test_report.pdf` from a different test/study can still retire an unrelated source when it is the only match. Recommend stable document-family/source-system ID + explicit user check-in or high-confidence proposal; record why relationships were accepted. A content change alone does not prove successor identity.

### 7. Scale governance carefully

Disposition confirmation SHARE-locks 21 impact tables, then SHARE ROW EXCLUSIVE-locks disposition table (`service.ts:16`, `:95`). This conservative implementation prevents late impact writes; benchmark cross-tenant concurrency before scale. Future adapter can use tenant/project advisory lock + immutable impact versions/serializable checks under explicit invariants, retaining race tests and fail-closed behavior. No fresh contention measurements taken.

## Where to build moat using existing assets

1. **Regulatory evidence objects.** Extend current source/catalog records to typed claims: measured value + unit + denominator + population + timepoint + assay/device/software version + study/data-cut + acceptance criterion + bound source page/table/cell + reviewer state. Claim equality must be context-aware; matching numbers anywhere in a document is insufficient scientific consistency.
2. **Reusable evidence-acceptance contracts.** Requirements as versioned executable constraints with application/agency/product context. Evidence accepted for one purpose can be shown as reusable, incomplete or insufficient for another without silently assuming equivalence. Drugs: CSR/TLF/SAP → module summaries; device: design input → V&V → risk/GSPR → eSTAR/technical file; IVD: analytical/clinical performance → intended purpose/claims → PER/PMPF.
3. **Change simulation before propagation.** Build on existing source-usage and span-lineage graph to preview which claims, filings, markets and approvals change when assay version, predicate, specification, labeled indication, database lock or standard edition changes. Current immutable filed snapshots stay pinned; draft changes are proposals. Differential validation reruns affected deterministic checks and displays evidence scope.
4. **Reproducible data-to-claim engine.** Isolated compute jobs with source digests, transform code/container digest, parameters/seed, outputs digest, validation report and signed review receipt. Existing computation provenance becomes common mechanism for biostatistics and diagnostics 2×2/CIs/LoD/precision workflows. Numbers come from engines, not prose models.
5. **Multimodal extraction with verifiable locators.** Layout/table/image models propose structured candidates; deterministic identity/unit/shape checks + calibrated confidence route ambiguous cells to reviewer against original page. Learn tenant-specific corrections under tenant isolation/consent, never automatic cross-customer training.
6. **Regulatory jurisdiction adapters as compiler targets.** One accepted evidence graph, versioned public-rule packs and target renderers produce eCTD / eSTAR / MDR technical file / IVDR performance dossier / portal attachment manifests. Each target carries coverage proof and unresolved blockers; new country rules extend adapters, not duplicate sources.
7. **Continuous quality evidence.** Protected eval corpus from representative redacted/synthetic dossiers per modality/market, adversarial stale-source/contradiction/denominator/unit/table cases, retrieval coverage and citation support, extraction cell accuracy, transformation reproducibility and worker recovery. This compounds a defensible quality dataset and reviewer correction history, beyond buying a stronger model.

These are differentiation hypotheses, not claims that every competitor lacks them. Competitor implementation/access may differ from public marketing.

## Verification inspected

Checked-in October 8 evidence includes real PG16/RLS app_service tests for source processing, search beyond 200 rows, cross-org/project isolation, deterministic catalog facts, study FK tenancy, legacy keyless chunk indexing and reproducible computation runs. These artifacts are historical test results at their slice commits, not fresh runs on this pinned HEAD. Source trace shows intended active routes/functions; deployed migrations, feature flags, storage, OCR languages/providers and client workflows remain unverified.


## S5 completion boundary

Stored, reproducible sample-size run records exist (`server/services/stats/computation-runs.ts:55`), but recompute recognizes only `ana-biostats:compute` (`:110`). The checked-in S5b evidence explicitly leaves other statistics engines and document-span `computed` lineage for a later slice (`docs/evidence/D2-DATA-ROOM-CATALOG/2026-10-08-s5b-computation-runs/README.md:61`). The design-level stored run must not be presented as universal dataset-to-document computational lineage.
