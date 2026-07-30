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

---

## 6. 2026-07-29 document-identity reuse investigation

### Decision

**Do not introduce a new document registry, alias table, or dossier-placement
table.** A proposed implementation did that before completing this reconciliation
and has been reverted in full. It duplicated existing platform primitives and
would have created another center of truth.

No production document-identity code should proceed until the interface decision
and schema collision in this section are approved.

### Requirement being reconciled

Every logical document needs one stable ID carried across client types and use
cases. Dossier assembly must map that document to:

- Project ID;
- application;
- sequence;
- CTD module and section;
- lifecycle operation; and
- jurisdiction-specific regional content.

### Existing assets — what is already present

| Required concern | Existing asset | Current capability | Reuse decision |
|---|---|---|---|
| Cross-module document record | `unified_documents` in `shared/schema/unified_workflow.ts` | Central record, status, organization, versions, workflow, audit | **Extend; do not replace** |
| Local/client record mapping | `module_documents` | Maps `(module_type, original_id, organization_id)` to one unified document with a uniqueness constraint | **This is the existing alias registry; extend it** |
| Transactional registration | `ModuleIntegrationService.registerDocument` | Creates unified document, initial version, module mapping, and audit entry in one transaction | **Use as the enrollment boundary** |
| Governed AI promotion | `promote-artifact` action | Promotes `concept2cure_artifacts` into `unified_documents` with a version and governed contract | **Preserve and route through canonical enrollment** |
| Generated artifact identity | `concept2cure_artifacts.artifact_id` | External artifact identity plus required project and organization, versions, signatures, provenance | **Treat as source identity until promotion** |
| Lifecycle submission | `submissions` | Application type, client type, primary region, lifecycle stage | **Extend with authoritative project/application reference** |
| Jurisdiction projection | `submission_regions` | Submission-to-region/pathway/profile mapping | **Reuse for regional context** |
| eCTD sequence | `ectd_sequences` | Region, four-digit sequence, type, validation/freeze/dispatch lifecycle | **Reuse unchanged** |
| Dossier leaf placement | `submission_leaves` | Sequence, section, lifecycle operation, source table/ID, parent leaf, checksum, organization | **This is the existing placement ledger; extend it** |
| Placement/governance contract | `GovernedDocumentContext`, `PlacementAuthorityDecision`, `GovernedDocumentActionContract` | Project, artifact/version, CTD section, dossier, regulator, placement target, lifecycle, actor, provenance and gates | **Use as the API/type contract** |
| Atom-level lineage | `document_atom_provenance` | Cross-table document UUID, eCTD section, purpose, jurisdiction, version, dependencies, provenance | **Supplementary provenance; not the primary registry** |
| Generic graph lineage | `provenance_links` | Tenant-scoped typed source-to-target edges | **Reuse for evidence relationships, not identity** |
| Governed filing | `c2c_documents` + `authoring_documents.c2c_document_id` | Filing system of record and editor binding | **Integrate via existing unified/module mapping after contract approval** |

### Why the proposed new tables were duplication

The reverted `platform_documents` table repeated the role of
`unified_documents`. The reverted `platform_document_aliases` repeated the role
of `module_documents`. The reverted `document_dossier_placements` repeated the
combination of `submission_leaves`, `ectd_sequences`, `submissions`, and
`submission_regions`. The proposed repository also repeated the transactional
registration already implemented by `ModuleIntegrationService.registerDocument`.

The new design did add a UUID and stricter immutability, but those are gaps to add
to the existing model—not sufficient justification for a parallel model.

### Critical discovery: `unified_documents` itself is not reconciled

There are at least two incompatible definitions/usages of the same physical table:

1. `shared/schema/unified_workflow.ts` models `unified_documents.id` as a serial
   integer and is used by workflow, review board, AI actions, module integration,
   and canonical eCTD leaf materialization.
2. `server/services/unifiedDocumentIngestion.js` generates a UUID for `id` and
   writes a much wider ingestion schema (`processing_id`, file fields,
   `document_version_id`, eCTD fields, `tenant_id`, and others).
3. Consolidated legacy migrations also disagree about whether version foreign
   keys point to `id` or `document_version_id` and whether the primary ID is
   integer or UUID.

This collision must be resolved before choosing the durable platform ID. Adding a
third registry would hide rather than solve it.

### Existing coverage and gaps

#### What already works

- `module_documents` already prevents one local module record from mapping to
  multiple unified documents within an organization.
- `ModuleIntegrationService.registerDocument` already gives registration atomic
  document/version/mapping/audit semantics.
- AI action handlers already route unified documents to modules and preserve
  project/section/action provenance in mapping metadata.
- `submission_leaves` already represents source document to CTD leaf placement,
  while `ectd_sequences` supplies sequence, region, and lifecycle context.
- Governed document contracts already fail validation for missing project,
  dossier placement context, lifecycle, provenance, and export readiness.

#### What is missing

- A stable external UUID on the existing `unified_documents` record. Its current
  canonical workflow ID is an integer, while other stores expose text/UUID IDs.
- A real `project_id` column and tenant-safe FK on workflow `unified_documents`;
  project is often buried in JSON metadata.
- A resolved schema contract for the two incompatible `unified_documents`
  implementations.
- Broader mapping vocabulary in `module_documents`: the current enum covers
  product modules, not every source/client table or integration.
- Enrollment of all production document writers through the existing module
  integration boundary.
- An authoritative application identifier on `submissions`; runtime assembly
  currently accepts an application string separately.
- Strong controlled values and constraints for `submission_leaves.lifecycle_op`,
  CTD section/module, and region-specific Module 1 content.
- Explicit predecessor links for replace/append/delete lifecycle operations.
- RLS/tenant-negative tests across the complete unified/module/submission chain.
- Historical reconciliation and governed correction workflow.

### Recommended target — extend the existing center of truth

Subject to interface approval, the smallest convergent design is:

1. Add an immutable, unique `document_uid UUID` to the **existing** workflow
   `unified_documents`; retain the integer PK for internal FKs and compatibility.
2. Add an authoritative tenant-scoped `project_id` to that table. If integer
   projects and UUID regulatory programs must coexist, first approve a canonical
   project registry or a typed `(project_namespace, project_key)` contract.
3. Generalize `module_documents` into the supported cross-client identity map
   without creating a second alias table. Preserve its existing unique local
   reference constraint and add actor/time/correction evidence as required.
4. Make `ModuleIntegrationService.registerDocument` the only new-document
   enrollment service; have ingestion, coauthor, governed filing, Vault, QMS,
   labeling, RAG, device, and artifact promotion adapters call it in their owner
   transactions.
5. Keep `concept2cure_artifacts.artifact_id` as the pre-promotion source identity;
   persist the promotion mapping in `module_documents` rather than inventing a
   second document record.
6. Extend `submissions` with project and application identifiers. Keep
   `ectd_sequences` for sequence and jurisdiction, `submission_regions` for
   regional profiles, and `submission_leaves` for document placement.
7. Point each new `submission_leaf` at the unified document ID (or document UID)
   while retaining a transition adapter for historical polymorphic references.
8. Add lifecycle predecessor/supersession fields, assembly-run idempotency, RLS,
   audit events, and governed correction to those existing tables.

### Approval gates before implementation

#### Gate A — interface contract

- Choose `document_uid` semantics and confirm it identifies a logical document,
  not a version, file, artifact, or dossier leaf.
- Choose the canonical project namespace and application identifier.
- Approve the client/source vocabulary replacing or extending `module_type`.
- Approve whether a document may belong to multiple projects; if yes, use a
  project association table rather than a single project column.

#### Gate B — physical schema reconciliation

- Inventory production `unified_documents` columns and types from a real database.
- Select the authoritative Drizzle definition and quarantine the incompatible
  ingestion/legacy definition.
- Reconcile version storage and foreign keys without destructive inference.
- Prove repeatable migration on empty, current, and representative upgraded DBs.

#### Gate C — writer coverage

- Check in a complete producer matrix with owner, source table, enrollment
  adapter, project source, and API behavior.
- Add CI that rejects a new regulated-document insert unless it uses the approved
  enrollment boundary.
- Migrate writers in owner-reviewed batches; do not mass-edit 40+ paths at once.

#### Gate D — dossier and governance proof

- Demonstrate project → submission/application → sequence/region → leaf/section
  → lifecycle predecessor reconstruction for at least FDA and EMA.
- Test cross-tenant denial with the production DB role and RLS enabled.
- Test retries, correction, version continuity, restore, and audit-chain evidence.

### Current readiness after reconciliation

**Design readiness: 55/100. Implementation readiness: 20/100. Production
readiness: 0/100 until Gates A and B are approved.**

The correct next deliverable is an approved extension contract and physical
schema audit—not another migration or new subsystem.

### Gate B instrumentation now in place

`scripts/db/readiness-audit.mjs` now fails its static readiness check when the
serial workflow schema and UUID ingestion writer coexist. When a database URL is
available, it also inventories the physical `unified_documents` columns and
reports whether the deployed table matches the workflow contract, is absent, or
contains the mixed legacy ingestion column family. This is deliberately a
read-only gate: it gathers the evidence required for reconciliation and performs
no DDL or data mutation.

### First convergence change

The legacy ingestion writer no longer inserts its UUID-shaped record directly
into `unified_documents`. It now enrolls new uploads through the existing
`ModuleIntegrationService.registerDocument` transaction and creates later
versions through its tenant-scoped `updateDocument` path. The rich ingestion
payload is retained in the unified version content and metadata. Unsupported
module names and missing tenant/project/actor scope fail closed. This removes the
known integer-versus-UUID writer collision without adding a table or changing the
physical schema.
