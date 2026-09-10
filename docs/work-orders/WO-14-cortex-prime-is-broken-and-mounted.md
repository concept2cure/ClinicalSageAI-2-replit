# WO-14 — Cortex Prime is mounted and broken on every write path

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN — needs a product decision before any engineering
**Blocks:** G1+ (real customer data), and G3 on the validation question

---

## Decision memo — 10 September 2026, from the session that took Cortex

**One question, for the product owner:** is Cortex Prime a live capability for
the pilot (**Route A**) or dead code (**Route B**)? Nothing below is engineering.
It is the five measurements WO-14A §4 asked for, taken on a database provisioned
from empty this afternoon (`npm run db:provision-test`: 1,228 base tables,
pgvector present, `app_service role: ok`), plus one HTTP probe against that
database with the real router, the real pool, `RLS_ENFORCE=on`, and only the
JWT step faked.

### What breaks today

| | Measured |
|---|---|
| Mount chain | Unconditional at every hop: `server/index.ts:145` → `startup/routes.ts:127` (inside `registerPreStartRoutes`) → `register-document-routes.ts:425` (a `try`, not a flag, and outside the `DEMO_ROUTES_ENABLED` block) → `cortex-unified.ts:1145-1147` → `cortexRoutes.ts`. No flag gates any of it. |
| HTTP, as deployed | `POST /api/cortex/atoms` **500**, `GET /api/cortex/atoms/:id` **500**, `DELETE` **500** — JSON `{"error":"Internal server error"}` from `cortexRoutes.ts:690`. `GET /api/cortex/main/health` 200 with `{"status":"error"}`. `GET /api/cortex/health` — the one on the public allowlist — 200 `"healthy"` from a static handler (`cortex-unified.ts:151`) that never touches the database. |
| Service SQL | All eleven methods WO-14 names fail on the provisioned shape, confirmed by `EXPLAIN` on the literal statements. It is worse than one column each: the service names **27 columns the shape lacks, across six tables**, before the three `is_active` predicates. `createThread` names 9 columns and 7 are absent; `createTrace` 9 and 5; `createEdge` 7 and 4. `getExpertiseScores` also lacks `domain_area` and `expertise_level`, so removing its `is_active` predicate would return rows whose mapped fields are undefined. |
| Tenant key | `cortexRoutes.ts:174` passes the integer `organizationId` from the JWT, stringified, into `cortex.atoms.org_id uuid`. With every column present, every write would still fail on type. WO-14 did not list this. |
| Schema shape | `073` is on no applier — proven, not inferred: `cortex.atom_types`, which only `073` creates, does not exist on the provisioned database. The live shape is `074` for `atoms` and the `079` stubs for `edges`, `agents`, `traces`, `threads`. Columns, 073 vs live: atoms 15/13, edges 9/6, agents 13/8, traces 15/10, threads 12/5 — WO-14's table holds exactly. The two shapes also disagree on names (`strength`/`weight`, `config`/`context`, `input_data`/`input`, `evidence_text`/nothing) and on `agents.capabilities` (`TEXT[]`/`JSONB`). |
| Rows | 0 in eleven of the twelve tables. 9 in `domain_knowledge`, all from the seed at `078:783` (five therapeutic areas, two pathways, two submission types). Nothing user-written exists anywhere. |
| Callers | `client/src`: **0 files contain the string `cortex`.** Server-side, nothing outside `cortexPrimeService.ts` references any `cortex.*` table or function; the 34-table, 30-function schema that `074`–`079` create is reachable only through that service, through `cortexRoutes.ts`. The other sub-routers under `/api/cortex` (advisory, query, ana, the inline thread and chat routes) read `lumen_data_atoms` and `chat_threads`, not `cortex.*`. |
| `cortex.health_check()` | `{"status":"error","error":"relation \"idx_atoms_embedding_3072\" does not exist"}` — as WO-14 predicted; nothing in the repository creates either index it sizes. |
| RLS | `atoms`, `threads`, `traces` are policied and FORCED on `org_id` by the uuid sweep. `agents` and `edges` have no tenant column and no policy. `expertise_scores` has RLS enabled and one policy, `expertise_read`, whose predicate is `true`. |

### Route A — it is live

**Cost.** (1) Choose the canonical shape — 073's and 079's disagree on names
and types, so this is a design decision, not a merge — then write the
convergence migration in `C2C_MIGRATION_FILES` (`ALTER TABLE … ADD COLUMN IF
NOT EXISTS`, the 27 columns above). (2) Put `073` on install-fresh step 6 by a
named list, not a rename, and amend the 079 stubs to the canonical shape,
`evolution_ledger` excepted. (3) Rewrite the eleven methods, move the routes to
the uuid tenant key, and drop the `is_active` predicates rather than add the
column. (4) Fix `079:779` and the late-bound references at `074:587` and
`079:617`. (5) A real-database contract test that runs the service's SQL; the
mocked one proves nothing. (6) Decide RLS for `agents`, `edges`,
`expertise_scores`. (7) Only then the twelve baseline entries. And it ships an
API with no screen: Route A is the schema work *and then* a product surface that
does not exist yet. Days, not a day, and IQ-CORTEX-001 stays `1.0.0-DRAFT` until
someone qualifies it.

**Irreversible.** A file in `C2C_MIGRATION_FILES` replays on every deploy
forever (RULE 1); it can be amended in place, never dropped. The schema becomes
governed.

### Route B — it is dead

**Cost.** Unmount `cortexRoutes` at `cortex-unified.ts:1145-1147` — the other
sub-routers, the inline routes and the static `/health` stay, they do not use
`cortex.*`. Archive `cortexRoutes.ts`, `cortexPrimeService.ts`, its mocked test,
and `services/cortex/index.ts`'s `UnifiedCortexService` (no importer). Update
`services/index.ts:42,138`. Retire `073` (on no applier, so no database changes
shape) and the twelve `079` stubs together with the five `_v2` views and
`cortex.statistics` / `health_check` that read them (no callers). Update
`schema.test.ts`'s file list, `migrations_manifest.json`,
`AGENT_ARCHITECTURE.md:370`; mark IQ-CORTEX-001 superseded; resolve the twelve
baseline entries, 27 → 15. Verify by re-provisioning from empty and showing
`/api/cortex/atoms` returns 404 where it returns 500 today. About a day.

**What it leaves open.** `074`–`078` create 22 further tables and 22 functions,
all `_gcc_`, all on install-fresh and CI, all with zero callers once the service
is gone. That is a separate retirement; I would not fold it into this change.

**Irreversible.** Nothing on a database: no DROP is issued, and the tables stay
as empty orphans wherever they exist. Code comes back from git. The IQ draft was
never approved, so nothing is retracted.

### Recommendation

Route B for the pilot, unless a screen or a customer commitment exists that the
repository cannot show me. Every measurement says the same thing: no write has
ever succeeded, nothing reads it, and the only record of intent is an unapproved
draft.

---

## The finding

Every write method and five read methods of `server/services/cortexPrimeService.ts`
issue SQL against columns that **no migration creates, on any applier**. The
router is mounted. The endpoints return HTTP 500.

This was not found by a gate. It was found by an adversarial review that
materialised the cortex schema from the migration files — in each applier's own
sort order — on a real PostgreSQL 16 and ran the service's literal SQL against
both shapes.

### Confirmed by execution, on both shapes

| Method | Line | Fails on |
|---|---|---|
| `getAtom` | :310 | `column "is_active" does not exist` |
| `updateAtom` | :355 | same |
| `deleteAtom` | :367 | same |
| `getThread` | :555 | same |
| `getExpertiseScores` | :846 | same |
| `createAtom` | :280 | `source_id`, `quality_score`, `metadata` |
| `createThread` | :530 | `title`, `context_atom_ids`, `expires_at` |
| `createAgent` | :634 | `agent_name`, `description`, `prompt_template` |
| `createEdge` | :466 | `evidence`, `metadata` |
| `createTrace` | :585 | `input`, `output`, `reasoning`, `status`, `token_usage` |
| `completeTrace` | :615 | `completed_at`, `duration_ms`, `started_at` |

`is_active` appears in **no** definition of `cortex.atoms`, `cortex.threads` or
`cortex.expertise_scores` anywhere in the repository, and no `ALTER TABLE …
ADD COLUMN` adds it on any applier.

**One withdrawal, recorded because it was part of the original suspicion:**
`getAgent` (:656) is fine. `cortex.agents` *does* carry `is_active`, in both
`073:66` and `079:45`.

### The failing column differs by environment

`createEdge` fails on `evidence` against an operator-provisioned database and on
`strength` against a fresh install. That is not noise — it is the cleanest
available demonstration of evaluation §4's thesis, because the two appliers
build genuinely different shapes:

| Table | `db_migrate.sh` (073 wins) | `install-fresh` (074/079 win) |
|---|---:|---:|
| `cortex.threads` | 12 cols | **5** |
| `cortex.agents` | 13 cols | **8** |
| `cortex.traces` | 15 cols | **10** |
| `cortex.edges` | 9 cols | **6** |
| `cortex.atoms` | 15 cols | **13** |

`cortex.agents` loses `gxp_validated` and `validation_protocol_ref` on a fresh
install — GxP validation fields — and its `capabilities` column silently flips
`TEXT[]` → `JSONB`.

**Correction to an earlier read of this same group:** only **five** tables
diverge. The other seven `cortex.*` collisions (`distilled_insights`,
`domain_knowledge`, `evolution_ledger`, `expertise_scores`,
`learning_experiences`, `regulatory_signals`, `rejection_patterns`) are 079
stubs that lose to 074/077/078 on every applier that runs them — dead code, not
divergence.

## It is reachable

```
server/startup/routes.ts:127
  → server/bootstrap/register-document-routes.ts:425-426   app.use('/api/cortex', …)
    → server/routes/cortex-unified.ts:1432 mountSubRouters()
      → :1145-1147                                          router.use('/', cortexRoutes)
```

`cortexRoutes.ts` :170/:187/:199/:214 define `POST/GET/PATCH/DELETE /atoms[/:id]`,
and `cortex-unified` defines no competing `/atoms` route. `asyncHandler`
forwards to `next(err)`; `cortex-unified.ts:138-144` logs and returns 500. **Not
swallowed — visibly broken.**

## Why nothing caught it

Three independent reasons, each worth fixing on its own.

1. **The test mocks the boundary the bug lives on.**
   `server/__tests__/services/cortexPrimeService.test.ts` called itself
   *"Integration Tests"* and claimed to *"ensure core functionality remains
   intact"*. All 29 assertions are `expect(typeof service.X).toBe('function')`,
   and the pool is mocked to answer `{ rows: [] }` to any query. A mock that
   answers every query identically cannot distinguish a correct query from one
   naming a column that does not exist. **Relabelled 2026-09-10**; the
   assertions are kept as a module-shape smoke test and the header now says what
   they do not cover.

2. **The migrations apply green.** `074:542,587` and `075:509-512,583-597`
   reference `cortex.atoms.metadata` and `cortex.atoms.is_active` inside
   PL/pgSQL bodies. Function bodies are late-bound, so those migrations succeed
   at apply time and three further service methods throw only when called.

3. **A security comment overstated its own safety margin.**
   `server/middleware/auth.ts:367` asserted cortexRoutes *"is not mounted by any
   bootstrap registrar"*, and that was one of two stated reasons a
   `requireOrgAccess` bypass was graded latent rather than exploitable. It is
   false. **Corrected 2026-09-10** — the surviving reason (no handler reads an
   org id from request input; all six take it from `req.user.organizationId`)
   was re-verified and does hold, but it is a property of how six handlers
   happen to be written, not of the router being unreachable.

## The decision this needs, before any engineering

**Is Cortex Prime a live capability or dead code?**

Every write path has thrown in every environment since it shipped. That argues
for unmounting it.

**A correction, because I nearly filed this the other way.** An earlier draft of
this work order said `docs/validation/IQ-CORTEX-001-INSTALLATION_QUALIFICATION.md`
"presents the subsystem as installation qualified" and called that the most
serious finding here. It does not, and reading the document rather than its
filename is what settled it. IQ-CORTEX-001 is version **1.0.0-DRAFT**, dated
2025-01-24, **Approved By: PENDING**, and carries a banner: *"⚠️ DRAFT -
REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE"*. That is exactly the right
state for an unvalidated subsystem, and there is no contradiction between the
runtime evidence and the validation record. The record makes no claim.

(That is the fourth time in this evaluation that reading one artefact and
concluding produced an overstatement — the others were `stab_signoffs`, WO-11's
middleware chain, and `regulatory_harmonization`'s RLS. The standing correction:
a claim about a subsystem is a property of every artefact that governs it, never
of the one you happened to open.)

What the draft does establish is intent: somebody set out to qualify this, which
is why deletion is not the obvious answer and why the choice below is a product
call rather than a cleanup. It is not mine to make.

### Route A — it is live

1. Add `073_cortex_prime_unified_brain.sql` to install-fresh's step-6 list via a
   named `NON_GCC_TREE_CREATORS` list. **Not a rename** —
   `server/__tests__/migrations/schema.test.ts:25` loads that exact filename,
   and five other files plus two baselines reference the path. `073`'s
   `vector(1536)` and hnsw index are already handled by install-fresh's
   `isVectorTypeMissing` (its regex matches both `type "vector" does not exist`
   and `access method "hnsw" does not exist`), so it would be skipped-and-named
   exactly as 074/077/078/079 already are without pgvector.
2. **Pair it with an `ALTER TABLE … ADD COLUMN IF NOT EXISTS` convergence
   migration inside `C2C_MIGRATION_FILES`.** Step 1 alone converges nothing that
   already exists — `CREATE TABLE IF NOT EXISTS` never adds a column to an
   existing table, so editing creators changes only databases provisioned
   afterwards and introduces a *third* shape keyed on install date. This is
   WO-1's exit criterion B and the reason it exists.
3. Do **not** delete 079's stubs. install-fresh step 6 applies each file with a
   separate `psql` and continues past failures (`:1343-1366`), so they are a
   reachable fallback; amend them to the canonical shape so a partial apply
   yields the same shape rather than a silently thinner one. **Exception:**
   `cortex.evolution_ledger` is a hash-chained tamper-evidence ledger and must
   fail closed rather than be substituted by an unchained 5-column stand-in.
4. Fix the service against the resulting schema — and do **not** add `is_active`
   to make the query work. Nothing writes it; a permanently-true column is
   fabricated state under the working agreement. Drop the predicate instead.
   `updated_at` is the one column genuinely earned: `updateAtom` and
   `deleteAtom` both write it.
5. Add a schema-contract test that applies the cortex migrations and runs the
   service's SQL — the coverage the mocked test never provided.

### Route B — it is dead

Unmount `cortexRoutes` (`cortex-unified.ts:1145-1147`), archive
`cortexPrimeService.ts`, update `server/services/index.ts:42,138` and
`server/services/cortex/index.ts:76`, and withdraw the IQ-CORTEX-001 draft (or
mark it superseded — it never left DRAFT, so nothing is being retracted). Under
Route B the schema action is the opposite of Route A: retire `073` and the `079`
stubs rather than propagate them.

**Route B is what the runtime evidence supports on its own.** Nothing in the
validation record argues against it; the draft IQ records an intention, not a
qualification. So the question for the product owner is simply whether that
intention still stands — and if the answer is "not for the pilot", Route B is
the smaller, safer change and it removes a mounted surface that returns 500 to
every write today.

## Two smaller items found alongside

- **`cortex.expertise_scores` has RLS enabled and no tenant column.** `077`
  creates it with an explicit comment — *"NO org_id - expertise is global AI
  capability"* — and `077:534` then runs `ENABLE ROW LEVEL SECURITY` on it. RLS
  on a table with nothing to key a policy against. Also note `expertise_tier` is
  `GENERATED ALWAYS AS (…) STORED`, so any stub "matching 077's key columns"
  cannot reproduce it as plain `TEXT`.
- **`cortex.health_check()` always returns `status: error`.** `079:779-780`
  sizes `idx_atoms_embedding_3072` and `idx_atoms_embedding_1536`, which no file
  in the repository creates, so its `EXCEPTION WHEN OTHERS` branch fires on
  every applier. Relevant because `/api/cortex/main/health` reads as a signal.
