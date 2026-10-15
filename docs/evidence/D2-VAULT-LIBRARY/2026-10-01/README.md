# Library search: every project's Vault at once (row D2)

**Plan item:** critique 15 of `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §4 ("Library search across
programs" had neither a slice nor an exclusion). **Date:** 2026-10-01. **Founder decision:** none.

## The finding

The Vault's search box searched one project. A reviewer looking for "the 2024 stability report" had to
know which project held it. Veeva's library search does not ask.

## The change

| Piece | File |
|---|---|
| **One search query.** `searchVaultDocuments` searches one program, or every program the organisation holds. It ranks full text over title, file name and body, using the GIN-indexed expression. The `total` is real, and current versions are listed unless earlier ones are asked for. Each hit names its program. The organisation is `$1` in the count and in the page, and the page joins the program for its name under the same predicate. The project search's query moved here unchanged, so the two searches cannot rank, count or scope differently. | `server/services/vault/vault-search.ts` |
| `GET /api/c2c/project-vault/search?q=&limit=&offset=&includeSuperseded=` is registered before `GET /:id`, which would otherwise take "search" for a project id. An empty query answers `EMPTY_QUERY`, and a failure answers 500 with "nothing was searched". `GET /:id/search` now reads through the same function, and its response shape is unchanged. | `server/routes/c2c/project-vault.ts` |
| **The Vault.** "All projects" beside "Include earlier versions". While it is on, the project search does not run. The list shows each hit with its project ("(this project)" for the open one), its version, and a content snippet as text. Each hit downloads through its own project. A failed library search says nothing was searched. | `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx`, `Vault.tsx` (`downloadVaultDoc` takes the hit's program), `styles/misc-surfaces-v2.css` |
| URS-VAULT-017, OQ-VAULT-18 (in the runner's step module), RA-001 v0.15, TM-001 rebuilt | `docs/validation/`, `tests/validation/oq/vault/steps-filing-compare.mjs` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-library-search.dbtest.ts`: PostgreSQL as `app_service` with RLS on, through the real ingest, check-in and routes. Two programs of one organisation, one of another. | `red/db-library.txt`: 3 of 4 fail on trunk (the request reaches `GET /:id` and is 404). The fourth, the project-search control, passes. | `green/db-library.txt`: 4 of 4. The library finds the current version in program A and the document in program B, each named with its program, and nothing of the other organisation. With `includeSuperseded` it finds 3, the earlier version marked. An empty query answers `EMPTY_QUERY`. Program B's own search still finds only its document. |
| Mutant: the program filter dropped from the shared query | `red/mutation-program-scope.txt`: the project-search control fails | as above |
| Mutant: the organisation predicate removed | `red/mutation-org-predicate.txt`. On PostgreSQL the DB suite still passes, because RLS hides the other organisation (the first wall). The predicate itself (the second wall) is pinned by `server/services/vault/__tests__/vault-search.test.ts`, which fails 2 of 2, and `ci:tenant-isolation:no-regression` also flags both statements. | 2 of 2; the gate passes |
| `server/routes/c2c/__tests__/project-vault-search-tenant-scope.test.ts` (VR-09) | — | 5 of 5, updated to the shared query's binding (organisation `$1`, program `$3`). Its assertions are unchanged in kind: the organisation predicate in each statement, the caller's organisation bound rather than a request value, and the count and page over the same WHERE. |
| `client/src/concept2cure/v2/__tests__/vaultLibrarySearch.test.tsx` | `red/client.txt`: 2 of 3 fail with trunk's `Vault.tsx`. The headline function lives in the new file and passes. | 3 of 3 |
| Regression: Vault client suites, Vault services and routes, project routes | — | 87 files, 658 tests, after the tenant-scope test's update |

Also green:
- Gates: `ci:design-system`, `ci:undefined-css-classes`, `ci:launch-scope-api`, `ci:check-client-api-calls`,
  `ci:internals-in-copy`, `ci:action-overclaim`, `ci:success-before-ok`, `ci:fixture-fallback`,
  `ci:unauthenticated-fetch`, `ci:tenant-isolation:no-regression`, `ci:tenant-entry-points`.
- Validation: `ci:validation-traceability`.
- `tsc`.
- Lint: no changed file gained a warning (`project-vault.ts` went from 7 to 6), and the new files have none.

Three gates are red on trunk for files this change does not touch, and each is handed to its lane in
`docs/work-orders/README.md`:
- `audit-requestdb-coverage`: `server/routes/governed-signed-act.ts`.
- `ci:unkeyed-request-tables`: a stale `audit.tamper_proof_log` entry.
- `ci:ana-surface-context`: `conversation-thread`.

The full DB tier is in `green/db-tier.txt`: 1292 of 1293. The one failure is the order-dependent activity-feed case of `tests/db/actor-displays.dbtest.ts`, which passes alone.

## Limits, stated

- **One page of 50.** The library lists the best 50 matches and says how many matched in all. Paging
  is a later refinement.
- **Opening a hit from another project.** It downloads through its own project, but opening it in the
  Vault means switching to that project. The list names the project so the person can.
- **OQ-VAULT-18 is written but not executed.** It runs with the other OQ-002 steps in W3.
