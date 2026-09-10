# WO-14 — Cortex Prime is mounted and broken on every write path

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN — needs a product decision before any engineering
**Blocks:** G1+ (real customer data), and G3 on the validation question

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
