# RECONCILE.md — WO-1.0 audit (Phase 1: canonical core + ingestion)

> Temporary audit artifact required by WO-1.0. Classifies every Phase-1 table as
> `EXISTS` / `EXISTS-EXTEND` / `CREATE-NEW`, and records the API/path
> reconciliations the work order's assumptions got wrong. No Phase-1 code is
> written until this gate is reviewed.

Date: 2026-06-04 · Branch at audit time: `concept2cure-v2` == `claude/phase-1-submission-ingestion-IiIKE` (identical commit `9d0258b`, zero divergence).

---

## 1. Table classification

| Phase-1 table needed | Verdict | Notes |
|---|---|---|
| `submissions` | **CREATE-NEW** | No such table. `ctd_onboarding_projects` (`shared/schema/ctd-projects.ts`) is a *separate onboarding-ingestion* pipeline (region/submissionType/productName), **not** the lifecycle submission object the architecture §8.1 specifies. Do not overload it. |
| `submission_regions` | **CREATE-NEW (do create)** | Architecture §3 matrix + §8.1 model the same product filed across FDA/EU/JP with different pathways — multi-region per submission is real, so the join table is warranted. |
| `ectd_sequences` | **CREATE-NEW** | Work order's "binding decision" assumed the repo already names the backbone `ectd_sequences`. **It does not exist.** (`ectd_modules` exists — a *static module tree* referenced by `coauthor_documents.ectd_module_id` — but that is NOT the lifecycle sequence ledger.) Create the lifecycle table under the work-order name `ectd_sequences`. |
| `submission_leaves` | **CREATE-NEW** | As specced. FK `document_id` target = see §2. |
| `evidence_links` | **RENAME → `submission_evidence_links`** | The table `evidence_links` **already exists** (`shared/schema/programs.ts`, created by `migrations/20260524_program_workbench_schema.sql`) — a UUID-keyed `evidence_objects → target` graph with a required `evidence_id` FK, a different relation from Phase-1 document provenance. A `CREATE TABLE IF NOT EXISTS evidence_links` would silently no-op against it (breaking inserts) and the Drizzle export would collide. Phase-1 document provenance therefore lives in **`submission_evidence_links`** (CREATE-NEW). `source_document_id` target = see §2. A future task may unify the two graphs. |
| `documents` (FK target) | **RECONCILE — fork, needs decision** | **There is no `public.documents` table.** See §2. |
| `documents.embedding` (pgvector) | **ADD to chosen doc table** | The chosen canonical doc table (§2) has no embedding column. pgvector is already in use (`vault.document_chunks.embedding vector(1536)`, `csr-knowledge-db` `vector1536`), so the extension is effectively present; `CREATE EXTENSION IF NOT EXISTS vector` is safe. |
| `consistency_findings` | n/a | Deferred to Phase 3 by the work order. Not built. |

## 2. The `public.documents` problem (central reconciliation — BLOCKING)

The work order FKs `submission_leaves.document_id` and `evidence_links.source_document_id` to `public.documents(id)`. **No such table exists.** There are four document tables, none named plainly `documents`:

| Candidate | PK | Schema | Why it might be canonical | Why not |
|---|---|---|---|---|
| **`coauthor_documents`** | `serial` int | public | eCTD-authoring doc table: has `module_number` ("3.2.S.4.1"), `ectd_module_id`, status, org-scoped. Backs `server/routes/ectd-documents.ts`. **Recommended.** | content lives as HTML/TipTap, not a file blob |
| `ctd_onboarding_documents` | `serial` int | public | Ingestion-landing table; already has `ctd_module`, `ctd_section`, `document_type`, `extraction_confidence`, `extracted_data`, `validation_errors` — i.e. classify/extract outputs already have a home here | tied to `ctd_onboarding_projects`, not to the new submission/sequence backbone |
| `unified_documents` | `serial` int | public | generic workflow doc, integer PK | not eCTD-aware; `created_by` is `text`, not a users FK |
| `vault.documents` | `uuid` | `vault` schema | S3-backed, real file storage + embeddings (in chunks) | **UUID PK in a non-public schema** — violates the work order's integer-SERIAL / `public.*` FK convention |

**Recommendation:** FK to **`coauthor_documents`** (integer PK, public, eCTD-aware via `module_number`/`ectd_module_id`) and add the `embedding vector(1536)` + HNSW index to it. This is a decision the operator must confirm — it shapes the Phase-2 Builder tree.

## 3. API / path reconciliations (work-order assumptions vs. reality)

| Work order said | Reality in repo | Reconciled approach |
|---|---|---|
| Migrations numbered `migrations/XXXX_*.sql`, next integer | Repo uses **date-prefixed** `migrations/YYYYMMDD_*.sql` (e.g. `20260604_bla_workbench.sql`) | Follow repo convention: `20260604_submission_core_canonical.sql`, etc. |
| Drizzle schema in `shared/schema/*.ts` only | Active tables live in a single `shared/schema.ts` (815 KB) **and** domain files under `shared/schema/`, both re-exported via `shared/schema/index.ts`; `drizzle.config.ts` points at `./shared/schema.ts` | Add new domain file(s) under `shared/schema/`, re-export from `index.ts`; confirm `drizzle.config.ts` schema glob actually picks them up (it currently names `./shared/schema.ts` singular). |
| Audit via `@/services/audit/audit-service` → `auditLog.record({...})` | Real: `import auditService from '../services/auditService'` → `auditService.logAction({ organizationId, userId, action, resourceType, resourceId, details })` (default export, `class AuditService`) | Use `auditService.logAction(...)` with `action: 'AI_GENERATE'`. |
| AI via `aiGateway.generate({ task: 'document-classify', input, model, ... })`; "register task keys in the gateway task map" | Real: `getGateway().route(req)` / `.structuredOutput(prompt, schema, opts)`. `taskType` is a **fixed TS union** (`chat\|document_analysis\|structured_output\|regulatory_review\|...`), keyed into `Record<TaskType,...>` maps — adding kebab keys would break those records. `GatewayRequest` accepts `taskType, messages, maxTokens, promptVersion, jsonMode, jsonSchema, organizationId, userId, metadata`. | Call `getGateway().structuredOutput(...)` (or `.route({ jsonMode:true })`) with existing `taskType: 'document_analysis'`, pass `promptVersion: 'document-classify@v1.0'` + `metadata.task` to tag the logical task, and load the versioned prompt template from the new `prompts/` files. Honors "versioned prompts, no inline prompt logic" while matching the real gateway. |
| Extend `server/routes/documents.ts` | No such file. Closest: `server/routes/ectd-documents.ts`, `documents-unified.ts`, `document-routes.ts` | Extend `server/routes/ectd-documents.ts` (the eCTD doc router) — do not create a parallel router. |
| `prompts/` dir | **MISSING** under `server/services/ai-gateway/` | Create `prompts/document-classify/{v1.0.md,CHANGELOG.md}` and `prompts/document-extract/{...}`. |

## 4. Environment reality (gate-blocking — report, do not work around)

- **No `DATABASE_URL`** (nor `DATABASE_URL_ADMIN`/`NEON_*`) is set in this container. → `npx drizzle-kit push`, the dev server on :5000, the login/classify/extract `curl` checks, and `seed --verify` **cannot run here**.
- **`node_modules` is absent**; `drizzle-kit` and `tsc` binaries are not installed. → `npx tsc --noEmit` cannot run here either.
- The static grep gates in WO-1.6 *can* run; the DB/compile/runtime gates **cannot** until this runs in an environment with a database and installed deps.

Per the work order ("Stop at any completion gate that fails and report — do not work around it"), the first post-WO-1.0 gate (`drizzle-kit push`) is unreachable in this container.

## 5. Branch authority conflict (blocking the push, not the build)

Harness assigned `claude/phase-1-submission-ingestion-IiIKE`. `CLAUDE.md` (declared to OVERRIDE defaults), this work order, and `.husky/pre-push` all mandate **`concept2cure-v2` only** (the hook refuses any other ref unless `ALLOW_NON_CANONICAL_PUSH=1`). The two branches are currently the identical commit. Push target must be confirmed before any push.
