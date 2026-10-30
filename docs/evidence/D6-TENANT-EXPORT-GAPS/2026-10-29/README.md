# The tenant export returns every table the purge erases: complete the export, fix the deny-all chains

Launch row D6 (tenant offboarding: data portability and erasure). Date 2026-10-29. HEAD `e2cf417ba`.

The work:

- **complete** the tenant export so it returns the six tables the purge erased without returning them, through the predicate map the purge and the export share (`server/services/tenant/purge-parent-scope.ts`);
- **fix** the three CSR/CTD grandchildren that row-level security left deny-all to every application role. The export could not read them even with a predicate. The fix gives each its parent's policy, by amending `db/migrations/20260813_child_table_parent_scoped_rls.sql` in place;
- **fix** the purge of `csr_narrative_outputs`, which nothing reached. ci:purge-coverage was red at HEAD on it. The coordinator added this to the change.

**Status: done.** The red, green and mutation runs below are real runs. Each finding I am not fixing is listed under "Reported, not fixed".

## The gaps, confirmed by running them

I did not find these by reading code. On a database built from blank at HEAD, I walked the purge's own list over the live catalog (`red.txt` §1): `PURGE_CHILD_TABLES` + `PURGE_PARENT_SCOPED`, and their ON DELETE CASCADE closure. 60 erased tables have no tenant column. **6 of them are erased and never read by the export:**

| Table | Erased by | RLS at HEAD | Why the export missed it |
|---|---|---|---|
| `csr_endpoint_results` | cascade: csr_studies → csr_endpoints → it | on, FORCEd, **no policy** | no predicate; and deny-all to the runtime role, so a predicate alone returns nothing in the tenant's scope |
| `ctd_module_sections` | cascade: ctd_programs → ctd_submissions → it | on, FORCEd, **no policy** | the same |
| `ctd_documents` | cascade: … → ctd_module_sections → it | on, FORCEd, **no policy** | the same |
| `vault.document_catalog` | cascade from vault.documents (the purge_tenant_vault_records door) | on, 4 policies through vault.documents | no predicate in the map |
| `vault.document_read_receipts` | the same | the same | the same |
| `vault.evidence_citations` | cascade from vault.documents, by **either** document key | 4 policies through `source_document_id` | the same |

The purge reaches no schema outside public and vault.

I then seeded two tenants with one row each in all 183 tables. The six were included because the extended dbtest now seeds every erased table that has no tenant column. I ran A's export both ways: in A's scope as the runtime role, and as the owner. Measured at HEAD (`red.txt` §3), A's rows were **missing from A's export in all six**: 9 misses, scoped and owner. B's rows were in A's export in none of them.

## What already exists

Read at `e2cf417ba`, the commit that built the shared map.

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The shared predicate map | `server/services/tenant/purge-parent-scope.ts` (`PURGE_PARENT_SCOPED`, `EXPORT_DERIVED_TABLES`) | One predicate per table with no tenant column. The purge deletes by it and the export reads by it. 56 entries, 24 of them cascade-only (export-only). | No entry for the six. Its own comment explained why the three CSR/CTD tables were left out. |
| The Vault tenancy | `server/services/tenant/vault-tenancy.ts` (`VAULT_DOCUMENT_TENANCY`) | Which vault documents are a tenant's. The purge door (`purge_tenant_vault_records`, `migrations/20260926_vault_documents_record_immutability.sql:235`) deletes by the same predicate. | Covered vault.documents and, through an inline subquery, vault.document_chunks only. |
| Export discovery | `server/services/tenant-export/tenant-full-export.service.ts` (`discoverTenantTables`, `EXPORT_SCOPED_PREDICATES` = the map minus derived tables) | Discovers tenant-keyed tables in public and vault, and every key of the map present in the database. | Unchanged here. It picks up the new entries by itself. |
| The parent-scoped RLS spec | `db/migrations/20260813_child_table_parent_scoped_rls.sql`: `specs` (single level), `chained` (delegates to the parent's own `tenant_isolation_policy`), then a deny-all block | csr_endpoints and ctd_submissions are in `specs`. The deny-all block held the three grandchildren, ENABLEd and FORCEd with no policy. | The header records the nested predicate the three need, and names the exit ("a table LEAVES this list by gaining a real parent-scoped policy in one of the lists above"). Nobody had taken it. |
| The Vault child policies | `migrations/20260905_document_catalog.sql` (catalog, receipts, via `document_id`), `migrations/20260911_vault_evidence_citations.sql` (citations, via `source_document_id`) | SELECT/INSERT/UPDATE/DELETE policies through vault.documents and `core.can_access_program`. | Unchanged. No migration was needed for group 2. |
| Two-tenant export and purge check | `tests/db/tenant-purge-blocking-keys.dbtest.ts`, `tests/db/tenant-purge-row-seeder.ts` | Seeds the blocking-key tables and the map's tables for A and B, then checks A's export (scoped and owner) and A's purge, table by table. | Exempted the three CSR/CTD tables (`DENY_ALL`). Never seeded the six. Nothing checked that every erased table is read by the export. |
| The child-RLS suite | `tests/db/child-table-parent-scoped-rls.dbtest.ts` + `.cases.ts` | Policied, enabled and FORCEd for every listed child, plus two-tenant cases per key shape. | Pinned the three as deliberately deny-all (`STILL_DENY_ALL`). |
| The unkeyed-table gate | `scripts/ci/check-unkeyed-request-tables.mjs`, `scripts/ci/lib/chained-parent-policy.mjs`, `scripts/ci/unkeyed-request-tables-baseline.json` | Models the `chained` generator. A `specs` table read per request needs a "derived" baseline entry: 22 such entries at HEAD. | It does not model `specs` (see "Handed on"). |
| Export-covers-purge contract | `tests/schema-contract/tenant-export-covers-purge.contract.test.ts` | A listed table must be discovered by the export (PGlite, the 0000 journal). | Checks listed tables, not their cascades. The dbtest now does that on the deploy-shaped schema. |

**Searches run:**

- `discoverTenantTables`, `EXPORT_SCOPED_PREDICATES`, `PURGE_PARENT_SCOPED`, `VAULT_DOCUMENT_TENANCY`, `EXPORT_DERIVED_TABLES` across server, tests and scripts;
- the six table names across server, shared, tests, scripts, migrations and db/migrations, which found the creating files above, `STILL_DENY_ALL` and `DENY_ALL`;
- `purge_tenant_vault_records`;
- `chainedParentPolicyTables`;
- `csr_narrative_outputs` and `csr_build_jobs`;
- `git log --all --diff-filter=D` on `*tenant-export*`, `*parent-scope*`, `*vault-tenancy*` and `*child-table-parent*`, which found no deleted implementation.

**Nothing is built beside an existing piece.** The map gains entries. The Vault predicate gains the id subquery its children already used inline. The migration's chained list gains three rows. The dbtest is extended, and the child-RLS suite gains a case.

## What changed

| File | Change |
|---|---|
| `db/migrations/20260813_child_table_parent_scoped_rls.sql` | **Amended in place. Dated note `AMENDED IN PLACE 2026-10-29 (D6, data portability)` in the header**, plus one-line 2026-10-29 pointers at the header's "until they are needed", above the chained block and above the deny-all block. Three rows were added to `chained`: `csr_endpoint_results → csr_endpoints(endpoint_id)`, `ctd_module_sections → ctd_submissions(submission_id)`, `ctd_documents → ctd_module_sections(section_id)`, in that order. Integer keys, checked against the catalog. Nothing was removed and no DROP was added. The deny-all array keeps the three names as its fallback: it skips a policied table, so it acts only where the chained block could not scope one, and there it leaves the table deny-all rather than open (M10 shows that). |
| `scripts/db/migration-set.mjs` | **No change.** The file is already the set's `CHILD_TABLE_PARENT_SCOPE`, in the isolation tail. |
| `server/services/tenant/vault-tenancy.ts` | `VAULT_TENANT_DOCUMENT_IDS` = `SELECT id FROM vault.documents WHERE ${VAULT_DOCUMENT_TENANCY}`, the parent every Vault child is scoped by. `VAULT_DOCUMENT_TENANCY` is now a template literal with the same value, so ci:tenant-isolation expands it and checks the statement (M8 is caught there), instead of needing a suppression marker. |
| `server/services/tenant/purge-parent-scope.ts` | Six entries. CSR/CTD: each through the same parent and key as its new policy, down to `organization_id = $1`. Vault: catalog and receipts through `document_id`, citations through `source_document_id`, each `IN (VAULT_TENANT_DOCUMENT_IDS)`. vault.document_chunks uses the same constant, byte-identical SQL. The "Not here" comment was replaced. Two dead `tenant-isolation-safe` markers became plain comments: the statement they guarded no longer contains a table name. 149 lines. |
| `server/services/tenant/purge-referrers.ts` | `csr_narrative_outputs` after the CSR knowledge base, commented with 3b576cab9 and 20260628_csr_job_state.sql. The module header notes the one entry that names no purged row. 298 lines. tenant-offboarding.ts is unchanged (1367). |
| `scripts/ci/unkeyed-request-tables-baseline.json` | Two "derived" entries, approved by the coordinator: `csr_endpoints` and `ctd_submissions`, in the precedents' wording, naming this change. Total 89 → 91. The export's predicates read each of them in a FROM as the parent. |
| `tests/db/tenant-purge-blocking-keys.dbtest.ts` | Seeds every erased table with no tenant column. New case: the export reads every table the purge erases (EXPORT_EXCLUDED_TABLES and the derived chunks aside). `DENY_ALL` is gone, so the three are checked scoped and owner. A cross-tenant citation is checked: B's claim citing A's document must not be in A's export. `staggerSequences` starts each seeded table's ids at its own offset (M7). The comparison moved into `compareExport` (complexity lint). 377 lines. |
| `tests/db/child-table-parent-scoped-rls.dbtest.ts`, `.cases.ts`, `.chains.ts` (new) | `STILL_DENY_ALL` and its test removed, with a dated note saying why. The three were added to `ALL_CHILD_TABLES` (policied, enabled, FORCEd). A `ctd_documents` case covers the three-hop chain, two tenants, both directions. Bare-CI declarations for both chains. `.chains.ts` holds the case and the declarations, so `.cases.ts` stays under the 500-line lint ceiling. |

### Cross-tenant safety

A wrong predicate here hands one customer another's rows, so every predicate goes through the parent and key of the table's own policy:

- **Two layers in the tenant's scope.** The runtime role's export is filtered by the new policy and by the predicate.
- **The predicate alone as the owner.** The dbtest runs both.
- **Widening is caught.** Every widening mutation (M2, M3, M5, M8) puts B's row in A's export and fails. The wrong-key mutation (M7) fails. The either-key citation mutation (M4) puts B's citation of A's document in A's export and fails.
- **The policy itself is pinned.** M11 lets tenant B read tenant A's CTD document, and the new case fails on it.

## Rule 1: every migration re-runs on every deploy

`green.txt` §6 deploys the amended file onto the database built at HEAD, where the deny-all block had run:

- the chained block creates the three policies;
- the deny-all block skips them (`0 enforced, 3 skipped`);
- the second deploy changes nothing (`chained: 0 policied, 32 skipped`).

A database built from blank with the change gets the same state. ci:migration-drop-safety, ci:migration-set-order and ci:migration-deploy-path pass.

## Red, green, mutations

| | What | Result |
|---|---|---|
| Red §1 | the purge's closure over the live catalog, HEAD code | **6** erased tables not read by the export |
| Red §2 | ci:purge-coverage at HEAD, plus the narrative purge probe | exit 1, NEW residue `csr_narrative_outputs`. A's narrative survived a purge that reported `purged`. |
| Red §3 | the finished dbtests, HEAD product files, HEAD database | **4 of 22 fail**: 6 tables not exported; 9 misses of A's rows (scoped and owner); the three have no `tenant_isolation_policy`; A cannot see its own CTD document |
| Red §4 | ci:unkeyed-request-tables without the new baseline entries | exit 1, names csr_endpoints (and ctd_submissions) |
| Green | `green.txt` | **0** erased tables unread. Gate: no NEW residue (464, baseline 469). Narrative erased for A and kept for B. The two suites: 22/22. Related real-database suites: 10 files, 70 tests. Vault-fixture suites: 3 files, 40 tests. Unit and PGlite: 25 files, 284 tests. Deploy onto HEAD's database, twice. |
| Mutations | `mutations.txt` | **13 mutations, 16 runs.** Against the finished checks, every one is red (15 runs). The 16th run is M7 against the first version of the dbtest: it survived because the sequences were in step. The test was fixed and M7 is red after. Each file was restored byte for byte. |

## Gates

`gates.txt`, on the finished tree. Pass:

- ci:migration-drop-safety and its selftest;
- ci:migration-set-order;
- ci:migration-deploy-path;
- ci:purge-coverage (database built from blank with the change) and its selftest (53);
- ci:tenant-isolation:no-regression;
- ci:sql-interpolation:selftest;
- ci:unkeyed-request-tables;
- ci:baseline-justifications;
- ci:check-test-imports;
- ci:unreferenced-modules;
- ci:db-test-isolation;
- ci:runtime-ddl;
- ci:tenant-entry-points;
- audit:repo-health:ceiling.

Scoped tsc and eslint on every changed file: clean (`typecheck.txt`, `eslint.txt`).

**ci:sql-interpolation exits 1 on the finished tree, and not because of this change.** Another lane has deleted `server/routes/mdx-vault.ts` in the shared working tree (uncommitted), and the gate asks for that file's baseline of 5 to be lowered. Before that deletion it passed with this change's files in place.

## Reported, not fixed

1. **A tenant's purge erases another tenant's evidence citation** (`cross-tenant-citation-probe.txt`). The setup: a citation whose source is B's document and whose evidence is A's document. That row is B's: its policies and the export follow the source, so it is in B's export and not A's. But both document keys are ON DELETE CASCADE, so **the purge of A deletes it**, while B's document stays. The INSERT policy checks only the source document, so B can write such a row if it holds A's document id. Two possible fixes: refuse a cross-tenant evidence document at write, or change the evidence key's delete action. Either is a Vault-lane decision and a change to `migrations/20260911_vault_evidence_citations.sql`. The dbtest checks the export side only, and removes the row before the purge.
2. **The Vault child tables' row security is not FORCEd** (vault.document_catalog, document_read_receipts, evidence_citations, document_chunks: `relforcerowsecurity = f`). The table owner is exempt from their policies. vault.documents is FORCEd. This was the case before this change, and it is the Vault lane's call.
3. **In a tenant scope, the export returns no Vault row without a project member.** The scoped export reads vault.* only through `core.can_access_program`, and the dbtest's scope has no user. So the scoped run checks Vault tables for leaks only, as before (item 5 of the D6-TENANT-PURGE-BLOCKING-KEYS README). The three new Vault tables follow the same rule.
4. **csr_build_jobs is still purge residue**, as it was in the baseline before this change: one job header per CSR build. Only its narratives were new residue. Whether to purge the headers is a separate change.

## Handed on

- **Teaching `scripts/ci/lib/chained-parent-policy.mjs` the `specs` generator would retire 24 baseline entries** from `unkeyed-request-tables-baseline.json`: the 22 at HEAD plus the 2 this change adds. Each is a `specs` table of 20260813 that the gate cannot see is policied. Today the 2 new ones carry the same "derived" reason as the precedents, approved by the coordinator.

### Rule 1, Rule 2, Rule 3

- **Rule 1:** one migration was amended in place, with a dated note. No DROP was added; every new statement is guarded; replay was shown twice.
- **Rule 2:** this is launch row D6 (data return on offboarding). It adds no surface or capability.
- **Rule 3:** see "What already exists". Each piece is completed or fixed in place.
