# D2: Vault search counts each filter's values (VR-18 "with counts")

**Launch row:** D2. **Workstream:** Vault, Veeva gap 7 slice B.
**Naming (Rule 3):** this *completes* VR-18's last part on the one search query (`searchVaultDocuments`) and the
find view's existing filter row. No route, surface or UI file is added.
**Before it:** `docs/evidence/D2-VAULT-SEARCH/2026-10-22/` (server filters) and `…/2026-10-22-find-view/` (the filter row).

## What already exists

| Path | What it did | What it did not do |
|---|---|---|
| `server/services/vault/vault-search.ts` `searchVaultDocuments` | One tenant-bound predicate for the count and the page, with filters and browse. | It did not count values. |
| `server/services/vault/vault-document-filter.ts` | The one metadata predicate, with the tree's filing definitions and the lifecycle stage fragment. | It had no facet expression. |
| `client/src/concept2cure/v2/surfaces/Vault.tsx` `VaultFindFilterRow` | Type, Filing, Classification, Evidence kind, Review and CTD section. | Its options carried no counts. |
| `server/services/vault/vault-document-index.service.ts` (public API) | Filters only. | No counts. It is unchanged here. |

Searches run: `facet`, `GROUP BY` over `server/services/vault/` and `server/routes/c2c/project-vault.ts`, and `count` in
`Vault*.tsx`. The only counts the Vault had were the tree's program-wide unfiled and suggested totals, which already
share the filing fragments.

## What changed

- **Server:**
  - `facets=true` on the first page (`wantsFacets`; never on a later page) adds `facets` to both search routes.
  - It counts document type, classification, evidence kind, filing status, review stage and, within one project only, folder.
  - Each dimension is one `GROUP BY` over the search's own predicate, text included, **less that dimension's own filter**. So a chosen type still shows the other types' counts under the remaining filters.
  - Each statement has its own bind list beginning with the same org (`$1`), query (`$2`) and permitted programs (`$3`), and carries the org predicate literally.
  - A failed count fails the search with `SEARCH_FAILED`. It never reads as zero.
  - Filing and stage use the filters' own fragments, so a bucket and the filter it offers select the same rows.
  - A CTD section is filtered but not counted: it is a hierarchy, not a list.
- **Client:**
  - The find view asks for counts, and each option shows how many documents choosing it would select.
  - "Approved" and "Not sent for review" sum the canonical stages they cover.
  - Counts appear only from a verified read. A failed read, library mode, or a malformed facet list shows **no number at all**: an absent count is not zero. A value the verified read did not count shows (0).
- **The SQL-interpolation gate:**
  - `vault-search.ts` goes from 7 to 9 in `scripts/ci/sql-interpolation-baseline.json`.
  - The two new interpolations are the dimension's value expression, a fixed code map (`vaultFacetValueSql`) that no request reaches, and the search's own predicate, whose values are bound.
  - This is the case the gate's header prescribes a raise for ("for a genuine identifier, take it from a fixed allowlist in code, and raise this file's count in the same change, with the reason in the commit"), as `18c7bc16fa` did.

## Verified by making the checks fail

- **`red.txt`:** the new tests run against trunk's `vault-search.ts`, `project-vault.ts` and `Vault.tsx` give **5 failed**:
  - the three PGlite facet cases, including "each bucket equals `COUNT(*)` over the same predicate with that value chosen";
  - the tenant-scope case for every facet statement, which pins eight reads, each binding the org first and the programs third, and two reads on a later page;
  - the client's counts in the options.

  Three regression guards pass at trunk as they should: absent unless asked, no counts on a failed read, and no counts from a malformed list.
- **`green-server.txt`:** the Vault, c2c route, AnA source and public API suites after the change: 120 files, 1,348 tests, all passing.
- **`green-client.txt`:** every Vault surface and editor test after the change: 95 files, 1,010 tests, all passing.

## What remains

- **Saved views:** personal and organisation-wide (founder decision 2026-10-22, recorded as P-46). Their design workflow is running.
- **Performance on a deploy-shaped database:** six `GROUP BY`s on a first page with no supporting index on `document_type`, `classification`, `evidence_kind` or `folder_id`. Measure before indexing; any index must be additive, `IF NOT EXISTS`, and in `C2C_MIGRATION_FILES` (Rule 1).
- **Values outside the vocabulary** (for example a legacy lower-case `report` type) are counted but not offered, since the filter refuses them. So the options can sum to less than the total. A line naming the other recorded values would close that.
