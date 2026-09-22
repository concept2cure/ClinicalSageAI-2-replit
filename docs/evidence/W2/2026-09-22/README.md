# W2 evidence — 2026-09-22 — row D1 (hosted production): the provisioned schema answers the server's SQL

Worker scope: `scripts/ci/**` (schema-reachability guards), `server/**` statements
those guards found broken. Reference database: `c2c_full`, built locally by
`scripts/db/install-fresh.mjs` + all of `C2C_MIGRATION_FILES` + the gcc tree,
PostgreSQL 16 at 127.0.0.1:5432. (The gcc tree was re-applied as `postgres` on
2026-09-22: `080_gcc_21cfr_part11_compliance.sql` creates a role, which the
local `c2c` owner cannot, so `compliance.*` had been missing locally only. After
the re-apply the live-schema guard reads 1293 relations and exactly the 42
baselined absences CI records — the local DB now matches CI's.)

**The row this moves.** D1's `/readyz` checks that the schema *exists*. It does
not check that the server's statements *run* against it. A statement naming a
column no applier creates raises 42703 on every execution, and nothing in CI
could see that class below the table level. This change makes it visible,
blocks new instances, and fixes or records every existing one it found.

## What was proved

| Claim | Evidence |
|---|---|
| **The first column guard was wrong in both directions.** As committed in `0d45e1fc3` it reported 7 findings. An adversarial review (30 agents: an investigator plus runtime, schema and resolution skeptics per finding) established: 4 were real but dead code; 3 were false (an output alias read as a table, a `vault.` alias read as `public`, a catalog-sweep column the regex could not see). A parser audit found 218 of 691 column-adding clauses invisible (only the first action of a multi-clause ALTER was read). | `column-gate-0-before-hardening.txt` |
| **The hardened guard fails on the defects it exists for.** With the five historical column migrations removed from the set, it names all 16 of their queried columns with the right consumer file (`audit_events.hmac_seal`, `gdpr_data_subject_requests.execution_evidence`, `ai_claims.verifier_flags`, `ivdr_binder_evidence.*`, `ivdr_packs.*`). | `column-gate-1-fails-on-historical-defects.txt`; pinned by `tests/schema-contract/column-reachability-guard.contract.test.ts` |
| **Each hardening is load-bearing.** Re-introducing each known weakness into the implementation fails at least one contract test: first-ALTER-action-only (1), co-occurrence matching (5), no apply-order check on sweeps (1), `.ts`-only reference scan (1), "sole relation" bare-column rule (2). | `column-gate-2-mutations-caught.txt` |
| **Every column it now reports is really absent, and the reference is real.** Each statement PREPAREd on the reference DB raises 42703. | `repro-legacy-shape-columns-prepare.txt` |
| **One parser, not three.** `scripts/ci/lib/sql-columns.mjs` now serves ci:column-reachability, ci:insert-columns-declared and ci:model-migration-agreement. Moving the other two onto it removed three false entries from their baselines, each confirmed present on the reference DB: `knowledge_graph_{nodes,edges}.organization_id` (added by a FOREACH/ARRAY sweep the old parser could not read), `submission_leaves.document_{content_sha256,pinned_at}` and `project_milestones.name` (added by `ALTER TABLE IF EXISTS …`, which one old parser filed under a table named `if`). insert-columns 49 → 47, model-migration 29 → 28. The insert selftest (truth established against a real DB) still passes. | `gates-3-landing.txt` |
| **The reference scan was blind to .js/.mjs.** All three reference-side guards read `.ts` only. Widening it (one shared `serverSqlFiles`) surfaced 16 tables read only from `.js` files that exist on no provisioned database, including the mounted `rbac-routes.js` (`roles`, `user_roles`) and `smart-blocks.js`. | `gates-3-landing.txt`; contract test "reads .js and .mjs server files" |

## Fixed in this change

| Defect | Resolution | Proof |
|---|---|---|
| `unifiedDocumentIngestion.js` `createAuditEntry`, `storeDocumentChunks`, `storeDocumentTables` wrote columns/tables that do not exist (42703 / 42P01), swallowed as "non-critical" | Deleted — unreachable (no callers; `processDocument` never builds `chunks`, `extractContent` never returns `tables`). Canonical chunk store `vault.document_chunks`; canonical audit writer `DocumentOrchestrationService.ts`. `emergency_security_migration.sql` stays off every applier (it would add a VARCHAR `tenant_id DEFAULT 'default'` to a Part 11 table keyed by `organization_id`). | 30-agent review; `docs/AUDIT_STORE_INVENTORY_2026-08.md` §6.1 |
| MDX risk register selected `u.username` (does not exist) — the risk panel and the summary were marked unavailable on every request | `COALESCE(u.name, u.email) AS owner`, `GROUP BY r.id, u.id` — the owner expression the repo already uses | `repro-mdx-risk-owner.txt` (old 42703, new PREPARE + EXECUTE ok); 44/44 route contract tests |
| `storage.ts` `getUserByUsername` read `users.username` (42703) and returned `undefined` — an error rendered as "no such user" | Deleted; no callers | guard's stale-baseline check fired on removal |

## Recorded, not yet fixed — each with a written reason in its baseline

Two triage workflows (reachability + resolution-safety skeptic per item) are
verifying these; each entry is removed when its fix lands.

- 16 absent tables read from `.js` files → `tables-live-schema-baseline.json`
  (`newlyVisible_2026_09_22`), `roles` also in `migration-reachability-baseline.json`.
- `server/scripts/fetch_and_import.js`, `csr-extractor-service.ts`,
  `unifiedDocumentIngestion.js` `searchDocuments` → `column-reachability-baseline.json`,
  `insert-columns-baseline.json` (`newlyVisible_2026_09_22`).
- `ich-compliance-checker.ts` → `column-reachability-baseline.json`, decided:
  it fails honestly (Q2 not evaluated, overall "incomplete"); the fix is a CMC
  reader over `cmc_source_objects`, outside the launch catalog (RULE 2).

## Gates run

`ci:column-reachability`, `ci:migration-reachability`, `ci:tables-live-schema`
(against the reference DB), `ci:insert-columns-declared` + selftest,
`ci:model-migration-agreement`, `ci:duplicate-table-ddl`; vitest 64/64 across the
two guard contracts, submission-core reachability, unified-ingestion convergence
and the MDX route contract; `npm run typecheck` 0 errors (after installing the two
locked packages the local `node_modules` was missing); ESLint 0 errors on changed
files.
