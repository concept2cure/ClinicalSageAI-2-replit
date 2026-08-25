# C2C Canonical Service and Store Map

**Work order:** WO-00 (required investigation items 3, 4, 8)
**Base SHA:** `2a5b46d1f7977a0b5cc3352c8982ea1c2a42aa22`
**Evidence standard:** derived by reading code. No prior document treated as evidence.

Classification vocabulary per WO-00 item 4: **canonical**, **transitional**,
**legacy**, **duplicate**, **experimental**, **unmounted**, **dead**.

A path is only marked `duplicate` when a competing implementation writes the same
store or serves the same responsibility. High caller counts alone do **not**
indicate drift — see §2, where a deliberate three-layer design initially looked
like duplication.

---

## 1. Master §3 foundations — verified present

Every foundation named in master work order §3 exists at this SHA.

| Concern | File | Lines | Class |
|---|---|---:|---|
| Surface renderer map | `client/src/concept2cure/v2/surfaceViews.ts` | 213 | canonical |
| Surface registry | `shared/constants/ui-surface-registry.ts` (+`.ui-v2.ts`) | 944 + 830 | canonical |
| Authoring workspace routes | `server/routes/document-authoring-workspace.routes.ts` | 376 | canonical |
| Collaboration REST | `server/routes/realtime-collab.ts` | 609 | **transitional** — see §3 |
| CRDT server | `server/services/hocuspocus-server.ts` | — | canonical, **client-unbound** |
| eCTD compile | `server/services/pdev/pdev-ectd-compile.ts` | 175 | canonical (one of several — §6) |
| Submission Twin | `server/services/submission-twin-service.ts` / `routes/submission-twin.ts` | 1533 / 323 | canonical |
| StudyDesign types | `server/services/study-design/study-design-types.ts` | — | canonical |
| Study Twin | `server/services/study-design/study-twin-service.ts` | 261 | canonical |
| Assumptions | `server/services/assumption-registry-service.ts` | 640 | **duplicate** — C-1 |
| Decisions | `server/services/decision-record-service.ts` | 515 | **duplicate** — C-2 |
| Contradiction engine | `server/services/contradiction-engine-service.ts` | 1600 | canonical (store conflicted — C-3) |
| Regulator overlays | `server/services/regulator-overlay-engine.ts` | 431 | canonical (store conflicted — C-3) |
| Resolution executor | `server/services/resolution/bundle-executor.ts` | 740 | canonical, **receipt not persisted** — C-4 |
| AnA orchestrator | `server/services/ana-ri/orchestrator.ts` | 1899 | canonical |
| Command executor | `server/services/ana-ri/command-executor.ts` | 4745 | canonical (76 registry / 70 handlers) |
| Corpus writer | `server/services/corpus/drizzle-corpus-writer.ts` | 108 | canonical (§4) |

---

## 2. AI gateway and embeddings — canonical, with real bypasses

### 2.1 The gateway is genuinely dominant

`server/services/ai-gateway/*` is referenced by **129** non-gateway server
modules. It is unambiguously canonical. It owns policy (`policy.ts`), audit
(`audit.ts`), prompt-injection detection (`promptInjection.ts`), provider
placement, and retry.

### 2.2 Embeddings are correctly layered — not duplicated

An early caller count suggested `enhancedEmbeddingService.ts` (16 importers) was
displacing the gateway's `embedding-provider.ts` (4 importers). **It is not.**
Reading the code:

- `enhancedEmbeddingService.ts:24` imports `getEmbeddingProvider` *from the
  gateway*. It is a layer on top, not an alternative.
- `embedding-corpus-policy.ts` explicitly names it "the single approved runtime"
  and declares the corpus→model→dimension policy as data.
- A CI guard exists and is wired: `scripts/ci/check-embedding-runtime-canonicality.mjs`,
  invoked from `.github/workflows/ci.yml` via `npm run ci:check-embedding-runtime`.

**Classification: canonical, three-layer (gateway provider → approved runtime →
corpus policy).** The higher caller count on the middle layer is the intended
design. This is recorded because it is a false-positive trap for future audits.

The policy governs **eight** pgvector corpora:

| Table | Dimensions |
|---|---:|
| `document_vectors` | 3072 |
| `rag_chunks` | 1536 |
| `knowledge_entries` | 1536 |
| `client_memory_entries` | 1536 |
| `project_memory_entries` | 1536 |
| `account_canon_items` | 1536 |
| `biostat_knowledge_nodes` | 1536 |
| `vault.document_chunks` | 1536 |

*(The policy header describes "seven"; the table lists eight. Minor doc/code drift
inside one file — flagged, not blocking.)*

### 2.3 Genuine gateway bypasses

| Path | Lines | Non-test importers | Class |
|---|---:|---:|---|
| `server/openai-service.ts` | 617 | 13 | **legacy — bypass** |
| `server/services/openai-service.ts` | 268 | — | **legacy — bypass, zero gateway refs** |
| `server/services/openai-client.ts` | 72 | — | legacy — direct SDK |
| `server/services/anthropic-client.ts` | 55 | — | legacy — direct SDK |
| `server/services/advancedRAGPipeline.ts` | 1474 | — | transitional — direct SDK |
| `server/services/ai/LiteLLMAdapter.ts` | — | 1 | experimental |
| `server/services/ai/openai-orchestrator.ts` | — | 2 | experimental |

**Two distinct files are both named `openai-service.ts`** (`server/` and
`server/services/`). The `server/services/` one contains **zero** references to
gateway policy, audit, or prompt-injection.

**Mitigating control:** `scripts/ci/check-gateway-bypass.mjs` exists, has an npm
alias (`ci:gateway-bypass`), **and is CI-wired** (`.github/workflows/ci.yml:95`),
with a baseline at `scripts/ci/gateway-bypass-baseline.json`. So bypasses are
frozen, not unbounded. WO-02 §2 should ratchet the baseline down rather than
build new machinery.

---

## 3. Collaboration — split brain

| Component | Reality |
|---|---|
| `server/services/hocuspocus-server.ts` | Real Hocuspocus/Y.js CRDT server. JWT-verified in `onAuthenticate`. Mounted at `server/startup/services.ts:284`. Listens at **`/collab`**. **canonical** |
| `server/routes/realtime-collab.ts` | Express REST only. **No `yjs` import.** Presence, locks, awareness heartbeat. Advertises `/ws/collab/:roomKey` at `:372` — a path nothing serves. **transitional** |
| `client/.../AuthoringCollab.tsx` | Polls the REST service. References y-websocket only in a comment. **No `HocuspocusProvider` anywhere in `client/src`.** |

Client dependencies are already installed: `@hocuspocus/provider` 4.1.0,
`@tiptap/extension-collaboration` 3.23.4, `-collaboration-cursor` 2.26.2,
`@tiptap/y-tiptap` 3.0.2, `y-prosemirror` 1.3.7, `yjs` 13.6.30.

**Consequence:** WO-04 is a client-binding and path-reconciliation task, not an
infrastructure build. The REST presence/lock layer must be retained as the
*governance* control (locks are authority; CRDT awareness is presence) — these are
complementary, not redundant.

---

## 4. Evidence corpus

| Path | Class | Note |
|---|---|---|
| `server/services/corpus/drizzle-corpus-writer.ts` | **canonical** | Writes `csr_reports` + `csr_details`, idempotent on `nct_id`. Implements the `CorpusWriter` interface so `ingest-ctgov.ts` stays IO-free. |
| `server/data-importer.ts` | **duplicate — needs review** | Also writes `csr_reports`. |
| `server/seed.ts` | acceptable | Seed path; must remain non-production. |
| `server/services/corpus/precedent-benchmark-reader.ts` | canonical (read) | |
| `server/services/corpus/live-ctgov-fetcher.ts` | canonical (fetch) | |

**Open item:** `server/data-importer.ts` writing `csr_reports` directly conflicts
with master §2 *"no direct writes from experimental or alternate services into
core regulated artifact tables."* Requires a caller analysis before WO-11.

---

## 5. Operating-system stores — conflicted

See `C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md` for full DDL diffs.

| Store | Drizzle owner | Raw-SQL owner | Class |
|---|---|---|---|
| `assumption_records` | `shared/schema/operating-system.ts:146` | `assumption-registry-service.ts` | **duplicate (C-1)** |
| `decision_records` | `shared/schema/operating-system.ts:281` | `db/migrations/20260323` shape | **duplicate (C-2)** |
| `contradiction_findings` / `_overlay_rules` / `_consequence_log` | two DDLs | — | **duplicate (C-3)** |
| `contradiction_links` | `migrations/0010:356` | written by `assumption-registry-service.ts:173,205` | transitional |
| `ai_kernel_decision_records` | `db/migrations/20260324` | — | **third decision concept — classify before WO-03** |
| Resolution receipt | **none — no table exists** | — | **missing (C-4)** |

### 5.1 Why the tests did not catch this

`server/services/__tests__/operating-system.test.ts:31` calls
`vi.mock('../../db')` and replaces the entire Drizzle surface with
`vi.fn()` stubs. The suite passes (98 tests green, verified in this pass) **without
ever touching a real schema.** The collision is invisible to the test suite by
construction.

**WO-02 §5 consequence:** a schema-contract test tier that runs against a real
(or pglite) database is required. Mocked-DB unit tests cannot satisfy master §8
item 2 ("schema/contract tests").

---

## 6. eCTD packaging — multiple candidate publishers

Master §3 names `pdev-ectd-compile.ts` (175 lines) as the compile foundation, but
ZIP/packaging capability is spread across at least:

- `server/src/services/ectd.ts`
- ~~`server/services/ectdExportService.ts`~~ *(RETIRED in the slice-5b consolidation — callers migrated to `ectd/assemble-from-core.ts` + `submission-gateways/regional-packager.ts`, the one canonical generator)*
- `server/services/submission-gateways/regional-packager.ts`
- `server/services/pathway-engines/mdr-ivdr/technical-file-packager.ts`
- `server/services/docx/masterDocumentBuilder.ts`
- `server/services/etmf/tmf-inspection-package.ts`

Archive libraries present: `archiver` 7.0.1, `adm-zip` 0.6.0, `jszip` ^3.10.1 —
**three** ZIP libraries.

**Not yet classified.** WO-05 item 1 ("inventory and select the canonical eCTD
package service") requires a dedicated caller analysis that exceeds WO-00's audit
scope. Recorded here as an open owner assignment, not a finding.

---

## 7. CI enforcement posture — stronger than assumed

This was measured wrong **twice**, and both errors inflated the apparent gap.

1. Searching workflows for each guard's *script filename* missed that workflows
   invoke guards through `npm run ci:*` **aliases**. That produced "only ~7 of 38
   wired."
2. Correcting for aliases still missed that four guards run inside an **aggregate
   suite** — `ci:reasoning-tier-readiness` executes
   `check-governed-export-routes`, `check-governed-export-consequence-shape`,
   `check-reasoning-tier-ga-readiness` and `check-reasoning-tier-uat-evidence`
   (`scripts/ci/check-reasoning-tier-readiness-suite.mjs:7-10`). That produced
   "30 of 38 wired, 2 governed-export guards unwired."

**Verified figure: 37 guard scripts, 34 CI-covered** once aliases and aggregates
are resolved. The three not covered are:

| Script | Nature |
|---|---|
| `check-env-var-docs.mjs` | **advisory reporter — exits 0.** Wiring it would be a no-op gate; making it blocking requires documenting ~40 env vars first. |
| `report-branch-drift.mjs` | reporting, not a gate |
| `generate-test-summary.js` | helper, not a guard |

So **there is no meaningful unwired guard.** Guards already blocking in `ci.yml`
include migration prefix collisions, RLS allowlist sync, tenant column types,
tenant isolation (no-regression), dev-auth-in-prod, password hygiene, SAML
fail-closed, design system, regulated delete audit, route mount audit, route
ownership matrix, **gateway bypass**, JWT verify pinned, legacy dep quarantine,
no-mock-in-prod-routes, JS/TS shadows, and the docx/pdf/embedding runtime
canonicality checks.

**The genuine gap was different:** no guard detected *duplicate table DDL across
the two migration lineages*, which is how C-1/C-2/C-3 passed CI. WO-02 closes it
with `scripts/ci/check-duplicate-table-ddl.mjs` (`ci:duplicate-table-ddl`),
wired blocking, baselined at the 72 pre-existing collisions.

**WO-02 should verify and ratchet, not rebuild.** The genuine gap was that no guard detected duplicate table DDL across both
migration lineages — closed in WO-02 by `ci:duplicate-table-ddl`.

---

## 8. Migration tooling — complementary blind spots *(root cause of C-1…C-3)*

| Tool | Directory scanned | Detects |
|---|---|---|
| `scripts/db/sync-migration-manifest.mjs:8` | **`db/migrations/` only** | manifest generation, prefix conflicts |
| `scripts/ci/check-migration-prefix-collisions.mjs:44` | **`migrations/` only** | 4-digit prefix collisions |

Neither tool scans both directories. **Neither checks table-name collisions at
all.** The two guards have exactly complementary blind spots, which is why 72
cross-directory duplicate table definitions — including three core
operating-system tables — pass CI cleanly today.

The prefix guard additionally carries a baseline of four accepted collisions
(0007/0008/0010/0011) at `migrations/.prefix-collisions-baseline.json`.

---

## 9. Owner assignments

| Conflict | Proposed owner | Gate |
|---|---|---|
| C-6 migration lineage | ADR-0006 | blocks all schema work |
| C-1 / C-2 / C-7 operating-system schema | ADR-0007 | blocks WO-01, WO-03 |
| C-3 contradiction/overlay stores | ADR-0008 | blocks WO-07 |
| C-4 / C-5 receipt persistence | ADR-0009 | blocks WO-03, WO-08 |
| Schema-contract test tier | ADR-0010 | blocks WO-02 acceptance |
| eCTD canonical publisher | WO-05 item 1 | deferred, owner assigned |
| `data-importer.ts` corpus write | WO-11 discovery | deferred |
| `ai_kernel_decision_records` | ADR-0007 scope | blocks WO-03 |
