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
| **…and the 42703 was hiding a cross-tenant read.** A resolution skeptic caught it after the fix above was pushed: `public.users` has no RLS and `risk_items.assigned_to` was accepted unchecked, so a working join showed another tenant's user's name | The join reveals the owner only when the assignee is in `organization_users` for the risk's organization; POST/PATCH refuse a non-member assignee (422) through the canonical `checkOrgMembership` and fail closed when membership is indeterminate | `repro-mdx-owner-cross-tenant.txt` (pushed statement shows "Outsider B"; fixed shows null); `mdx-risk-assignee-membership.test.ts` 5/5, 3 of which fail with the POST check removed |
| `storage.ts` `getUserByUsername` read `users.username` (42703) and returned `undefined` — an error rendered as "no such user" | Deleted; no callers | guard's stale-baseline check fired on removal |
| `server/scripts/fetch_and_import.js` INSERTed the legacy `_consolidated` shape of `csr_reports`/`csr_details` (12 columns, 42703) | Deleted — nothing runs it (no script, workflow, Dockerfile or import; its Python fetcher does not exist and its env guard is inverted). Canonical path: `DrizzleCorpusWriter` (`server/services/corpus/drizzle-corpus-writer.ts`) via `scripts/ingest-corpus.ts`, `POST /api/corpus/ingest` and the corpus ingestion sweep | `column-gate-4-deletions-resolve-entries.txt`; insert-columns 59 → 47 |
| `server/services/csr-extractor-service.ts` read `csr_reports.nctrial_id/drug_name/file_path` and updated `csr_details.processed` (42703 at its first statement) | Deleted with its confidence-scores test and mapping template. Earlier notes called it "not a deletion candidate" because the test guards against fabricated confidence numbers; the guarded code could not run (no caller, absent from the production bundle, 42703 first), so guard and guarded code leave together and no path can emit a confidence figure. Canonical path: `csr-intelligence-library.ts` via `POST /api/corpus/extract` | production build + `ci:check-bundle-reachability` green; typecheck 0 |
| `unifiedDocumentIngestion.js` `searchDocuments` read `unified_documents.text_content` (42703) | Deleted with `getProcessingStats` and the unused pool import; never user-facing. Canonical document search: `GET /api/c2c/project-vault/:id/search` (`server/routes/c2c/project-vault.ts`) | same |

| The 16 tables read only from `.js` files that exist on no provisioned database | All seven files deleted after adversarial triage (investigator + reachability + resolution skeptic each, 27 agents): `routes/content-plan.js` and `routes/smart-blocks.js` (mounted, no caller since 7a144fd1e, 500 or fabricated content), `hooks/refModel.js`, `events/eventBus.js` (+ its only other import `lib/db.js`, the ancestor shadow of the governed pool), `services/enhancedFaersService.js` (+ `drugClassService.js`, `sql/faers_schema.sql`), `services/semanticSearch.js` + `pipelines/{indexDocs,bulk_import}.js`, `api/enterprise/rbac-routes.js` (+ the `/rbac/*` block of `enterprise/routes.js` and the now-unused `auditService.js` shim). Replacements named by path in the commit. Every baseline entry they held removed by hand: live-schema 58 → 42, table-reachability 1 → 0, unkeyed-request-tables −3, unreferenced-modules −6, gateway-bypass −1, server-error-leaks −3, referenced-tables −1 | `table-gate-roles-red-first.txt` (the table guard fails on `roles` with its entry removed, passes after the deletion); `ci:tables-live-schema` on the reference DB: 42 baselined, no stale entries |
| **Precedent search could only ever answer "none".** `precedent.regulatory_precedents.organization_id` was added only by `db/migrations/20260617_precedent_org_isolation.sql`, on no applier, so every corpus query raised 42703; a catch turned it into `[]`, and the board told users "your organization's corpus has none". (The column guard could not see this: the column lives in a relation-less fragment spliced in as `${whereClause}`.) | The file is wired directly after its creator and amended in place to carry its RLS policy: public rows readable by all; under enforcement a tenant writes only its own rows. The engine lets a failed corpus read surface; compare-by-id, strategy and claim-check now apply tenant isolation (compare bypassed it); ingest stamps and requires the ingesting org; the outcome ingestor stamps the sponsor's org and mints nothing it cannot attribute — a sponsor's outcomes never land in the public corpus by default. Pre-mortems say "corpus could not be read" instead of "populate the corpus" | `precedent-rls-coverage-red-first.txt` (CI's RLS coverage check names the table without the policy, clean with it); `precedent-tenant-isolation-real-db.txt` (as the app role with enforcement on: tenant 7 sees public + its own, not tenant 9's; public and cross-tenant writes refused; the real engine reads the corpus without error); a fixture that rejected every query — and so encoded the swallow — replaced, with a test that fails when the swallow is restored |
| **Stability studies: every create failed, and two updates faked success.** `POST /api/stability/studies` wrote `'DRAFT'` (and `'PAUSED'` verbatim) into `stab_studies.status`, whose CHECK allows only ONGOING/ON_HOLD/COMPLETED — every create was a 500; an unlisted storage condition was written with an invented 5°C; the create's audit record was written AFTER COMMIT on another connection, so an audit failure left a committed, unaudited study; `PUT /studies/:id` and `PATCH /studies/:id/status` answered "updated successfully" and wrote nothing | Status mapped onto the constraint (omitted → ONGOING, the column default; DRAFT/CANCELLED refused 400); only LT/INT/ACC with their ICH Q1A settings (others 400); actor required before anything is written (401) and the audit record written inside the create's transaction; PUT/PATCH answer 501 "nothing was changed"; validation moved before the pooled connection, closing an early return that left a transaction open | `stability-router-honesty.txt` (real DB in a real tenant scope: before, every create 500 and PATCH 200 with no write; after, 201 ONGOING / 201 ON_HOLD each with exactly one audit row, 400, 400, 401 with no row, 501); `stability-router-honesty.test.ts` 8/8 |

## Recorded, not fixed — with a written reason in its baseline

- `ich-compliance-checker.ts` → `column-reachability-baseline.json`, decided:
  it fails honestly (Q2 not evaluated, overall "incomplete"). The obvious rewrite
  onto `cmc_source_objects` was refuted by two skeptics — it would fabricate
  "non-compliant" verdicts from artifact rows with no status and from a numeric
  project id on the AnA path — and CMC is outside the launch catalog (RULE 2).

## Gates run

`ci:column-reachability`, `ci:migration-reachability`, `ci:tables-live-schema`
(against the reference DB), `ci:insert-columns-declared` + selftest,
`ci:model-migration-agreement`, `ci:duplicate-table-ddl`; vitest 64/64 across the
two guard contracts, submission-core reachability, unified-ingestion convergence
and the MDX route contract; `npm run typecheck` 0 errors (after installing the two
locked packages the local `node_modules` was missing); ESLint 0 errors on changed
files.

**Pre-existing reds, not from this work and not regenerated around:**
`ci:unreferenced-modules` (server/eval/register/run-eval.ts,
server/mcp/client-transcript.ts), `ci:unkeyed-request-tables`
(mcp_oauth_clients, c2c_document_section_versions), `ci:server-error-leaks`
(server/routes/c2c/actions.ts), `db/audit-referenced-tables --check` (parser
phantoms). Each is red identically on the tree without these changes;
regenerating any of those baselines would have absorbed another session's
finding.

**Founder decision owed before deploying the precedent change.** Until now the
ingest route wrote precedents with no organization. Any such rows already in
production become `organization_id IS NULL` — public to every tenant — once the
column exists (as they were before 2026-06, when no isolation existed). Their
owner cannot be recovered (`created_by = 'system'`). Count them first:
`SELECT source_type, count(*) FROM precedent.regulatory_precedents WHERE source_type IN ('Manual','outcome_ingestor') GROUP BY 1;`
and decide whether they stay public or are removed.

**Recorded for the CMC / stability workstream (RULE 2 — not fixed here).** The
same commit-then-audit ordering remains in about twenty other handlers of
`server/src/routes/stability.router.ts` (`condition_update`, `tp_update`,
`result_add`, `capa_create`, `bulk_assign`, …): a failed audit after COMMIT
leaves an unaudited change. `audit()` now accepts the transaction client, so
each is a local change. There are also two stability-study stores —
`stab_studies` behind `/api/stability` (no client caller) and
`public.stability_studies` behind `/api/cmc/stability-studies` (the CMC UI);
which is canonical is a product decision.
