# Biotech RAG retirement brief

**Decision:** fully retire `server/services/biotechRagService.js` and its `/api/biotech-rag`
surface, converging biotech retrieval onto the canonical pipeline
(`ragRouter` → `advancedRAGPipeline`, over `vault.documents` / `vault.document_chunks`).

**Status:** plan only. The code phases below ship as separate, independently reviewable
PRs. Phases that touch live endpoints, ingestion, or data **must be validated against a
real database with embedding keys** — they cannot be exercised in the CI sandbox (empty
DB, no provider keys). This brief is the contract for that work.

---

## Why corpus-first (the ordering correction)

The biotech endpoints serve their **own** corpus (`rag_chunks` / `rag_documents`), which is
a different store from the vault that `ragRouter` queries. So "repoint search to
`ragRouter`" is **not** behaviour-preserving on its own — it silently swaps the corpus and
returns different (or zero) results. The only safe order is:

1. **Unify the corpus** (migrate `rag_chunks` → `vault.document_chunks`, and point biotech
   ingestion at the vault) **first**.
2. **Then** cut retrieval endpoints + the CERV2 consumer over to `ragRouter`.
3. **Then** rehome or retire the domain features that have no vault equivalent.
4. **Then** drop the `rag_*` tables.

Doing 2 before 1 is the single biggest footgun here.

---

## Findings that shape the plan

- **Same embedding space (good).** `rag_chunks.embedding` and `vault.document_chunks.embedding`
  are both pgvector(1536) from `text-embedding-3-small`. OpenAI-embedded chunks can be copied
  without re-embedding. **But** biotech has a TF-IDF 384-d fallback (`ALLOW_FALLBACK_EMBEDDINGS`);
  any chunk embedded that way is incompatible and must be re-embedded or skipped.
- **Org identity mismatch.** `rag_documents.organization_id` is an `integer`; the vault is
  RLS-scoped by **org UUID** (`set_config('app.current_org_id', <uuid>)` in
  `advancedRAGPipeline.withTenantContext`). The migration must map int org id → org UUID per row.
- **CERV2 consumer has a latent cross-tenant bug.** `cerv2-ai-routes.ts:204` calls
  `ragService.search({...})` **without** passing `organizationId`, so today it retrieves
  across all tenants. The cutover to `ragRouter` must pass org scope — this is a fix, not just
  a move, and changes results.
- **Domain data has no vault home.** `rag_chunks.entities/keywords/concepts`,
  `rag_knowledge_graph`, `rag_queries` (analytics), and `rag_ingestion_jobs` have no
  equivalent in the vault. Their dependent features cannot be "migrated" — each is a
  rehome-or-retire **product decision** (see disposition table).
- **Live frontend.** `client/src/api/biotechRag.js` (9 functions) calls `/api/biotech-rag/*`
  directly with no fallback. Endpoints cannot be removed until the client is repointed.
- **A policy seam already exists.** `server/services/embedding-corpus-policy.ts` is the
  natural place to register a biotech corpus/embedding policy if we keep biotech as a
  named corpus the router targets, rather than physically merging stores.
- **Vault chunk column drift — resolve before P1.** The write path inserts
  `vault.document_chunks.content` (`vectorization-worker.ts:314`) while the read path
  selects `vault.document_chunks.chunk_text` (`advancedRAGPipeline.ts:680`). One of these is
  wrong or the schema differs by environment. The migrator's target column depends on this,
  and it may also mean the current vault read path returns empty `content`. Inspect the live
  `\d vault.document_chunks` and reconcile before writing P1.

---

## Endpoint disposition

| Endpoint | Disposition | Notes |
|---|---|---|
| `POST /ask` | **Migrate** → `ragRouter.query(intent:'regulatory_qa')` | after corpus unify |
| `POST /search` (core) | **Migrate** → `ragRouter.retrieve` | `includeGraph=true` branch is separate |
| `POST /synthesize` | **Migrate** → `ragRouter.query(intent:'project_scoped')` | multi-doc |
| `POST /regulatory/qa` | **Migrate** → `ragRouter.query` + `filters` | domain prompt kept |
| `POST /literature/review` | **Migrate** → `ragRouter.query(intent:'foresight')` | |
| `GET /documents`, `/documents/:id` | **Migrate** → vault metadata reads | |
| `POST /export/results` | **Migrate** → read from evidence/query log | depends on analytics decision |
| `POST /ingest`, `/ingest/batch` | **Rehome** → vault ingestion (`vectorization-worker`) | needs biotech entity extraction ported or dropped |
| `POST /search?includeGraph`, `/interactions/check`, `/biomarkers/correlate` | **Decision** | depend on `rag_knowledge_graph`; rehome KG to a canonical graph or retire |
| `POST /analyze/protocol`, `/patents/landscape` | **Rehome** → vault retrieve + domain prompt service | |
| `POST /ingest/regulatory-sources` | **Retire (likely dead)** | imports `regulatoryCrawler.js`, which does not exist |
| `POST /train`, `GET /train/status/:jobId` | **Decision** → vault ingestion job queue or retire | |
| `GET /analytics/queries` | **Decision** → unified retrieval observability (see enhancement) or retire | |

---

## Phased PR plan

- **P1 — Data migration script (reviewable here, run in real env).**
  Idempotent `rag_chunks`/`rag_documents` → `vault.documents`/`vault.document_chunks` migrator:
  per-row org-int → org-UUID map; copy 1536-d OpenAI embeddings as-is; re-embed or skip
  384-d fallback rows; record source `chunk_id` for traceability; dry-run + reconciliation
  count. No deletes.
- **P2 — CERV2 cutover + cross-tenant fix.** Repoint `generateWithRAG` to `ragRouter.retrieve`
  with proper org scope. Lowest-risk live slice (best-effort augmentation with existing
  fallback). Ships only after P1 data exists in the target org(s).
- **P3 — Pure-RAG endpoint cutover + frontend repoint.** Migrate the "Migrate" rows above;
  update `client/src/api/biotechRag.js` to the new surface; 301-style compatibility on the
  old paths during rollout.
- **P4 — Domain feature rehome/retire.** Resolve the "Decision" rows (KG, analytics, training,
  ingestion entity extraction). Each is its own PR with the product call recorded.
- **P5 — Drop `rag_*` tables + delete `biotechRagService.js`.** Only after P1–P4 land and a
  retention window confirms no traffic on the old surface.

Each PR is gated by: `ci:typecheck:no-regression` green, `eslint` clean, `audit:repo-health`
deltas 0, and — for P1–P4 — a manual validation run in an environment with a populated
corpus and embedding keys.

---

## Open product decisions (need an owner)

1. **Knowledge graph** (`rag_knowledge_graph`, drug-interaction / biomarker features): rehome
   onto a canonical graph service, or retire the features?
2. **Query analytics** (`rag_queries`, `/analytics/queries`): fold into the new retrieval
   observability work, or retire?
3. **Training/ingestion jobs** (`rag_ingestion_jobs`, `/train`): adopt the vault vectorization
   worker, or retire the bulk-training surface?
4. **Biotech entity extraction** on ingest: port into vault ingestion metadata, or drop?

Until these four are answered, P4/P5 cannot complete, so biotech cannot be *fully* removed —
P1–P3 are the safe, behaviour-improving slice that can proceed now.
