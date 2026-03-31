# Session B Infra Recon — 2026-03-30

## Scope completed before any new package/container install
Reviewed:
- `package.json`
- `scripts/startup.sh`
- `docker-compose.yml`
- `server/index.ts`
- `server/routes/firecrawl.ts`
- evidence/document/knowledge routes: `evidence`, `evidence-search`, `evidence-management`, `document-understanding`, `documents-unified`, `knowledge-base`, `pubmed`, `literature-review`, `csr-builder`, `vault-auto`, `compute`, `universal-packager`, `submission-center`, `ectd-*`, `reports/*`
- queue/scheduler/worker stack: `services/ai-actions/action-queue.ts`, `services/automation/scheduled-jobs.ts`, `services/sentinel/scheduler.ts`, `workers/*`
- parsing and ingestion stack: `services/documentIntelligence/intakePipeline.ts`, `integrations/tika/client.ts`, `integrations/grobid/client.ts`, `services/citations/citationNormalizationService.ts`, `integrations/docling/client.ts`, `integrations/unstructured/client.ts`
- python/batch path: `docker-compose.yml` batch worker entry (`python scripts/worker/run_batch_worker.py`)

---

## 1) Current document ingress map

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
