<<<<<<< HEAD
# Session B Infra Recon — 2026-03-30

## Scope completed before any new package/container install
Reviewed:
=======
# Session B Infra Recon (2026-03-30)

## Scope reviewed before install
>>>>>>> origin/codex/complete-integration-recon-for-session-b
- `package.json`
- `scripts/startup.sh`
- `docker-compose.yml`
- `server/index.ts`
- `server/routes/firecrawl.ts`
<<<<<<< HEAD
- evidence/document/knowledge routes: `evidence`, `evidence-search`, `evidence-management`, `document-understanding`, `documents-unified`, `knowledge-base`, `pubmed`, `literature-review`, `csr-builder`, `vault-auto`, `compute`, `universal-packager`, `submission-center`, `ectd-*`, `reports/*`
- queue/scheduler/worker stack: `services/ai-actions/action-queue.ts`, `services/automation/scheduled-jobs.ts`, `services/sentinel/scheduler.ts`, `workers/*`
- parsing and ingestion stack: `services/documentIntelligence/intakePipeline.ts`, `integrations/tika/client.ts`, `integrations/grobid/client.ts`, `services/citations/citationNormalizationService.ts`, `integrations/docling/client.ts`, `integrations/unstructured/client.ts`
- python/batch path: `docker-compose.yml` batch worker entry (`python scripts/worker/run_batch_worker.py`)
=======
- `server/routes/evidence.ts`
- `server/routes/evidence-search.ts`
- `server/routes/evidence-management.routes.ts`
- `server/routes/document-understanding.ts`
- `server/routes/documents-unified.ts`
- `server/routes/knowledge-base.ts`
- `server/routes/pubmed.ts`
- `server/routes/literature-review.ts`
- `server/routes/csr-builder-routes.ts`
- `server/routes/vault-auto.ts`
- `server/routes/vault-dms.js`
- `server/routes/compute.ts`
- `server/routes/universal-packager.ts`
- `server/routes/submissionCenter.routes.ts`
- `server/routes/submission-ops.ts`
- `server/routes/ectd-compile.ts`
- `server/routes/ectd-export.ts`
- `server/routes/reports/generate-report.ts`
- async/queue/scheduler code in `server/services/ai-actions/*`, `server/services/automation/scheduled-jobs.ts`, `server/jobs/*`, `server/services/compute/*`
>>>>>>> origin/codex/complete-integration-recon-for-session-b

---

## 1) Current document ingress map
<<<<<<< HEAD

### Primary ingress surfaces
1. **Knowledge-base upload proxy** via `/api/knowledge-base/upload` (BFF to Shadow Service).  
2. **Firecrawl scrape ingest** via `/api/firecrawl/scrape` with normalization + persistence (`external_evidence_documents`).  
3. **Vault auto-link** via `/api/vault/*` for CSR/submission package ingestion into vault service path.  
4. **Document Understanding** route provides analysis path for layout/structure extraction.  
5. **Documents Unified** router is mostly orchestration façade over multiple legacy routers.

### Characteristics
- Mixed ingress architecture: internal upload + external proxy + crawl import.
- Existing normalization logic exists but is fragmented across subsystems.
- Existing `DocumentIntakePipeline` already calls Tika metadata and Docling/Unstructured parsing, but is not the canonical entrypoint for all uploads yet.

---

## 2) Current evidence ingestion map
- `/api/evidence` currently mostly schema/contract + placeholder data path.
- `/api/evidence-search` combines semantic-search service with DB text fallback against `concept2cure_artifacts`.
- `/api/evidence-management` and `/api/evidence-fabric` are mounted as dedicated evidence governance modules.
- `/api/firecrawl/scrape` is the strongest real evidence ingest path with policy checks, quota, canonical URL handling, and persistence.

---

## 3) Current scientific literature flow
- `/api/pubmed` and `/api/literature-review` are currently lightweight stubs.
- GROBID exists (`integrations/grobid/client.ts`) and is used by citation normalization service, not yet as an end-to-end scholarly PDF ingestion backbone.
- Citation normalization stack already chains GROBID + Citation.js + SciSpacy enrichment.

---

## 4) Current search/indexing architecture
- Primary semantic retrieval path: `semanticSearchService.search(query, limit)` when available.
- Fallback lexical path: SQL `ILIKE` over `concept2cure_artifacts` title/content.
- Existing pgvector appears in schema/services (e.g., vector tables, embedding services), but usage is heterogeneous.
- No single tenant-governed hybrid lexical+semantic index exists yet across docs/evidence/literature/artifacts.

---

## 5) Current async job architecture
- Bull + Redis queue for async AI actions (`ai-action-queue`): retries, backoff, SSE progress.
- Bull repeatable scheduled automation jobs for recurring checks (`c2c-scheduled-automation`).
- Additional interval scheduler (`SentinelScheduler`) for org scans.
- Worker files exist for ingestion/vectorization/entity extraction/packaging.
- Python batch worker exists in compose and runs independently.

---

## 6) Current upload → parse → persist → retrieve path
1. Upload/import at route/BFF level (knowledge-base, vault, firecrawl, etc.).
2. Parse/normalize varies by path:
   - Tika metadata + Docling + Unstructured via `DocumentIntakePipeline` in document intelligence path.
   - Firecrawl normalization for external web evidence.
   - Specialized layout-aware extraction worker for rich PDFs.
3. Persist to module-specific stores (`concept2cure_artifacts`, `external_evidence_documents`, vault storage, etc.).
4. Retrieve via semantic search service and/or SQL fallback.

Current risk: no single enforced canonical parsing + indexing contract for all ingestion surfaces.

---

## 7) Fit/Risk Notes for Session B stack

### Apache Tika
**Fit:** already partially present; strong candidate for canonical broad-file metadata/text extraction normalizer.  
**Risk:** needs explicit feature-flagged rollout to avoid breaking specialized parsers.

### GROBID
**Fit:** already integrated at citation layer; can be promoted for scholarly PDFs in literature/CER paths.  
**Risk:** must normalize references into governed objects; avoid TEI blob dumping.

### Temporal
**Fit:** complements long-running governed workflows (ingest/enrichment/export/report compile + approval waits).  
**Risk:** migration scope creep if Bull is replaced wholesale; should start with narrow, typed workflows.

### OpenSearch
**Fit:** enables org-scoped hybrid retrieval and cross-object ranking with richer filtering than current fallback search.  
**Risk:** avoid second disconnected search universe; use dual-write + comparison mode while pgvector path remains.

---

## Recon conclusion
Repository has partial primitives for Tika/GROBID and robust async/event foundations, but lacks a single governed ingestion/search/workflow spine. Session B should converge existing primitives under feature flags instead of creating parallel systems.
=======
1. **Knowledge-base upload proxy** (`/api/knowledge-base/upload`) forwards multipart uploads to shadow `/knowledge/ingest-files` service.
2. **Knowledge-base IND autodraft upload** (`/api/knowledge-base/ind-autodraft/upload`) performs local extraction using `pdf.js-extract`, `mammoth`, CSV/text fallback and in-memory session aggregation.
3. **Evidence-management upload** (`/api/evidence-management/upload`) uses in-memory multer, AI extraction service, and stores into `device_data_center`.
4. **Firecrawl scrape ingest** (`/api/firecrawl/scrape`) normalizes provider output and persists to `external_evidence_documents` through `persistEvidence`.
5. **Document-understanding** route is analysis-focused and file-path based; not a canonical upload endpoint.
6. **Vault routes** (`vault-auto`, `vault-dms`) include storage-oriented flows but not a single normalized extraction backbone.

## 2) Current evidence ingestion map
1. External evidence: Firecrawl route with quota/policy controls + normalized persistence.
2. Managed evidence files: Evidence-management upload path into `device_data_center`.
3. Evidence object APIs (`/api/evidence`) are currently mostly schema/CRUD contracts and placeholders.
4. PubMed/literature endpoints exist but are fragmented and not wired to a shared scientific parser.

## 3) Current scientific literature flow
1. `pubmed.ts` exposes a lightweight readiness/search stub.
2. `literature-review.ts` exists but currently does not centralize PDF structure extraction.
3. `server/services/literature/index.ts` re-exports legacy literature services and provides unified interface, but extraction quality depends on upstream text quality.
4. No dedicated scholarly-PDF parser (GROBID) currently sits in the central ingestion path.

## 4) Current search/indexing architecture
1. Primary semantic retrieval uses Postgres + pgvector (`document_vectors`, similarity SQL in `semanticEmbeddingService.js`).
2. Evidence search route tries semantic service, then falls back to relational text search over artifact tables.
3. No production-grade lexical+semantic hybrid engine currently wired across all governed objects.
4. Some feature-specific vector paths exist (`vectorSearch.js`, CSR search service), creating uneven retrieval behavior.

## 5) Current async job architecture
1. **Bull + Redis** used in multiple domains:
   - AI action queue (`server/services/ai-actions/action-queue.ts`)
   - Scheduled automation (`server/services/automation/scheduled-jobs.ts`)
   - CER queue paths (`server/services/cerGenerator.ts`, `server/routes/cerRoutes.ts`)
2. **node-cron** used for periodic/retention jobs (`server/jobs/periodicReview.js`, `server/jobs/retentionCron.js`, memory consolidation cron).
3. **Compute pipeline** (`server/services/compute/computeService.ts`) writes durable job records in DB but executes immediately in-process/subprocess, not yet Temporal-backed.

## 6) Current upload → parse → persist → retrieve path
- Upload: Multer memory storage in several routes.
- Parse: Route-local parser logic (`pdf.js-extract`, `mammoth`, ad-hoc text conversion).
- Persist: Multiple tables (`device_data_center`, `external_evidence_documents`, artifacts/provenance tables).
- Retrieve: mix of API-specific SQL, semantic pgvector, and service-specific search endpoints.

Observation: pipeline is capable but fragmented; there is no single broad-file extraction normalizer and no single hybrid retrieval fabric.

## 7) Fit/risk notes for Session B tools

### Apache Tika
**Fit**
- Strong for broad MIME normalization and text+metadata extraction.
- Can be inserted as pre-parser in existing upload routes with fallback.

**Risks**
- OCR/performance variance on large docs.
- Must avoid replacing established downstream persistence contracts.

### GROBID
**Fit**
- High-value for scholarly PDFs (title/authors/abstract/sections/references).
- Best used selectively via document classifier heuristics.

**Risks**
- TEI parsing complexity and service availability.
- Unstructured TEI dump would violate governed normalization expectations.

### Temporal
**Fit**
- Needed for long-running, retry-safe, inspectable workflows (compile/export/review gates).
- Can begin with narrow workflow set while Bull remains for lower-risk jobs.

**Risks**
- Added runtime + operational complexity.
- Requires workflow/activity boundary discipline and idempotent activities.

### OpenSearch
**Fit**
- Supports hybrid lexical+semantic retrieval with strong filtering.
- Enables context-aware ranking across org/project/artifact scope.

**Risks**
- Mapping drift if dual-write contracts are not strict.
- Must preserve tenant scoping and avoid “second search universe” behavior.

## Recon conclusion
Repo is ready for phased spine integration **only if** we layer adapters into current contracts, keep feature flags default-off, and prove dual-write/fallback behavior before default enablement.
>>>>>>> origin/codex/complete-integration-recon-for-session-b
