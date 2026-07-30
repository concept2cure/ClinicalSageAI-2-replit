# Chapter 05 — Data layer and multi-tenancy

**Verdict: this is the highest-risk area of the platform, and the risk is concentrated in
two places — a tenant-isolation control that is built but switched off, and a migration
system that cannot reliably produce the schema the application needs.**

Both are recoverable. Neither is safe to defer.

---

## 5.1 Row-level security is compiled and inert

`migrations/0021_enable_rls_everywhere.sql` is a well-written 164-line `DO` block: it walks
`information_schema.columns` for `organization_id | org_id | tenant_id`, enables **`FORCE
ROW LEVEL SECURITY`** (`:120-123` — necessary because on Neon the app role owns the tables,
and without `FORCE` the owner bypasses policies), and installs one `tenant_isolation_policy`
per table. Verified on a fresh install: **584 tables with RLS enabled, 572 policies.**

Every one of those policies opens with (`:135`):

```sql
NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
```

When `app.rls_enforce` is anything other than `'on'`, that clause is true and **every row
passes on every table.** No deployment manifest in the repository sets `RLS_ENFORCE=on`.

### Why it cannot simply be switched on

`server/db/runtime.ts:120` builds the Drizzle client over the shared **pool**, whose
connections carry `app.rls_enforce` but **not** `app.current_tenant_id`. With enforcement on,
a pooled query evaluates the tenant predicate against `NULL` and returns **zero rows**.

| Measure | Value |
|---|---:|
| DB-touching route files | 97 |
| …using request-scoped `requestDb(req)` | **16** |
| …still on the shared pool | **81** |
| `requireTenantContext` mount sites | **1** (`server/routes/ana-features.ts`) |
| `withTenantConnection` callers | **~1** (`server/services/memory-consolidation-job.ts`) |

Commit #1186 states the consequence plainly: *"with RLS on, the route would 500 for everyone
rather than defend anyone."* `docs/RLS_ENFORCEMENT_BURNDOWN.md` is tagged as GA-readiness
item **0.1, highest severity**, with `Owner: unassigned`.

The application confirms this about itself at runtime. Observed in the boot log:

```
[tenant-rls-observability] Query issued without tenant scope
  (will return zero rows once RLS is enabled)
  caller: server/services/securityHealth.ts:336
  caller: server/lib/tamper-proof-audit.ts:334
```

The second caller is the **tamper-proof audit log reader**.

**Net: tenant isolation is single-layer.** It rests entirely on the application — a global
default-deny `/api` boundary (which live probing confirmed holds, §LP-08) plus per-query
`organization_id` predicates. There is no database-level backstop today.

### The static gate covering that single layer is narrow

`scripts/ci/check-tenant-isolation.mjs` scans **raw SQL string literals only**, for **32
named tables**, and:

- tolerates **25 baselined violations**, including on `users` (16), `document_chunks` (3),
  `stripe_events` (3), `documents` (2), `rag_chunks` (2), `rag_documents` (2) and
  `audit_events` (1);
- puts **Drizzle query-builder calls entirely out of scope** (`:14-17`) — and Drizzle is the
  primary data-access path;
- **blanket-exempts all of `server/workers/` and `server/jobs/`**, plus 21 named files
  including `routes/admin/master-admin.ts`, `routes/admin/business-center.ts` and
  `routes/admin/access-management.ts`;
- states its own limits in its header: the table list *"is intentionally narrow."*

Its per-entry justification discipline (`check-baseline-justifications.mjs`, bidirectional
parity enforced) is genuinely excellent — see Chapter 11. But a gate that cannot see the
main ORM is not a measure of isolation.

### 5.1.1 A live instance of the pattern that caused the last P0

Commit #1186 fixed a P0 in which CMC Module 3 upserts landed on another tenant's rows. Four
ingredients: a UNIQUE index omitting the tenant column, an `ON CONFLICT` arbitrating on it,
a `DO UPDATE SET` omitting `organization_id`, and an id taken from the URL without an
ownership check.

**All four are still present in the Schedule-of-Events subsystem:**

| Ingredient | Location |
|---|---|
| UNIQUE index omits the tenant column | `db/migrations/20260617_project_schedule_of_events.sql:48` — `CREATE UNIQUE INDEX unique_project_schedule ON project_schedule_of_events (project_id)`, on a table whose `organization_id` is `INTEGER NOT NULL REFERENCES organizations(id)` (`:28`) |
| `ON CONFLICT` arbitrates on it; SET omits the tenant | `server/services/projects/schedule-of-events/service.ts:390-403` |
| id from the URL, ownership not asserted | `server/routes/project-schedule-of-events.ts:105-120` — `resolveProjectType()` (`:73-86`) *is* org-scoped but returns `null` on a miss and the handler **proceeds anyway** (`:108-110`) |
| ids are globally enumerable | `projects.id` is a global serial |

Mounted at `server/bootstrap/register-concept2cure-routes.ts:15` behind `authenticateToken`
only — so any authenticated user of any tenant can reach it.

Note the contrast within the same file: the sibling `DELETE FROM project_workflow_stages`
at `service.ts:423-425` **is** org-scoped. The header upsert is the outlier, which is what
makes this a slip rather than a design position.

**The #1186 commit message asserts** *"Every one of the repo's other ON CONFLICT sites
already scoped by org."* There are **115 `ON CONFLICT (` sites** in `server/`. Most are
benign (primary-key or system-table arbiters), but the assertion is not accurate, and other
project/study-scoped arbiters on tenant-bearing tables warrant the same review:
`services/conversation-os/persistence.ts:33,108,182`,
`services/protocol-budget/protocol-budget-service.ts:44`,
`services/study-design/study-design-repository.ts:242`,
`src/routes/stability.router.ts:1367`,
`services/protocol-soa/protocol-soa-service.ts:48`,
`services/innovation/submission-readiness-twin-service.ts:1056`.

> **Evidentiary note.** These are derived from code and schema and adversarially reviewed.
> They were **not** demonstrated against a live two-org deployment — no authenticated
> cross-tenant runtime probe was run (Chapter 01 §1.4). They should be reproduced with a
> two-tenant integration test before being treated as confirmed exploits.

### 5.1.2 Coverage holes visible in the installed schema

From the fresh install (`evidence/10-fresh-install-gap.json`):

| Measure | Count |
|---|---:|
| Tables with RLS enabled | 584 |
| Policies installed | 572 |
| **RLS enabled but ZERO policies** | **21** |
| **RLS not enabled at all** | **118** |

The 21 enabled-with-no-policy tables are the sharpest edge: under `FORCE ROW LEVEL SECURITY`
a policy-less table denies everything to non-owners and passes everything to the owning role
— either way it is not performing isolation. The RLS allowlist itself is only 6 tables
(`organization_users`, `__drizzle_migrations`, `stripe_events`, `billing_budgets`,
`billing_alerts`, `api_keys`), so the other 133 are unintended.

---

## 5.2 There is no single canonical schema

Four competing sources of truth:

| Source | Scale | Visible to `drizzle-kit push`? |
|---|---:|---|
| `shared/schema.ts` | 19,826 lines, **416** `pgTable` | ✅ — the only path `drizzle.config.ts` knows |
| `shared/schema/` (83 files) | ~272 more `pgTable` | ❌ — only **8** are re-exported (`schema.ts:39-46`); ~75 files are invisible |
| `shared/cmc-schema.ts` | 13 | ❌ |
| Raw SQL migrations | **1,175** distinct tables | ❌ |

Measured repo-wide: **699 distinct Drizzle table names** and **1,175 in SQL**, of which
**549 exist only in SQL**. **11 table names are declared twice in Drizzle** and **140 tables
have duplicate `CREATE TABLE` definitions across files** — the audit's own count against the
repo's baselined 63, the difference being that this sweep includes archived trees the CI
checker excludes.

Where two definitions of the same table disagree on columns, types or constraints, the
resulting shape depends on which file ran — which is a data-corruption class, not a tidiness
one. `audit_logs` is defined in **three** files.

## 5.3 The migration system cannot reliably produce the needed schema

Three mechanisms, partially overlapping:

1. **`drizzle-kit push`** — `shared/schema.ts` only. `install-fresh.mjs:6-10` notes it
   *"creates ZERO row-level-security policies (push cannot emit policies)."*
2. **`scripts/db/install-fresh.mjs`** — the only from-scratch path: schemas/extensions →
   push → multi-pass overlay of `migrations/` → the authoring subsystem → RLS migrations.
3. **`scripts/db/deploy-migrate.mjs`** — the production deploy-time applier (#1180), gated
   in `deploy-aws.yml` (`deploy-api` and `deploy-worker` both `needs: migrate`). Applies
   `C2C_MIGRATION_FILES` — **25 files**.
4. **`server/db/ensureCoreTables.ts`** — runs at boot and, despite documenting that it
   *validates*, contains **7 `CREATE TABLE IF NOT EXISTS`** statements and auto-creates on
   miss (`:470-475`). §LP-09b proves this: booting the server grew the database from 702 to
   717 tables.

**The gaps between them, measured:**

- `migrations/meta/_journal.json` has **1 entry** for a 171-file tree. Drizzle's journal is
  meaningless here; nothing replays `migrations/` in order.
- **`db/migrations/` is largely orphaned**: 228 files, of which 43 are `_gcc_` (applied by a
  separate psql loop in CI) and 4 are authoring (applied by install-fresh). **The other ~181
  are on no automated apply path.** `db/migrations/migrations_manifest.json` lists them and,
  per #1186, *"nothing consumes"* it.
- **Starting the app mutates the schema** (§5.3.1 below), so two environments on the same
  image can diverge based on boot history.

### 5.3.1 What this produces in practice — proven by running it

`scripts/db/install-fresh.mjs` on an empty Postgres prints **`✅ Application schema install
complete`** and delivers 702 tables / 572 policies, beating the claimed 687/557. On the way
there it reports:

```
pass 3: applied=0 already-present=0 deferred=10 hard=0
• 10 file(s) left unapplied — … "safe to skip for the app schema"
```

**"Safe to skip" is false for at least four of the ten.** Verified against the resulting DB:

| Skipped migration | Blocked on | Present after install? | Non-test server files querying it |
|---|---|---|---|
| `0011_ai_threads_title.sql` | `ai_threads` | **no** | 8 |
| `20260601_chat_message_metadata.sql` | `chat_messages` | **no** | 11 |
| `0004`/`0007_*` | `unified_documents` | **no** | 13 |
| `0016`/`0017_module3_*` | `cmc_source_objects` | **no** | 12 |
| `0006_regulatory_atoms.sql` | `cmc_projects` | **no** | 5 |
| `0008_critical_fk_delete_policies.sql` | `user_sessions` | **no** | 0 |

`ai_threads` and `chat_messages` appear in **no Drizzle schema at all**; their only creator
is `db/migrations/20260224_ai_trace_chain.sql`, which is in the orphaned tree. Yet
`server/routes/chat/threads.ts:40,96,173`, `server/routes/chat/send-message.ts:102` and
`server/routes/conversation-thread-routes.ts:141` query them in raw SQL, and both modules
**are mounted** (`register-ai-routes.ts:2`, `register-clinical-intel-routes.ts:230`).

`README.md:25` calls the AnA chat surface *"the product."* On a correct from-scratch install,
it queries tables that do not exist.

### 5.3.2 Fifteen schemas are missing after the supported install; five have no path at all

The installer creates `audit`, `lumen`, `precedent`, `public`, `vault`. Server code issues
SQL against fifteen more that do not exist:

| Schema | Tables referenced | Sites | Route family mounted? |
|---|---:|---:|---|
| `innovation` | 27 | 139 | **yes** (`register-advanced-platform-routes.ts`) |
| `cortex` | 23 | 29 | service only |
| `intelligence` | 14 | 51 | — |
| `regulatory_intel` | 11 | 32 | — |
| `regulatory_harmonization` | 9 | 23 | — |
| `clinical_ops` | 7 | 40 | **yes** (`register-regulatory-routes.ts`) |
| `intelligent_docs` | 7 | 24 | **yes** (`register-core-routes.ts`) |
| `signing` | 7 | 16 | not mounted |
| `compliance` | 7 | 11 | — |
| `labeling` / `site_intel` | 5 / 5 | 17 / 17 | — |
| `manufacturing` | 4 | 23 | **yes** (`register-regulatory-routes.ts`) |
| `ectd` | 4 | 14 | — |
| `predicate` | 4 | 7 | — |
| `core` | 1 | 9 | — |

Note `predicate` versus the created `precedent` — a **schema-name mismatch**, not just an
absence.

**Corrected after verification (Chapter 03, C2).** `install-fresh.mjs` creates **none** of
the 15 — confirmed live. But the script's own closing output, and CI (`ci.yml:296, 354, 494`),
prescribe a follow-on `db/migrations/*_gcc_*.sql` psql loop that applies cleanly (43/43) and
creates **9** of them (`innovation`, `cortex`, `signing`, `manufacturing`, `compliance`,
`labeling`, `site_intel`, `ectd`, `core`). `clinical_ops` self-provisions at runtime
(`clinical-operations-routes.ts:113-214`).

**Schemas with no provisioning path anywhere in the repository: 5** — `intelligence`,
`intelligent_docs`, `regulatory_intel`, `regulatory_harmonization`, `predicate`.

Two things sharpen rather than soften:

- **The route-family impact stands and was understated.** Even after the *full* documented
  install, at least four mounted route families still cannot serve a request:
  `/api/intelligent-docs`, `/api/regulatory-precedent-intelligence`, `/api/harmonize`, and
  `/api/precedent-engine` + `/api/predicate-intelligence`.
- **The operator hazard is real.** `install-fresh.mjs` does not run the gcc loop itself, so a
  buyer following the script's advertised "one supported path" gets **all 15** missing.

Nothing in CI detects this, because `check-unbacked-tables.mjs` verifies that a `CREATE` exists
*somewhere in the repo*, not that the file is on an apply path.

## 5.4 Why the proof-tier tests did not catch this

They are excellent (Chapter 08) and they are aimed elsewhere. `tests/schema-contract/` applies
**real migration files** to PGlite and asserts the resulting schema — proving each migration
is *internally* consistent and re-runnable. It does not assert that the applied set is
*complete* against what the application queries. That is the missing test, and it is
straightforward to add: the check this audit ran
(`evidence/fresh-install-gap.mjs`) is ~150 lines and could run in CI against a throwaway
database.

---

## 5.5 Remediation, in order

| # | Action | Gate | Effort | Acceptance test |
|---|---|---|---|---|
| 1 | Add a **fresh-install completeness gate** to CI: provision an empty DB, run `install-fresh.mjs`, diff every schema and table referenced in server SQL against what exists. Fail on any gap. | G1 | days | The gate fails today on 15 schemas; it must pass. |
| 2 | Make `install-fresh.mjs` **fail loudly** on unapplied migrations instead of printing `✅` and calling them "safe to skip". | G1 | hours | Empty DB + a deliberately broken migration → non-zero exit. |
| 3 | Fix the **Schedule-of-Events tenant arbiter** (tenant column in the unique index, `organization_id` in the SET list, 404 when `resolveProjectType` returns null). | G1 | hours | Two-org integration test: org A cannot upsert org B's schedule. Model it on `tests/schema-contract/cmc-module3-tenant-arbiter.contract.test.ts`. |
| 4 | Audit the remaining **114 `ON CONFLICT` sites** and every Drizzle upsert on a tenant-bearing table. | G1 | weeks | A contract test per tenant-bearing arbiter. |
| 5 | Retire or wire the **181 orphaned `db/migrations/` files**; make the manifest authoritative or delete it. | G1 | weeks | Every `.sql` file is either on an apply path or in `_legacy/`. |
| 6 | Move `ensureCoreTables`' 7 `CREATE TABLE`s into migrations; make boot **validate only**. | G2/G3 | days | Booting twice against a fresh DB leaves the table count unchanged. |
| 7 | Complete the **`requestDb(req)` migration** for the remaining 81 route files, then flip `RLS_ENFORCE=on`. | G1 | months | `RLS_ENFORCE=on` in staging with all golden journeys green, plus a cross-tenant probe returning zero rows. |
| 8 | Reconcile the **140 duplicate table definitions**, starting with any whose definitions disagree. | G2 | weeks | `ci:duplicate-table-ddl` baseline reaches 0. |
| 9 | Add policies to the **21 RLS-enabled-no-policy** tables; decide explicitly on the 118 with RLS off. | G3 | days | No table is RLS-enabled without a policy outside the 6-entry allowlist. |

Item 7 is the long pole and the one that actually closes the tenant-isolation risk. Items 1
through 3 are days of work and remove the sharpest edges — a fresh deployment that silently
half-works, and a live cross-tenant write path.
