# MR-17 — Data layer: upgrade convergence, retrieval correctness, deploy scale

| | |
|---|---|
| Phase | Phase 1 (stages 1–3), Phase 3 (stages 4–5), Backlog (stage 6) |
| Highest open severity at head | P1 |
| Human testing | Degrades: a freshly provisioned database ships fixture users, organisations and fake submissions that testers see next to their own data (DATA-11). Guidance and precedent retrieval may come back empty because reference corpora are not deployed (DATA-12, unverified). DATA-05 and DATA-06 do not show up on a database provisioned fresh from HEAD at seed volumes. |
| Owner | engineering (one founder answer is needed for stage 2, and one for stage 4) |
| Effort | L in total: S + M + M + M + M + S |
| Depends on | MR-02 (required checks, so the new gates can block a merge; F-7), MR-03 (deploy-aws.yml writes the production baseline SHA; DATA-13 engine and pgvector pin), MR-05 (DATA-03 moves boot DDL into deploy-migrate under the same set discipline), MR-13 (grounding consumes the corpora), F-4, F-16 |
| Findings | 9 total — open 6 · partially fixed 2 · fixed 0 · refuted 0 · unverifiable 1 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

## Goal

Every customer database runs exactly the schema the release was tested against, however old the database is. A release that would leave an upgraded database different from a fresh install fails in CI, and a migration edited after it was applied fails the deploy instead of passing silently. A fresh production database holds no test users or fake submissions, and it carries the reference corpora the product claims to ground on, at asserted row counts. Semantic search over a customer's own documents returns the same sources at fifty thousand atoms as it does at five hundred. Deploy time and query cost stay bounded as tenants and audit rows grow.

## Why it matters

- **Silent schema drift after go-live (DATA-05, DATA-07).** The pilot's production database starts correct only because it will be provisioned fresh from HEAD. The first release after that can leave it on a schema the code does not expect, with 500s or failed writes on assumption, decision and governance-boundary records. The deploy still reports "safe to roll services", and the journal records the drift without anyone reading it.
- **Wrong answers that read as "no evidence" (DATA-06).** At production volumes the Authoring AI section draft and AnA data-room grounding drop sources the customer uploaded. Measured at 50,000 atoms, the search returned 0 or 1 of 10 results for a project holding 1–10% of rows. Nothing raises an error, so a regulatory writer concludes the evidence does not exist.
- **Fixture data in a governed system (DATA-11).** Every fresh install seeds seven `*-test.example.com` users, nine organisations and fake submissions (`IND 999888`, `K241234`). Installation qualification will find them, and they break the "no fixture data in governed paths" rule a GxP buyer audits against.
- **Grounding with nothing to ground on (DATA-12).** At the audit basis, `knowledge_entries` and the guidance and precedent tables had 0 rows after provisioning, and no workflow loads them. Guidance-grounded drafting then has no guidance to cite.
- **Deploys and audit writes that slow as customers grow (DATA-14, DATA-15).** Every deploy replays dozens of backfills and constraint validations, measured only on an empty database. Every tenant's audit write queues behind one global lock.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| DATA-05 | PARTIALLY_FIXED | P1 | Not observable on a fresh HEAD database; 500s on an upgraded one | No upgrade job in `.github/workflows/`; `db/migrations/20260323_assumption_decision_contradiction.sql:50,113` and `20260725_governance_boundary_tables.sql:26,78` use `CREATE TABLE IF NOT EXISTS` (converges nothing); `scripts/ci/check-migration-reachability.mjs:22-33` counts install-fresh and drizzle push as durable |
| DATA-06 | STILL_OPEN | P1 | Not observable below about 10k atoms | `db/migrations/20260730_fix_atom_embedding_dimension.sql:163-171` ranks over `idx_lumen_atoms_embedding_hnsw` (line 83), then filters; same shape in `server/services/enhancedEmbeddingService.ts:434-503` |
| DATA-07 | STILL_OPEN | P2 | Not observable | `scripts/db/migration-set.mjs:3487` awaits `recordApplied` and discards `'drift'` |
| DATA-11 | STILL_OPEN | P1 | Degrades | `db/migrations/055_gcc_test_scenarios.sql:29-66` inserts `*-test.example.com` rows, applied by install-fresh step 6 (`scripts/db/install-fresh.mjs:56`) |
| DATA-12 | UNVERIFIABLE | P2 | Degrades | Not re-checked at HEAD; at basis `knowledge_entries` (read by `regulatory-guidance-retrieval.ts:67`) had 0 rows after provisioning |
| DATA-14 | PARTIALLY_FIXED | P3 | Not observable | `scripts/db/migration-set.mjs:1022` builds some indexes concurrently; unguarded backfills and `ADD CONSTRAINT` still replay on every deploy; no seeded-database benchmark |
| DATA-15 | STILL_OPEN | P2 | Not observable | One global `AUDIT_CHAIN_LOCK_KEY` at `server/lib/tamper-proof-audit.ts:275`; unbounded `SELECT * FROM qms_documents … ORDER BY doc_number` at `server/routes/mdx-qms.ts:353` |
| DATA-17 | STILL_OPEN | P3 | Not observable | `db/migrations/20260220_ind_section_tracking.sql:53-192` creates five `*_org_policy` policies; `20260828_drop_orphaned_org_guc_policies.sql` (set entry at `migration-set.mjs:1973`) drops them on every deploy |
| DATA-18 | STILL_OPEN | P3 | Not observable | `drizzle.config.ts:21` has `out: './migrations'`; `package.json:309` exposes `"db:push": "drizzle-kit push"` |

## Already done at head — do not redo

- DATA-05, in part: `scripts/ci/check-migration-deploy-path.mjs` (38a5c1b4e, 2026-10-01) refuses a new top-level `migrations/*.sql` that is on no deploy applier. It is wired at `.husky/pre-push:201` and `.github/workflows/ci.yml:93`. Its baseline, `scripts/ci/migration-deploy-path-baseline.json`, holds the 113 existing off-path files. Stage 2 extends this gate; it does not replace it.
- DATA-14, in part: `scripts/db/migration-set.mjs:1022` already builds some indexes with `CREATE INDEX CONCURRENTLY`. Stage 5 reuses that mechanism.
- DATA-06, not affected: the vault passage arm (`server/services/advancedRAGPipeline.ts:1196-1262`) already scopes first (MATERIALIZED) and ranks exactly. It is the pattern stage 3 copies.

## Work, in order

### Stage 1 — Fresh provision carries no fixture data (Phase 1 · S · engineering) — closes DATA-11; settles DATA-12

1. Re-confirm DATA-11 and DATA-12 at the current head (statuses here are from 94b4f9238).
2. Amend `db/migrations/055_gcc_test_scenarios.sql` in place (Rule 1). Remove the seed inserts at lines 29-66 and every later insert of `*-test.example.com` users, identity organisations, the fake submissions (`IND 999888`, `K241234`) and their eCTD documents. Add a dated header: "AMENDED IN PLACE 2026-10-xx (DATA-11): test-scenario seed removed; fixture data must not reach a governed database." Keep any schema statements the file also carries. Move fixtures that tests need into the test setup under `tests/`, not into any migration tree.
3. Add `migrations/20261014b_remove_gcc_test_fixtures.sql` to `C2C_MIGRATION_FILES`, before the final sweep pair (`npm run ci:migration-set-order` must pass). `deploy-migrate` does not apply the gcc tree (`scripts/db/deploy-migrate.mjs:30`), so this set file is what reaches existing databases that install-fresh seeded. Guard each block with `to_regclass(...) IS NOT NULL`. Delete only the exact seeded keys (the seeded emails, organisation ids and submission numbers), never a pattern a customer could match. Before deleting, `RAISE EXCEPTION` naming the table and count if any non-fixture row references a fixture organisation. A replay on a clean database deletes nothing.
4. Add `scripts/ci/check-no-fixture-seed.mjs` and an `npm run ci:no-fixture-seed` entry, wired into `.husky/pre-push` and `.github/workflows/ci.yml`. It fails when `test.example.com`, `IND 999888` or `K241234` appears in any file that an applier reads: `C2C_MIGRATION_FILES`, `AUTHORING_SUBSYSTEM_FILES`, the drizzle journal, and the `db/migrations/*_gcc_*.sql` glob. Give it a selftest that plants the string in a temporary set file and shows it red.
5. Settle DATA-12. Provision a scratch database with `npm run db:provision` at HEAD. Record the row counts of `knowledge_entries`, the guidance tables and the precedent tables read by `regulatory-guidance-retrieval.ts`, plus `c2c_rule_packs`, `ectd.module_structure` and `common_standards.*`. File the counts under `docs/evidence/MR-17/<date>/fresh-provision-counts.txt`. If the corpus tables are empty, set DATA-12 to STILL_OPEN and run stage 4. If they are populated through a set file with an assertion, set it to FIXED and name that file.

**Acceptance**

- Before the change, a fresh `npm run db:provision` database returns more than 0 rows for `SELECT count(*) FROM <users table> WHERE email LIKE '%test.example.com'`. The output is filed. After the change, it returns 0.
- On a database provisioned at the pre-change commit, `deploy-migrate` at HEAD removes the fixture rows. A second run changes nothing.
- With a customer row seeded against a fixture organisation, the cleanup migration raises a named error and deletes nothing.
- `ci:no-fixture-seed` selftest is red with the planted string and green without it.
- DATA-12 has a recorded status backed by filed row counts.

### Stage 2 — Upgrades converge with fresh installs, and drift fails the deploy (Phase 1 · M · engineering, one founder answer) — closes DATA-05, DATA-07

1. Re-confirm DATA-05 and DATA-07 at the current head (statuses here are from 94b4f9238).
2. Add `scripts/db/schema-fingerprint.mjs`, read-only. It prints sorted lines for: columns (schema.table.column, type, NOT NULL, default); constraints (`pg_get_constraintdef`, whitespace-normalised); indexes (`pg_get_indexdef`); policies (`qual`, `with_check`); `relrowsecurity` and `relforcerowsecurity`; triggers (name, `tgenabled`, function); and md5 of function and view definitions. Exclude `pg_catalog`, `information_schema` and extension-owned objects.
3. Add an `upgrade-convergence` job to `.github/workflows/ci.yml`, using the postgres16 + pgvector service of the dbtest job at `ci.yml:1501-1560`.
   1. Resolve BASE from a new file, `deploy/production-baseline.sha`. `deploy-aws.yml` writes it after a successful production migrate (coordinate with MR-03). Until then, BASE is the newest `v*` tag.
   2. Run `git archive $BASE | tar -x -C "$RUNNER_TEMP/base"`. This is a read-only export: no branch, no worktree (Rule 0). Run `npm ci` there, then that tree's `node scripts/db/provision.mjs` into database `c2c_upgrade`.
   3. Run HEAD's `node scripts/db/deploy-migrate.mjs` against `c2c_upgrade`.
   4. Run HEAD's `npm run db:provision` into `c2c_fresh`.
   5. Diff the two fingerprints. Fail unless the diff is empty or every line is in `scripts/ci/upgrade-convergence-baseline.json` with a non-empty reason.
   6. Prove it red first with BASE=`54927bde`. The output must list the `assumption_records`, `decision_records`, `governance_boundary_*` and `cmc_comparability_assessments.tenant_id` lines. File it under `docs/evidence/MR-17/<date>/`.
4. Add `migrations/20261014_retired_shape_convergence.sql` to `C2C_MIGRATION_FILES`, after the creators and before the final sweep pair (`ci:migration-set-order` must pass).
   - For each of `assumption_records`, `decision_records`, `governance_boundary_rules` and `governance_boundary_transitions`, detect the retired shape. Examples: `assumption_records.category` with `udt_name = 'assumption_category'`, or `decision_records` without `decision_code`.
   - If the retired-shape table has zero rows, rename it to `<table>_retired_20261014` and run the canonical `CREATE` copied from `db/migrations/20260323_assumption_decision_contradiction.sql:50-180` or `db/migrations/20260725_governance_boundary_tables.sql:26-110`.
   - If it has rows, `RAISE EXCEPTION` naming the table and the row count. This fails closed, and the data mapping becomes a founder decision.
   - For `cmc_comparability_assessments`, when `tenant_id` has `data_type = 'text'`, first `RAISE` if any value is non-numeric. Then run `ALTER COLUMN tenant_id TYPE integer USING NULLIF(tenant_id,'')::integer`. This table belongs to the in-scope CMC / Module 3 path; converge it, do not fence it.
   - Guard every block by shape so a replay is a no-op. A rename is not a DROP, so `npm run ci:migration-drop-safety` stays green. Run it and its selftest.
5. Extend `scripts/ci/check-migration-deploy-path.mjs` so it also fails when a file listed in `scripts/ci/migration-deploy-path-baseline.json` differs from `git merge-base HEAD origin/concept2cure-v2`. Such a change belongs in a set file. Add a selftest case and show it red.
6. Update `scripts/ci/check-migration-reachability.mjs:22-33` so it no longer counts the install-fresh overlay or `drizzle-kit push` as durable paths. `deploy-migrate` runs neither. Show the gate failing on a file reachable only through the overlay.
7. DATA-07: at the `recordApplied` call site (`scripts/db/migration-set.mjs:3487`), capture the return value. On `'drift'`, fail deploy-migrate unless the file carries an `AMENDED IN PLACE <date>` header. In both cases, print a drift summary listing file, old hash and new hash. Add a selftest that forces drift on a file without the header (the audit's `deadbeef` case exited 0 even with `C2C_MIGRATION_JOURNAL_STRICT=1`) and shows a non-zero exit.
8. Founder answer, NEW decision below: does any staging or production RDS already exist, and which commit provisioned it? If one does, run the step 3 job against a restore of its latest snapshot before the pilot, and file the diff.

**Acceptance**

- The upgrade-convergence job is red with BASE=`54927bde`, listing the divergent columns and constraints. The red output is filed.
- After step 4, the same job is green, with an empty diff or only reasoned baseline lines.
- A second `deploy-migrate` run on the converged database changes nothing. On a database where `assumption_records` has rows in the retired shape, the migration raises a named error, demonstrated with a seeded row.
- Editing a baselined overlay-only file makes `ci:migration-deploy-path` fail (selftest red, then green).
- A forced journal hash drift on a file without an amendment header makes `deploy-migrate` exit non-zero. The same drift on a file with the header passes and prints the summary.
- An INSERT through `server/services/assumption-registry-service.ts:411` succeeds on the upgraded database.

### Stage 3 — Atom search scopes to the tenant first, then ranks (Phase 1 · M · engineering) — closes DATA-06

1. Re-confirm DATA-06 at the current head (statuses here are from 94b4f9238).
2. Write the recall test first. Add `tests/db/atom-search-recall.dbtest.ts`. Seed at least 20,000 atoms with random 1536-d vectors across two organisations: drop `idx_lumen_atoms_embedding_hnsw`, bulk insert, recreate the index, `ANALYZE`. Include an organisation with 20 atoms and an organisation or project holding about 2% of rows. Assert that `searchHybrid({ limit: 10 })` returns 10 results with `semanticScore > 0` for both. Run each case under `plan_cache_mode = force_generic_plan` and under the default. Run it against HEAD and record the failure (expected 0-1 of 10) in the commit message and under `docs/evidence/MR-17/<date>/`.
3. Amend `db/migrations/20260730_fix_atom_embedding_dimension.sql` in place (Rule 1). Add a dated header: "AMENDED IN PLACE 2026-10-xx (DATA-06): atom search scopes first, then ranks exactly; HNSW plus filter returned 0-1 of 10 at 50k rows." The header also satisfies stage 2's drift gate. Do not append a new migration.
4. In `search_atoms_hybrid` (line 138), make the first statement of the plpgsql body: `IF filter_atom_ids IS NULL THEN RAISE EXCEPTION 'search_atoms_hybrid requires filter_atom_ids (tenant scope)' USING ERRCODE = '42501'; END IF;`. The only caller, `enhancedEmbeddingService.searchHybrid` (`server/services/enhancedEmbeddingService.ts:581-592`), always passes the array.
5. Replace `semantic_results` (lines 163-171) with a scope-first form that mirrors `advancedRAGPipeline.ts:1196-1262`: `scoped AS MATERIALIZED (SELECT a.id, a.embedding FROM lumen_data_atoms a WHERE a.id = ANY(filter_atom_ids) AND a.embedding IS NOT NULL AND a.status = 'active' AND (filter_atom_type IS NULL OR a.atom_type = filter_atom_type)), semantic_results AS (SELECT s.id, 1 - (s.embedding <=> query_embedding) AS score FROM scoped s ORDER BY s.embedding <=> query_embedding LIMIT match_count * 3)`. Leave `keyword_results` and `combined` unchanged. The file's existing DROP/CREATE pair already replaces the function on every run.
6. `search_atoms_semantic` (line 97) has no caller in `server/` (grep `search_atoms_semantic(`). Confirm that no client, AnA tool or script calls it. Then either give it the same scoped form plus a required scope argument, or stop creating it: keep its `DROP FUNCTION IF EXISTS` in this same file and record the removal in the header.
7. Remove the duplicate ranking path. Preferred: move `cortexQueryRoutes.ts:305` onto `searchHybrid` and delete `searchSimilar` (`enhancedEmbeddingService.ts:434-517`). The commit names `searchHybrid` as the replacement and the recall test as the gate that reaches it. If `searchSimilar` must stay, rewrite it as `WITH scoped AS MATERIALIZED (SELECT a.* FROM lumen_data_atoms a JOIN organizations o ON a.organization_id = o.id WHERE o.uuid = $4 AND a.embedding IS NOT NULL AND <eligibility and filters>) SELECT ... FROM scoped ORDER BY embedding <=> $1 LIMIT $3` and extend the recall test to cover it.
8. Optional housekeeping: `idx_vault_document_chunks_embedding` (ivfflat, built on an empty table) has no reader that uses it. If you remove it, amend its creator `migrations/20260905b_vault_document_chunks.sql:70-72` in place with a dated header, then run `npm run ci:migration-drop-safety` and its selftest.
9. Alternative to steps 5 and 7, only once production runs pgvector 0.8 or later (DATA-13 in MR-03): `SET LOCAL hnsw.iterative_scan = strict_order` in the search transaction. The recall test must still pass under both plan modes.

**Acceptance**

- The recall test fails on the HEAD function: the 2%-share filter returns 0-1 of 10, and the generic plan shows `Index Scan using idx_lumen_atoms_embedding_hnsw ... Rows Removed by Filter`. The output is filed.
- After the amendment it passes under both `plan_cache_mode` settings.
- `EXPLAIN` of the semantic arm with `filter_atom_ids` set shows no HNSW `Order By` node.
- `SELECT search_atoms_hybrid('x', v, 0.7, 0.3, 10, NULL, NULL)` raises SQLSTATE 42501.
- `tests/db/atom-search.dbtest.ts` still passes, including its cross-tenant test. `ci:migration-drop-safety` is green.
- On a staging database with 50,000 atoms, an Authoring AI draft (`authoring.router.ts:3842`) for a section whose evidence was uploaded reports `sourcesRetrieved > 0`.

### Stage 4 — Reference corpora deployed with asserted counts (Phase 3 · M · engineering, after F-16) — closes DATA-12

Run this stage only if stage 1 step 5 found the corpus tables empty.

1. Re-confirm DATA-12 at the current head (statuses here are from 94b4f9238), using the counts filed in stage 1.
2. Take the corpus list from F-16: FDA guidance and eCFR first, ICH only after its reuse terms are checked, no MedDRA or WHODrug. Coordinate the list with MR-13, whose grounding work reads these tables.
3. Load each corpus through a migration in `C2C_MIGRATION_FILES`, before the final sweep pair, using `INSERT … ON CONFLICT (<natural key>) DO NOTHING`. `scripts/ingest-corpus.ts` and the `scripts/seed-*` scripts run on laptops only and are not a deploy path. Each row carries its source URL, retrieval date and content hash.
4. Put a row-count assertion inside each seed file (`IF (SELECT count(*) ...) < <expected> THEN RAISE EXCEPTION ...`), so a truncated load fails at apply time.
5. A transcription error cannot be corrected in place under `ON CONFLICT DO NOTHING`. Correct it by adding a new version row, and say so in the file header.
6. Extend `scripts/db/install-fresh.mjs` step 8 (verify) to report the corpus row counts against the same expected numbers.

**Acceptance**

- Before the change, a fresh provision reports 0 rows in `knowledge_entries` (filed in stage 1). After it, the counts match the asserted numbers.
- Removing rows from the seed's VALUES list makes `deploy-migrate` fail on the assertion. The output is filed.
- A replay inserts nothing. Guidance retrieval through `regulatory-guidance-retrieval.ts:67` returns a cited FDA guidance on a fresh staging database.

### Stage 5 — Deploy replay and hot queries stay bounded as data grows (Phase 3 · M · engineering) — closes DATA-15, DATA-14

1. Re-confirm DATA-14 and DATA-15 at the current head (statuses here are from 94b4f9238).
2. Write the benchmark first. Add a replay benchmark (`scripts/db/replay-benchmark.mjs` plus a CI job) that seeds a database to realistic volume (at least 10^6 audit rows, plus tenant tables at the founder's volume estimate), then times `deploy-migrate`. Set a budget in the job. Run it at HEAD and file the baseline time and the slowest files.
3. DATA-14: in the set files that run top-level `UPDATE` backfills, add a WHERE-not-done predicate so a replay touches zero rows. Make each `ADD CONSTRAINT` conditional on the constraint's absence, or on a `pg_get_constraintdef` mismatch where a later file also defines it (Rule 1 corollary). Use `NOT VALID` plus a separate `VALIDATE CONSTRAINT` where a constraint must be added to a large table. These are in-place amendments, each with a dated header.
4. DATA-15, audit lock: in `server/lib/tamper-proof-audit.ts:275`, replace the single global `AUDIT_CHAIN_LOCK_KEY` with an advisory lock keyed per organization, for example `pg_advisory_xact_lock(<namespace>, organization_id)`. Do this only if the hash chain is already per tenant. If the chain is global, the lock key must follow the chain; make that change with MR-06 (Part 11 record integrity), not here. Prove chain verification still passes under concurrent writes from two tenants.
5. DATA-15, unbounded lists: add LIMIT/OFFSET (or keyset) pagination to `server/routes/mdx-qms.ts:353` and to the list endpoints in `server/routes/authoring.router.ts` (basis references: `:2288`, `project-sections.ts:1225-1236`). Remove the N+1 comment-reply query (basis `authoring.router.ts:2972-2984`), and wrap the per-row upsert loop (basis `:6480`) in one transaction. Re-locate each line at the current head. Update the clients that read these lists in the same change.
6. DATA-15, indexes: add FK and `organization_id`-led indexes for the hot tables in one new migration in `public`, placed in `C2C_MIGRATION_FILES` before the final sweep pair. Build them through the concurrent-index mechanism at `migration-set.mjs:1022`, so no index build takes a write lock on a large table.

**Acceptance**

- The benchmark exceeds its budget at HEAD on the seeded database (or the baseline is filed if it does not). After step 3 it stays within budget, and a second replay updates 0 rows.
- A concurrency test shows two tenants' audit writes no longer serialise on one lock key, and the chain verifier still passes.
- `GET` on the QMS document list with 5,000 seeded documents returns one page and a cursor. Before the change, the same request returns all 5,000.
- `EXPLAIN` on the hot tenant-scoped queries uses the new `organization_id`-led indexes.

### Stage 6 — One schema source of truth (Backlog · S · engineering) — closes DATA-17, DATA-18

1. Re-confirm DATA-17 and DATA-18 at the current head (statuses here are from 94b4f9238).
2. DATA-17, gate first: make `npm run ci:migration-drop-safety` count a dynamic `DROP POLICY` (inside `EXECUTE format(...)` or a DO block) as a drop. Run it against HEAD and show it flagging the create-then-drop cycle between `db/migrations/20260220_ind_section_tracking.sql` and `20260828_drop_orphaned_org_guc_policies.sql`. Add that case to its selftest.
3. DATA-17, fix: remove the five `*_org_policy` `CREATE POLICY` blocks from `db/migrations/20260220_ind_section_tracking.sql:53-192` in place, with a dated header naming DATA-17 and this order. Keep `20260828_drop_orphaned_org_guc_policies.sql` in the set: it still removes the policies from databases that already have them, and it becomes a no-op elsewhere. The gate then goes green with no baseline entry.
4. DATA-18: guard `db:push` in `package.json:309` so it refuses to run unless an explicit dev-only variable is set and `DATABASE_URL` points to a local host. Change `drizzle.config.ts:21` so `out` no longer points to `./migrations`; use a scratch directory that no applier reads.
5. Document in `docs/` (next to the migration-set documentation) that the SQL migration set is the source of truth for schema and that the Drizzle schema is a typed client view. Add a check that reports the known mismatches, for example the 9 `vault.documents` columns that are `notNull` in Drizzle but nullable in the database. Changing those columns is MR-14's schema consolidation work (DATA-10), not this stage.

**Acceptance**

- `ci:migration-drop-safety` fails on HEAD for the dynamic `DROP POLICY` cycle, and passes after step 3.
- A fresh provision has none of the five `*_org_policy` policies after the first deploy, not only after the second.
- `npm run db:push` without the dev-only variable exits non-zero with a message naming the SQL migration set.
- `drizzle-kit generate` writes nothing under `migrations/`.

## Definition of done

- The upgrade-convergence job runs on every push to `concept2cure-v2`, is a required check, and is green against the current production baseline SHA.
- Journal drift on a file without an `AMENDED IN PLACE` header fails `deploy-migrate`.
- A fresh provision contains no fixture rows. It contains the deployed corpora at asserted counts, or DATA-12 is recorded as fixed with evidence.
- Atom semantic search passes the recall test at 20,000 or more atoms under both plan modes, and `search_atoms_hybrid` refuses a call without a tenant scope.
- The deploy replay on a seeded database stays within its budget, and audit writes no longer share one global lock.
- Every finding's `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` names its closing commit, and its red-then-green evidence is under `docs/evidence/MR-17/`.

## Founder decisions this order needs

- NEW: Does any staging or production RDS exist today, and which commit provisioned it? Blocks stage 2, step 8. If one exists, its snapshot must pass the convergence diff before the pilot.
- NEW: If a retired-shape `assumption_records`, `decision_records` or `governance_boundary_*` table holds rows on a real database, how should those rows map to the canonical shape? The migration refuses until this is answered. This blocks stage 2 only on that database.
- F-16 (regulatory corpus licensing) blocks stage 4: it decides which corpora may be loaded at all.
- F-4 (hosting inputs) and the founder's expected tenant count and document volumes set the benchmark budget in stage 5 and the atom counts in stage 3's staging check.
- F-7 (required checks on `concept2cure-v2`) decides whether the new gates in stages 1, 2 and 6 can stop a red merge, or only report it.

## Do not

- Do not append a DROP or a "fix" migration after `20260730_fix_atom_embedding_dimension.sql`, `055_gcc_test_scenarios.sql` or `20260220_ind_section_tracking.sql`. Amend the creating file in place, with a dated header (Rule 1).
- Do not converge a retired-shape table that holds rows by dropping it or casting its data. Fail closed and bring the mapping to the founder.
- Do not raise `hnsw.ef_search` and call DATA-06 fixed. A larger candidate list still filters after ranking, and recall still collapses for a small tenant on a generic plan. Do not add a second search function next to `search_atoms_hybrid`: one ranking path, scoped first.
- Do not create a branch or worktree to provision the previous release. `git archive` into a temp directory is the Rule 0-compatible way.
- Do not treat CMC or reporting tables as out of scope here. `cmc_comparability_assessments` belongs to the in-scope CMC / Module 3 composition path, inside the boundary in `shared/constants/launch-scope.ts`. Converge it; do not fence or delete it.
- Do not load reference corpora from `scripts/seed-*.ts` or a boot hook. Only a set file with a row-count assertion reaches a deployed database.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-17/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
