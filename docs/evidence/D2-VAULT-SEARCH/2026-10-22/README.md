# D2: Vault search takes metadata filters (VR-18, Veeva gap 7 slice B, server half)

**Launch row:** D2. **Workstream:** Vault, Veeva gap 7 (`docs/design/VEEVA_GAP_2026-10-22.md` §7).
**Naming (Rule 3):** this *completes* VR-18 (`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`) by
*extending* the one search query and *extracting* the public API's metadata predicate. Nothing here is a new search.
**Founder decision:** FD8 is amended (2026-10-22). Facets were "deferred", and the founder's direction
to close the gap with Veeva lifts that. The amendment is recorded in the parity plan §5 with the founder's
words. Saved views are not covered by it; see "What remains".

## What already exists

| Path | What it did | What it did not do |
|---|---|---|
| `server/services/vault/vault-search.ts` `searchVaultDocuments` | The one search query, used by `GET /:id/search`, `GET /search`, AnA `search_project_documents` and MCP `c2c_search_vault_documents`. Org at `$1`, query at `$2`, permitted programs at `$3`. Count and page share one `where`. Scope is re-verified after the reads. | It had no metadata predicate and could not run without a text match. It did not return evidence kind, classification, update time or stage. |
| `server/routes/c2c/project-vault.ts` `GET /:id/search`, `GET /search` | Take `q`, `limit`, `offset` and `includeSuperseded`. An empty `q` answers `EMPTY_QUERY`. An error is `500 SEARCH_FAILED`, never an empty list. | They took no filter. |
| `server/services/vault/vault-document-index.service.ts` `listVaultDocuments` (public `/api/v1/documents`) | The only metadata filters: classification, document type and CTD section (exact), with count and page sharing one `where`. | API-key holders only, with no in-app caller. Its predicate was private to it. |
| `project-vault.ts` `GET /:id` (the tree) | Counts "unfiled" and "suggested" program-wide, and reads each head's lifecycle stage through a LATERAL join on `canonical_documents`. | Its definitions were inline, so a filter written elsewhere could disagree with them. |
| `shared/regulatory/section-code.ts` `normalizeCtdCode`, `ctdCodeWithin` | The one rule for CTD identity and whole-segment ancestry. | It had no SQL form. |
| Deleted: `server/api/vault/routes.ts` (`86d177ba9c`) | Had this filter list as a second list query. | Removed for cross-tenant reads. The lesson applied here: a filter rides the canonical predicate and is never a new query. |

Searches run, by name: `searchVaultDocuments`, `listVaultDocuments`, `document_type =`, `classification =`,
`placement_status`, `ctd_section`, `facet`, `filter` over `server/`, `client/src/concept2cure/v2/`, `shared/`.
History: `git log --all --diff-filter=D` on `*vault*search*`, `*Filter*`, `*facet*`. Most of that came from the
gap 7 Rule 3 map (6 readers and a plan, workflow `wf_50415ddd-425`).

## What changed

- **`server/services/vault/vault-document-filter.ts` (one module, extracted):**
  - `parseVaultFilters` reads `documentType`, `classification`, `evidenceKind`, `folderId`, `placementStatus`, `ctdSection` and `lifecycleStage`. Each can be repeated or given as a comma list, with at most 20 values.
  - Every value is checked against the vocabulary the write paths use:
    - `VAULT_INGEST_DOCUMENT_TYPES`, `VAULT_CLASSIFICATIONS`, `VAULT_DOC_KINDS`;
    - the project view's folders;
    - the tree's three filing statuses;
    - `DOCUMENT_STAGES` plus `none` ("Not sent for review");
    - `normalizeCtdCode`.
  - A value outside them is a 400 that names the parameter and, for a closed list, the allowed values. `processingStatus` is refused by name, as the public API already refuses it.
  - `vaultFilterSql` appends conjuncts after the existing bind positions. The shared fragments are `vaultUnfiledSql`, `vaultSuggestedSql`, `ctdWithinSql` (whole segments, the SQL twin of `ctdCodeWithin`) and `vaultLifecycleStageSql`.
- **`vault-search.ts`:**
  - `filters` narrow the shared `where`.
  - With filters and no text, the query **browses** the filtered set, newest version first (`created_at`, the tie-break the search already uses). `$2` is bound as null and referenced as `$2::text IS NULL`, so no bind position moves. The SELECT is the same in both modes: `ts_rank_cd` and `ts_headline` are strict, so with a null query they return null and do no work.
  - Each hit carries `evidenceKind`, `classification`, `lifecycleStage` and `updatedAt`. The tree already shows these to the same readers.
  - The result says `mode: 'search' | 'browse'`.
- **Both routes:**
  - They parse the filters before anything is read.
  - `EMPTY_QUERY` is answered only when there is no text **and** no filter.
  - They echo `filters` and `mode`.
  - `/:id/search` checks a folder against that project's cabinet (`resolveVaultView`).
  - `/search` refuses a folder (it spans projects) and takes a repeatable `programId` that narrows through `allowedProgramIds` and never widens.
- **Convergence (zero duplication):**
  - `listVaultDocuments` builds its three filters through `vaultFilterSql` and keeps its exact CTD match (FD-g).
  - The tree's unfiled and suggested counts, and its lifecycle stage, use the shared fragments, so a filtered total and the tree's count cannot drift.

- **The SQL-interpolation gate** (`ci:sql-interpolation`, a ratchet that only shrinks) counted the shared fragments as three new interpolations in `project-vault.ts` and one in `vault-search.ts`. No baseline was raised. The fragments take one literal alias and no value. `vaultLifecycleStageSql` correlates on `d.organization_id`, which both callers bind to the caller's organisation in the same statement. They are registered as caller-scoped proofs in `scripts/ci/lib/approved-sql-predicates.mjs`, the mechanism P-41 used for commitment fulfilment. The gate's selftest passes (23).

## Contract

```
GET /api/c2c/project-vault/:id/search?q=&limit=&offset=&includeSuperseded=
    &documentType=CSR&documentType=SAR  &classification=CONTROLLED  &evidenceKind=cmc
    &folderId=module-3  &placementStatus=unfiled|suggested|confirmed  &ctdSection=3.2.P  &lifecycleStage=approved|none
200 {success, data:{query, mode, filters, total, limit, offset, includeSuperseded, results:[…, evidenceKind, classification, lifecycleStage, updatedAt]}}
200 {…, reason:'EMPTY_QUERY'}                   no text and no filter (unchanged)
400 {success:false, error:'INVALID_FILTER', parameter, allowed?, message}   no corpus read
400 {success:false, error:'UNSUPPORTED_PARAMETER', parameter:'processingStatus'}
500 SEARCH_FAILED                                (unchanged)
GET /api/c2c/project-vault/search: the same without folderId, plus &programId=<uuid> (narrows only)
```

## What did not change

- The org predicate is literal in every statement. `params[0]` is the org and `params[2]` the program list.
- Count and page share one WHERE, and there are exactly two vault reads. The extended tenant-scope test pins all of this, for both a filtered search and a filtered browse.
- The GIN expression is character-identical. Current versions only by default.
- AnA search passes no filters and behaves as before.
- Public API responses are unchanged (`public-api-documents.test.ts` and `vault-document-index.pglite.integration.test.ts` green).
- No schema change.

## Verified by making the checks fail

`red.txt` holds the new tests run with the filter module present but `vault-search.ts`, `project-vault.ts` and
`vault-document-index.service.ts` at their previous state: **26 failed**. Each failure is the case the test exists
to catch: filters ignored, `EMPTY_QUERY` instead of a browse, 200 instead of 400, and the public API holding its
own predicate (the source guard). `green.txt` holds the same files and the wider Vault and c2c suites after the change.

Two PGlite fixtures lacked columns the real table has (`classification`, `evidence_kind`, `updated_at`) and the
`canonical_documents` table. They now carry them, and the paging test applies the real migration
(`20260731c_canonical_documents.sql`).

## What remains (this slice's claim on the board)

1. **The find view's filter controls** (`Vault.tsx`, converging its search onto `useProjectVaultSearch`), and the
   files-rail defect (`ProjectFilesPanel.tsx` `hitToDoc` keys a hit by its bare uuid where the tree uses `up-<uuid>`).
2. **Facet counts** (`facets=true`): one `GROUP BY` per dimension over the predicate minus that dimension's own filter.
3. **Saved views:** a founder decision on who owns a view (each user or the organisation) and where it is stored.
   The existing `saved_precedent_queries` is precedent-only and is not on the deploy path.
4. **Performance on a deploy-shaped database:** browse has no text match to narrow it, and `document_type`,
   `classification`, `ctd_section` and `evidence_kind` have no indexes. Measure before adding any (additive,
   `IF NOT EXISTS`, on `C2C_MIGRATION_FILES`, per Rule 1).
