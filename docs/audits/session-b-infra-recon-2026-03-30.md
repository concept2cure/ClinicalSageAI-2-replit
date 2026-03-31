# Session B Infra Recon (2026-03-30)

## Scope reviewed before install
- `package.json`
- `scripts/startup.sh`
- `docker-compose.yml`
- `server/index.ts`
- `server/routes/firecrawl.ts`
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

---

## 1) Current document ingress map
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
