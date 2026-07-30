# Clinical Regulatory Evidence — End-to-End Integration Audit & Remediation

**Date:** 2026-07 · **Branch:** `concept2cure-v2` (post-#1150 convergence) · **Method:** four independent read-only traces (ingress, client use-cases, AnA/RAG/governance, convergence integrity) cross-checked against source, plus direct verification.

**Bottom line.** The module is architecturally complete and correct *where it is wired* — the converged facade's SQL matches the `cre_*` schema, tenant isolation (§13) holds on every read path, §14 governance and the prediction-governance boundary are enforced, the five AnA tools are registered and tested, and the suite is green. **But end-to-end it does not yet deliver evidence to a real tenant.** The data pipe is severed at both ends, with two concrete plumbing defects in the middle. This document is the audit of record and the remediation tracker.

---

## 1. Workflow map — where it breaks

```
INGRESS ────────────►  PROCESSING ──────►  EGRESS
FDA CRL → ingestCrl       cre_* tables         3 UI surfaces  ── FLAG-OFF (dark by default)
CSR     → adaptCsrReport  evidence-spine        5 AnA tools    ── WIRED, read EMPTY tables
                          governance §14         RAG atoms      ── BROKEN (dim mismatch) + unreachable
   ✗ NO LIVE CALLER        ✓ correct             ✓ read correctly, nothing to read
```

## 2. Findings (verdict + evidence)

### Ingress — SEVERED (P0)
- No live caller of `ingestCrl`, `adaptCsrReport`, `extractFindingsFromText`, or the spine writers `createFinding`/`createOutcome`/`upsertStudy`/`addRelationship`/`proposeDesignLesson` — all are test- or script-only (verified by repo-wide grep; the `contradiction-engine-service.createFinding` hits are a namesake private method).
- The only live writer is chat-upload → `createSource` (`server/routes/chat/upload.ts:420`), writing only `client_document` sources.
- `scripts/cre/generate-atoms.ts` cannot bootstrap CSR projection: it iterates `listSources(org,{sourceType:'csr'})`, but only `adaptCsrReport` creates such rows, and nothing calls it.
- **Consequence:** `cre_regulatory_findings`, `cre_regulatory_outcomes`, `cre_clinical_studies`, `cre_design_lessons` are **empty by construction**. Every downstream reader returns honest-empty.

### Atom embedding dimension — BROKEN (P0)
- Write path emits **1536-d** vectors (`retrieval-atoms.service.ts:62` `text-embedding-3-small`; `enhancedEmbeddingService.ts:72-78,149`).
- Committed column is **`vector(3072)`** / `text-embedding-3-large` (`db/migrations/20260125_add_atom_embeddings.sql:22-24`; SQL fns `search_atoms_semantic/hybrid` declare `vector(3072)`).
- The embedding `UPDATE … $1::vector` fails on the dimension error, is swallowed by a bare try/catch (`retrieval-atoms.service.ts:430-444`) → atoms land with `embedding = NULL` → vector search returns zero CRE atoms. CI misses it because the pglite test uses its own DDL without the real column.
- Secondary contradiction: the same migration family treats `lumen_data_atoms.id` as UUID while Drizzle/runtime treat it as serial int — two divergent schema lineages over this table.

### RAG reachability — DEAD-PATH (P1)
- AnA's project-scoped `project_knowledge_search` filters atoms to `source_type IN ('artifact','data_room_upload')` (`enhancedEmbeddingService.ts:465-469`), which **excludes** `clinical_regulatory_evidence`.
- No `ragRouter` intent targets CRE atom types; the default `vault` corpus is a different table (`vault.document_chunks`).
- **Consequence:** CRE atoms are unreachable via RAG even once embedded; CRE reaches AnA only via the 5 direct-spine tools.

### Client use cases (egress)
| Use case | Verdict |
|---|---|
| 5 AnA tools | **WIRED** (only working path; not flag-gated, tenant-scoped, registry-tested) — but read empty tables |
| CrlLibrary / CsrWorkflow findings+coverage / ProtocolDev coverage | **FLAG-OFF** (`ENABLE_CLINICAL_REGULATORY_GRAPH` unset everywhere) → WIRED once flag on + data |
| CsrWorkflow regulatory outcome | **BROKEN (client stub)** — `useLiveData(null)`; never calls `/outcome` |
| ProtocolDev 6 evidence accordions; `getTrace`; `runStressTest` | **STUB** — facade returns hardcoded `[]`/`null` |
| BiopharmaProject surface | N/A (uses `/api/biopharma/ctd`, not CRE) |

### Convergence integrity
- Schema↔query alignment: **CORRECT.** Row→DTO provenance: **CORRECT** (real columns; honest nulls). Outcome enum: **CORRECT** (guarded). Tenant isolation: **CORRECT** (every path). Lineage-drop cleanup (#1150): **CLEAN.**
- `discipline` enum: **RISK/defect** — unchecked free-text cast + `null → 'clinical'` fabricated default; `finding_domain` never mapped to `discipline`.
- `visibility` enum: **RISK** — `project_private → tenant_private` collapse (no mapper).

### Governance
- §14: **WIRED** — reply-path detection surfaced on `post_done`; hard atom-write self-gate.
- Prediction inference invariant: **WIRED (CI)** — boundary holds; runtime guard `assertInferenceFeaturesClean` unwired (nothing feeds it, so no live leak).
- Provenance: `fda_crl`/`clinical_regulatory_evidence` registered in `EVIDENCE_SOURCES`, but CRE tool handlers never build the `ProvenanceRecord` envelope → absent from `data_lineage_records`. **GAP.**

---

## 3. Remediation plan (status tracked here)

**P0 — nothing works without these**
- [x] **Ingress.** Live paths now exist end-to-end:
  - CRL → `ingestCrl`: `POST /api/clinical-regulatory-evidence/crl` (platform-admin; global-public FDA corpus). *(P0a)*
  - CSR → `adaptCsrReport`: `projectOrgCsrReports()` batch behind `POST /api/clinical-regulatory-evidence/project-csr` (tenant-scoped, idempotent) **and** the `project_csr_evidence` AnA tool. *(P0b)*
  - `generate-atoms` bootstrap fixed — it now **projects** the org's CSRs before atomizing, so `listSources('csr')` is populated instead of empty (adapt-before-atomize). *(P0b)*
- [x] **Embedding dimension.** Reconciled onto **1536** end-to-end:
  - `db/migrations/20260730_fix_atom_embedding_dimension.sql` creates/reconciles `lumen_data_atoms.embedding` to `vector(1536)`, fixes the `embedding_model` default, rebuilds the HNSW index (invalid at 3072 — pgvector caps HNSW at 2000 dims), and recreates `search_atoms_semantic`/`search_atoms_hybrid` on the 1536 signature returning `id INTEGER` (matching the real serial-int id + the caller's `h.id = oa.id` join; the old `id UUID` was wrong).
  - Registered in `scripts/db/migration-set.mjs` (the durable applier) — the old `20260125_add_atom_embeddings.sql` was never in it, so the column/functions were absent on real DBs; that file is now banner-marked SUPERSEDED.
  - Write path (`retrieval-atoms.service.ts`) no longer swallows the embedding failure — it logs it, so a future dimension mismatch is visible instead of a silent NULL corpus.
  - Backfill of pre-existing NULL atoms: `scripts/embed-atoms.ts` (best-effort). *(P0c)*

**P1**
- [x] **UI flag.** Already a documented runtime toggle, no rebuild needed: client
  `?crl-graph=1` URL param or `localStorage 'c2c-crl-graph'='1'`
  (`clinicalRegulatoryGraphFlag.ts`), over the `ENABLE_CLINICAL_REGULATORY_GRAPH`
  feature-flag default; server routes gate on the env var of the same name. Both
  are in the human-test walkthrough.
- [x] **`CsrWorkflow` outcome `null`-path.** `BiopharmaProject.tsx` now derives the
  application from the CRL findings on the board and calls `/outcome?applicationNumber=…`;
  it stays "Not verified" only when there is genuinely no application/outcome (never inferred).
- [x] **`discipline` / `visibility` mappers.** `index.ts` `normalizeDiscipline()` validates
  the free-text `fdaReviewDiscipline`, falls back to a `finding_domain→discipline` map,
  and buckets the undeterminable as `administrative` — never the fabricated `clinical`
  default (search filter uses the same normalization). `toVisibility()` preserves
  `project_private` instead of collapsing it into `tenant_private`.
- [ ] **RAG reachability — DEFERRED (documented).** CRE atoms are excluded from
  `project_knowledge_search` (source_type allowlist) and no `ragRouter` intent targets
  them. Deferred deliberately: CRE already reaches AnA through the five always-on
  direct-spine tools, so this only adds *semantic* discovery of CRE atoms; the change
  touches shared RAG routing used product-wide, so it carries regression risk
  disproportionate to a human-test demo. Revisit after the embedding backfill lands.

**P2**
- [x] **Provenance envelope.** The five CRE AnA tools now emit a `buildProvenance`
  envelope (registered `clinical_regulatory_evidence` / `fda_crl` sources, citation +
  caveat + confidence) — the platform's in-response provenance convention, the same
  one every other evidence tool uses. (Per-tool `data_lineage_records` writes are not
  the codebase convention — no AnA handler persists directly; the envelope is what the
  trace UI and audit consume.)
- [x] **Runtime prediction guard.** `assertInferenceFeaturesClean` wired at the real
  serving boundary (`regulatory-intelligence.ts`, on the assembled inference feature
  vector) — fail-closed defense-in-depth over the CI-enforced invariant. Verified
  across the full `scoreSubmissionDraft` integration suite.
- [x] **Facade evidence reads.** `getDesignEvidence` (endpoint-scoped FDA precedent +
  selected stress scenarios; indication-scoped arrays honest-empty because the
  design-node store carries no clean indication), `getTrace` (entity-ref → relationship
  chain), and `runStressTest` (findings-driven scenario selection, selected-not-run) are
  wired on real spine data.

**Human-testing readiness**
- [x] **Seed demo CRE evidence.** `scripts/cre/seed-demo-evidence.ts` (`npm run cre:seed-demo -- --org <id>`):
  a `[DEMO]` CRL (3 findings + verified outcome), a `[DEMO]` CSR + canonical study, and a
  governed design lesson — all tenant-private and labelled, never the shared corpus. Also runs
  `projectOrgCsrReports` to fold the tenant's own CSRs in. Idempotent; `--verify` prints counts.
- [x] **Human-test walkthrough.** `CLINICAL_REGULATORY_EVIDENCE_HUMAN_TEST.md` — apply schema →
  flag on (server env + client `?crl-graph=1`) → seed → exercise the 6 AnA tools and the v2
  surfaces, with the honest-empty panels named explicitly.

The spine itself needs no rework — this was connective tissue plus two schema/enum corrections.

---

## 4. Status — remediation complete

P0 (ingress + embedding), P1 (egress correctness + flag), **P2** (provenance envelope,
runtime prediction guard, facade design-evidence/trace/stress reads), and the demo seed +
human-test walkthrough are **all done and landed on `concept2cure-v2`**. The module is
exercisable end-to-end on a fresh tenant and every gap the audit found is closed or
explicitly, defensibly deferred.

**One deliberate deferral remains, documented, not a blocker:** RAG *semantic* reachability
for CRE atoms (the `project_knowledge_search` source-type allowlist + a `ragRouter` intent).
CRE already reaches AnA through the five always-on direct-spine tools, so this only adds
semantic discovery; the change touches shared RAG routing used product-wide, so it is best
sequenced after the embedding backfill rather than rushed. **Two honest data-model limits are
named where they surface:** the design-node store (`c2c_protocol_dev`) carries no clean
indication, so `getDesignEvidence`'s indication-scoped arrays stay honest-empty (endpoint-scoped
precedent + stress scenarios are populated); and the shared-corpus CRL library is best filled by
the platform-admin `POST /crl` path with real letters (the demo seed stays tenant-private by
design). The spine itself needed no rework — this was connective tissue plus schema/enum
corrections.
