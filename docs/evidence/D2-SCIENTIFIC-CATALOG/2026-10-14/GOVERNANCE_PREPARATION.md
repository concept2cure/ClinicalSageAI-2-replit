# Catalog context governance preparation

2026-10-14. Read-only preparation on `concept2cure-v2`, baseline HEAD `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Application files were inspected but not edited by this workstream. This is a proposal, not an approved contract, test result, domain qualification or deployed capability. Existing unrelated local D2/D7 edits were preserved.

## Reachable integration and scope

The smallest existing path is `catalog_project_document` → `completeCatalog` → `writeCatalogSuggestion` → GET `/api/c2c/project-vault/:programId/documents/:documentId/catalog` → `VaultCatalogRecord`. Keep the existing kind/purpose/summary/key-data resource, suggestion attribution, whole-record confirmation/correction and chained audit. No new surface, acceptance tool, event table, model or dependency is needed to expose an honest check scope.

Phase A can validate an **opt-in source-statement context binding** with deterministic checks and explicitly display its limits. It cannot deliver the complete scientific-catalog specification's independently accepted/rejected/corrected facts without the separate event persistence and review contract. AnA remains a proposer. `confirmed` and `corrected` continue to mean a person's decision on the catalog record as shown. They must never become a scientific-context acceptance badge, assay qualification, release approval or agency acceptance.

The existing `key_data` remains arbitrary nested strings/numbers. The current verifier walks values, not key labels or their relationships, across the entire extracted text. The preserved counterexample in `docs/reports/data-room-catalog-context-probe.mjs` permits `assayA_sensitivity: '99.2%'` when only Assay B states that value. No legacy key label may be auto-converted into a semantic property or acceptance decision.

## Current safeguards and concrete gaps

| Boundary | Existing protection | What Phase A must make explicit |
| --- | --- | --- |
| AnA handler, `document-catalog-tools.ts:474` | Catalog feature gate, Vault write role, open-project/program check, server-derived proposer/model/thread/turn | These checks precede the final transaction; role/actor/project admission must also be true at the write boundary |
| `completeCatalog`, `document-catalog.service.ts:324` | Vocabulary, org-scoped document loading, canonical data eligibility, recorded extraction/version, original-file requirement, aggregate full read coverage, all legacy value checks | Embedding is awaited after the checks; final write must recheck exact source text and current eligibility after that await |
| `writeCatalogSuggestion`, `document-catalog-governance.service.ts:170` | Catalog row id/content-hash lock; refuses replacement of a person's record; suggestion and chained audit commit atomically | No own role/actor/program/document/currentness/disposition admission; unchanged byte hash alone does not bind re-extraction or current source |
| `reviewCatalogRecord`, `document-catalog-governance.service.ts:368` | Vault write role, session actor, required revision, optional expected byte hash, org/program ownership, document/catalog locks, governed correction reason, atomic audit | Lock query omits canonical disposition and version-family currentness; contextual evidence needs a separate exact extracted-text binding |
| GET catalog, `document-catalog-governance.service.ts:482` | Org/program ownership and undeleted document; current byte/catalog join; client fails visibly on read error | No disposition/current-family restriction and no explicit verification scope; historical whole-record state alone proves no context check |
| `recordReadReceipt` / `getReadCoverage`, `document-catalog.service.ts:253` / `:279` | Exact spans indexed by document id/original byte hash; deferred AnA delivery avoids recording cut results | Receipts are accumulated across readers/threads and carry no extracted-text hash; do not claim the current actor or model read this extraction |

Both catalog UPDATE paths currently ignore their affected-row count before auditing/reporting success. The new writer must require exactly one `UPDATE … RETURNING` identity/hash/revision receipt. A SELECT-visible but UPDATE-denied RLS row can otherwise produce zero affected rows; the vector fallback must not convert an admission or zero-row failure into successful non-vector persistence.

The newer `admitAnaProjectScope` (`project-scope-admission.ts:102`) reads persisted active organization membership and canonical private-project sharing. Catalog helper scope checks do not use it. This is a static gap; no production bypass or runtime-role isolation result was demonstrated here. Reuse the canonical policy rather than copying private-project rules.

## Required source and candidate bindings

Every contextual proposal must name or obtain from the server:

1. Exact organization, canonical program/project anchor and authorized actor; model/thread/turn come from serving context, never model input.
2. Concrete Vault version row id, recorded organization/program, valid original-byte SHA-256, matching catalog byte hash and live parent program.
3. SHA-256 of the **exact stored extracted text**, calculated server-side. A catalog `updated_at`, title, character count or original-byte hash is insufficient.
4. Exact half-open integer ranges into that text and exact quote equality. Bound range/batch/quote sizes; reject non-finite values, unsafe integers, backwards/out-of-bounds ranges and unsupported discriminants.
5. An explicit requested data path/value and supported subject/property/context slots. Required slot witnesses must come from the permitted bounded source context. The same token elsewhere in the document is insufficient.
6. Canonical current-family and source-data eligibility, re-evaluated at the transaction/read boundary. Original-file availability remains a separate fact. Existing completeCatalog's refusal to change a `keep_data` original remains unless an explicit governed change is approved.
7. Canonical candidate/key-data digest, checker revision and a check result whose scope is `source_text_context_binding`, with remaining semantics recorded as `not_established`. Numeric precision, bound/range role and source-stated units are retained; no model computation/conversion or inferred pass verdict.

A lexical subject/property/value match supports the claim that those strings are bound in a supported source-stated context. It does not establish scientific truth, applicability, missing study metadata, table header relationships, interpretation of comparison methods or equivalence of populations/configurations. Unsupported tables/languages/OCR ambiguity remain explicitly not established; they must not silently pass.

## Persistence choices requiring control-tower selection

The existing legacy walker will attempt to verify offset numbers, hashes, schema strings and metadata leaves if a new object is simply appended to `key_data`. A new parser/encoder is necessary for any opt-in envelope.

- **Opt-in versioned key-data envelope:** preserve legacy values under a dedicated field and store requested anchors/context separately; readers decode only the exact discriminant and version. The write boundary creates the server receipt; reads recompute checks from current source text rather than trusting a stored `passed` flag. Preserve legacy objects unchanged, never wrap confirmed old rows automatically, and keep the panel's displayed values/review scope distinct from annotations. The root must own the exact discriminator, collision handling, bounds and shared DTO. This is the smallest read-path implementation with no migration.
- **Existing suggestion audit receipt:** preserve raw legacy `key_data`; record requested context plus source/key-data/checker hashes in the same chained suggestion audit. Reads resolve a receipt against the exact catalog proposal timestamp and hashes and recompute current checks. Missing/unreadable/no matching receipt is `not_recorded` or unavailable, never context pass. This avoids changing key-data shape but adds a projection over audit retention/history and requires explicit receipt-matching, pagination/performance and error semantics. It is not an independent per-fact event store or human approval.

Do not silently promote a legacy object whose keys happen to resemble metadata. Do not trust any model-supplied verification status, acceptance status, actor, model or check hash. The selected choice must ship a canonical encoder/decoder and a truthfully scoped view. No choice was implemented in this preparation.

## Transaction/race proposal

Keep all extraction/context checks pure, and keep embedding/model/file work outside the write transaction. Inside a short READ COMMITTED transaction, run the Vault role/actor/tenant preflight; take the existing document-disposition program advisory lock, reserve the catalog before documents, then freshly read and hold the live parent, exact Vault version and catalog. Recompute or compare the server-loaded exact extraction identity and deterministic candidate check before UPDATE + audit.

Current withdrawal takes SHARE reservations on its impact stores, including `vault.document_catalog` before `vault.documents`. Taking a Vault row lock first and only later requesting catalog DML can invert that order. A proposal for full local fencing is program advisory → catalog ROW EXCLUSIVE reservation → documents SHARE reservation → fresh eligibility/currentness + row/catalog locks, with existing bounded lock/statement timeout. SHARE on documents freezes successor insertion, deletion, move and same-byte extraction updates during the short receipt commit; it is global and its contention cost must be named and tested. Advisory-only or a selected-row lock alone is insufficient for arbitrary family mutation: the lineage successor trigger uses a different predecessor advisory key and reads the predecessor without a row lock. The control tower must choose and test the exact fence rather than claiming an untested race guarantee.

If source withdrawal/supersession/extraction changed before admission, refuse without catalog or audit write. If it occurs after the fenced commit, preserve the historical record and make current-use check state stale/unavailable. A dropped write response remains an unknown outcome consistent with the existing panel; this phase does not add idempotent per-fact review.

## Negative cases required before any success claim

1. Assay A labeled with Assay B value despite full legacy read coverage; swapped specimen, endpoint, arm, lot, firmware, cutoff, measured-result/specification roles.
2. Correct value repeated in a different bounded context; value/unit/header found only outside the claimed range; invented/missing context or source label.
3. Changed exact quote, offsets, character count, original hash, extraction hash, source id or candidate digest; same original bytes with different extraction; unsupported schema/language/table/OCR form.
4. Whole catalog confirmed/corrected legacy row remains a whole-record decision and no context/typed approval appears; metadata-like arbitrary legacy keys remain legacy; forged check/approval fields are rejected.
5. Wrong tenant/project/source, missing/inactive actor or membership, viewer, revoked/private-project access, deleted parent program, conflicting recorded document tenant.
6. Withdrawal/supersession/extraction mutation during pre-transaction embedding; real two-connection overlap at final admission; canonical successor insertion/move/undelete races.
7. `keep_data` text remains disclosed as retained with original unavailable; `remove_data` and terminal supersession cannot surface current grounded context. Historical decisions are not rewritten.
8. Stale shown record/extraction confirmation, repeated confirm, AnA replacement of a person's description, correction without reason, zero-row/RLS-denied UPDATE, vector fallback after admission failure, audit failure rolls back source/candidate metadata and state.
9. No requested contexts/empty key data yields `not_assessed`/`not_recorded`, not scientific pass; store/verification read errors remain unavailable, not assessed-empty. Existing legacy value-presence failures and full-read gate continue to fail.

Existing test seams are `document-catalog-key-data.test.ts`, `catalog-write-result.test.ts`, `document-catalog-tools-project-scope.test.ts`, `vaultCatalogRecord.test.tsx` and `tests/db/document-catalog-governed.dbtest.ts`. Required new race/tenant tests must state whether they exercised actual PostgreSQL and runtime RLS; an owner fixture or PGlite row proof cannot substitute for that claim.

## Ownership and deferred work

This agent can own narrowly scoped governance helpers/service changes and their focused tests after exact interfaces and ownership are approved. Core verifier/shared types, AnA tool schema/handler, HTTP route transport and client display must be assigned explicitly to avoid parallel edits. No prior D2/D7 recovery, storage, disposition, client or AnaToolExecutor file was changed during this preparation.

Independent per-fact revisions, acceptance/rejection/correction, event/audit CAS, idempotent review, immutable privileges, tenant export/purge and deployment qualification remain the separately specified future fact-event work. Phase A does not satisfy those future gates.
