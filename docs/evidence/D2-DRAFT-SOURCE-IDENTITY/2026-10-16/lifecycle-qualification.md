# D2 source identity lifecycle qualification

The final post-merge checkpoint follows the lead's explicit freeze at `fa7ea5bc3598849ce59fe07c19d10fc79b204efc`. The earlier passing run during canonical integration is retained as `lifecycle-pglite-merge-in-progress.txt`; its source-stability check detected the upstream `authoring-from-draft.ts` change and therefore does not qualify the final integrated source tree. Both final runs below passed after that freeze with unchanged current source bindings.

The frozen implementation passed the ten actual save/export HTTP lifecycle cases on PGlite and six separate PostgreSQL 16 reservation cases. These are complementary checks; their counts do not add to an independent sixteen-case full application concurrency qualification.

## Actual save and export paths

`lifecycle-pglite-final.txt` records **10/10 passing cases** through the canonical from-draft and controlled XML export paths, genuine embedded PostgreSQL queries, application transactions, revisions, genesis attribution, audit and export history. Cases include a V2 source span beyond 80,000 UTF-16 units, unchanged V2 save/export, same-length extraction changes inside and outside the span, private-parent refusal, current-role revocation, wrong-organization refusal and a real audit INSERT failure rolling back already-inserted records. PGlite uses a single connection and does not prove concurrent locking.

The final run follows an approved test-only refactor that splits the oversized registration callback into two synchronous registration helpers. `lifecycle-pglite-refactor-equivalence.json` verifies that reversing only that transformation restores the exact earlier frozen fixture hash: no case body, order, name, hook or assertion changed. All nineteen bindings in `lifecycle-pglite-final-source-before.json` and `lifecycle-pglite-final-source-after.json` match, as recorded in `lifecycle-pglite-final-manifest.json`. The earlier frozen run, its original fifteen bindings and its pre-refactor reuse check remain historical. `lifecycle-pglite-first-incomplete-owner-edit.txt` and `lifecycle-pglite-refactor-unbound-run.txt` are retained history and are not the final qualification checkpoint.

## Independently observed PostgreSQL reservations

`lifecycle-postgres-final.txt`, `lifecycle-postgres-observations.json` and `lifecycle-fixture-state.json` record **6/6 passing cases** on an owned, disposable, cached PostgreSQL 16.15 container. The ordinary `app_service` test role has `NOSUPERUSER`, `NOBYPASSRLS` and `NOCREATEROLE`. A distinct observer connection sees six actual wait/blocker relationships through `pg_stat_activity` and `pg_blocking_pids`.

- Document and catalog UPDATEs wait while the canonical shared source-store reservation is held, then proceed after COMMIT or ROLLBACK. Synthetic receipt visibility/persistence follows the selected transaction ending in all four cases.
- An earlier uncommitted raw source UPDATE blocks the reservation; after release the reserving transaction reads the changed current text.
- Program advisory admission occurs before store reservation. An unrelated raw source writer can progress while that admission is waiting.

The ten bound application/helper/test/configuration sources remain unchanged before and after the final native run and still match the current files. The earlier pre-merge six-case positive run is preserved as `lifecycle-postgres-premerge.txt` and accompanying `lifecycle-premerge-*.json` files. The launcher keeps the inherited proxy and Docker credentials, clears only Docker endpoint/context/TLS selectors, selects the managed Unix socket and cached image without a pull, publishes only to loopback, uses tmpfs storage without host mounts, and does not use an inherited `DATABASE_URL`. Both roles and all schema/data are synthetic. The exact owned container was removed, and a subsequent inspect verified its absence.

## Failing control

`lifecycle-postgres-counterfactual.txt` records the deliberately omitted table-lock control: **five expected failures and one passing program-order control**. Only the canonical helper's exact table-lock query is intercepted by the test-only adapter; the production source is unchanged. All five expected failures report an absent native PostgreSQL blocking barrier. Its ten source bindings were stable during that historical run, and `lifecycle-counterfactual-fixture-state.json` independently records exact-container cleanup. Nine bindings still match the final source tree, including the helper, native fixture, launcher and configuration. The remaining binding changed when upstream added an internal authoring `changeReason` option; that option is outside this native helper invocation. The final manifest records both hashes and this limit explicitly. This establishes that the observed barriers depend on the source-store lock, while the independent advisory-order control still works; the final positive run freshly binds all ten current sources.

## Qualification limits

The native fixture executes the canonical shared reservation helper over synthetic source and receipt DDL with explicit transactions. It does not run the full HTTP lifecycle concurrently. The PGlite cases run those actual application paths separately. Neither run proves deployed-role/RLS behavior, production workload capacity, provider delivery or model use, scientific acceptance, audit HMAC qualification, live client behavior, or government agency acceptance. The observed development audit-HMAC warning is retained in the logs. Historical `lifecycle-lint.json` records the original fixture length warning; `lifecycle-lint-final.json` records zero errors and zero warnings for the final fixture and launcher, without suppressions or baseline changes. D2 as a whole remains open.
