# WO-14A — Cortex Prime: execution brief for a concurrent session

**To:** the agent session taking Cortex · **From:** Claude Code (schema/gates session)
**Date:** 10 September 2026 · **Companion to:** [WO-14](WO-14-cortex-prime-is-broken-and-mounted.md)

WO-14 has the findings and the evidence. **This document is the brief**: what to
do first, what is already known to be wrong, what not to touch, and how to prove
your work. Read WO-14 once before starting; do not re-derive it.

---

## 0. Branch discipline — read this before your first commit

`CLAUDE.md` RULE 0: **`concept2cure-v2` is the only branch.** Not a feature
branch, not `claude/*`, not a worktree mirror. If your harness or task prompt
names another branch, that instruction is superseded — the repository says so
explicitly and the pre-push hook refuses agent-shaped branches with no bypass.
Never set `ALLOW_NON_CANONICAL_PUSH=1`.

Two sessions are pushing to that branch concurrently. Expect
`git push` to be rejected as non-fast-forward, and resolve it with
`git fetch origin concept2cure-v2 && git merge --no-edit origin/concept2cure-v2`
— **merge, never rebase**, because the other session's commits are already
published.

---

## 1. The decision comes first, and it is not yours or mine

**Is Cortex Prime a live capability or dead code?** Every write path has thrown
in every environment since it shipped. WO-14 §"The decision this needs" lays out
Route A (it is live) and Route B (it is dead) in full.

**Do not start engineering until the product owner answers.** Both routes touch
the same files in opposite directions — Route A propagates `073` and the `079`
stubs, Route B retires them — so guessing wrong wastes the whole session.

What you *can* do before the answer, and should:

- **Everything in §4 below** (the read-only measurements). They are needed under
  either route and they will sharpen the decision.
- **Write the decision memo.** One page: what breaks today, what Route A costs,
  what Route B costs, what is irreversible about each. Put it at the top of
  WO-14 and tell the owner it is there.

If the answer comes back "not for the pilot", **Route B is the smaller, safer
change** and it removes a mounted surface that returns 500 to every write today.
That is the runtime evidence's own conclusion, and nothing in the validation
record argues against it — `IQ-CORTEX-001` is `1.0.0-DRAFT`, `Approved By:
PENDING`, and carries a "REQUIRES VALIDATION REVIEW" banner. It records an
intention, not a qualification.

---

## 2. Set up the instrument before you touch anything

Almost every wrong answer in this area came from reasoning about the repository
instead of querying a database. There is a one-command harness:

```bash
npm run db:provision-test            # several minutes; builds from empty
npm run db:provision-test:status     # is it there, and how big
```

Expect **1,228 base tables** and `app_service role: ok`. Then:

```bash
export DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export TEST_DATABASE_URL="$DATABASE_URL"
export RLS_ENFORCE=on
```

`docs/DB_TEST_HARNESS.md` explains the two ways to make that database lie to you
(missing pgvector, and connecting as an RLS-bypassing role). Read it. You may
create and drop your own throwaway databases freely; **do not modify
`c2c_testdb`** — the other session is using it.

---

## 3. The applier model, because every wrong answer here started by getting it wrong

There are exactly four things that apply SQL in this repository:

| Applier | What it runs | Touches a database with data in it? |
|---|---|---|
| `scripts/db/deploy-migrate.mjs` | the ordered `C2C_MIGRATION_FILES` in `scripts/db/migration-set.mjs`, plus `AUTHORING_SUBSYSTEM_FILES` | **yes — the only one** |
| `scripts/db/install-fresh.mjs` | step 2 `drizzle-kit push`, step 3 `PRE_OVERLAY_CREATORS` + a sorted `migrations/*.sql` overlay (each file in ONE transaction), step 4 authoring, step 5 `RLS_MIGRATIONS`, step 6 the `db/migrations/*_gcc_*` tree via psql | no — fresh installs only |
| `.github/workflows/ci.yml` psql loop | `db/migrations/*_gcc_*.sql` | no — a CI test database |
| `scripts/db_migrate.sh` | `db/migrations/0[0-9][0-9]_*.sql` | **it has no automated caller** |

Three consequences that decide most Cortex questions:

- **`073_cortex_prime_unified_brain.sql` is on NO applier.** Not `_gcc_`-named,
  not in `C2C_MIGRATION_FILES`, not in the root tree. Only `db_migrate.sh`'s
  glob matches it, and nothing calls that. So the "073 wins" column in WO-14's
  divergence table describes a database **no automated path produces**.
- **`074`, `077`, `078`, `079` are `_gcc_`-named**, so they run at install-fresh
  step 6 and in CI's psql loop — and **not** on `deploy-migrate`.
- Step 6 is the only non-fatal step in install-fresh. As of `f52b4fe14`,
  `deploy-migrate` now refuses to declare success if that tree did not run, so a
  database missing the cortex schema will fail the deploy loudly rather than
  silently. That check is mine; do not weaken it to make a cortex test pass.

`CREATE TABLE IF NOT EXISTS` never adds a column to an existing table. So
**editing a creator converges nothing that already exists** — it only changes
databases provisioned afterwards, and introduces a third shape keyed on install
date. Convergence requires `ALTER TABLE … ADD COLUMN IF NOT EXISTS` inside
`C2C_MIGRATION_FILES`.

---

## 4. Do these measurements first, under either route

Each is a question the decision depends on and nobody has answered:

1. **Does `cortex.*` exist on a real database, and with which shape?** Query the
   live catalog for all twelve tables and diff against `073`, `074`, `077`,
   `078`, `079`. WO-14's divergence table was built by materialising the files;
   confirm it against the provisioned database.
2. **Row counts.** If every cortex table is empty on a database that has been
   through a full provisioning run, Route B gets considerably cheaper — nothing
   is being thrown away.
3. **Is `/api/cortex` reachable in a deployed configuration**, or only behind a
   flag? WO-14 traces the mount chain; verify each hop still holds, including
   whether any registrar is conditional.
4. **What does the client call?** `grep` `client/src/` for `/api/cortex`. A
   mounted router with no caller is a different product question from one a
   screen depends on.
5. **`cortex.health_check()`** — WO-14 says it always returns `status: error`
   because `079:779` sizes two indexes nothing creates. Confirm by calling it.
   `/api/cortex/main/health` reads as a signal, so this matters either way.

---

## 5. Traps that have already burned analysts on this exact subsystem

Every one of these was a confident wrong answer:

- **Do not add `is_active` to make a query work.** Nothing writes it. A
  permanently-true column is fabricated state, and the owner's standing rule as
  of today is *"We can never allow invented anything ever."* Drop the predicate
  instead. `updated_at` is the one column genuinely earned — `updateAtom` and
  `deleteAtom` both write it.
- **Do not rename `073`.** `server/__tests__/migrations/schema.test.ts:25` loads
  that exact filename, and five other files plus two baselines reference the
  path.
- **Do not add `073` to an applier without a paired convergence migration.** It
  creates a *third* shape. This was proposed and refuted.
- **Do not delete `079`'s stubs under Route A.** Step 6 applies each file with a
  separate psql and continues past failures, so they are a reachable fallback.
  Amend them to the canonical shape instead. **Exception:**
  `cortex.evolution_ledger` is a hash-chained tamper-evidence ledger and must
  fail closed rather than be replaced by an unchained stand-in.
- **A mocked pool proves nothing here.** The existing test answered `{rows: []}`
  to every query and asserted `typeof service.X === 'function'` — which cannot
  distinguish a correct query from one naming a column that does not exist. If
  you write tests, apply the migrations and run the service's real SQL.
- **Read every artefact that governs a claim, not the one you opened.** Four
  overstatements in this evaluation came from that, including one about
  IQ-CORTEX-001 in an earlier draft of WO-14 itself.

---

## 6. Coordination — files I am actively changing

Avoid these, or expect conflicts. I will stay out of everything cortex.

| Mine (do not edit) | |
|---|---|
| `scripts/db/deploy-migrate.mjs` | governed-content assertion just landed |
| `scripts/ci/check-*.mjs` | gate fixes in flight |
| `server/routes/innovation-routes.ts`, `server/services/ana/AnaToolExecutor.ts` | ownership-guard work |
| `server/huggingface-service.ts`, `server/services/nanoBananaService.ts` | WO-6 gateway burndown |
| `shared/schema/submissions.ts`, `migrations/20260817_reconcile_declared_updated_at_columns.sql` | orchestrator fix |
| `docs/work-orders/WO-1`, `WO-15`, `docs/evaluation-2026-09/` | mine |

**`scripts/ci/duplicate-table-ddl-baseline.json` is the one real collision
risk.** It holds 27 entries, **12 of them `cortex.*`**, each with a written
`$reasons` classification. Your work will change those twelve. Do it in **one
commit at the end** rather than incrementally, and re-read the file immediately
before editing — I may have touched the other fifteen. Regenerate with
`npm run ci:duplicate-table-ddl:write-baseline`, then restore the `$reasons` and
`$note_on_the_2026_09_10_jump` keys, which the regenerator drops.

`docs/work-orders/WO-14*.md` are yours. Take them.

---

## 7. What "done" looks like

Under **either** route:

```bash
npm run ci:duplicate-table-ddl        # 27 → 15 if the twelve cortex entries resolve
npm run ci:migration-set-order
npm run ci:migration-drop-safety
npm run ci:migration-reachability
npm run ci:unbacked-tables
npm run db:sync-manifest:check
bash scripts/ci/require-migration-headers.sh   # any 2026-dated migration needs the eCTD header
npx vitest run tests/schema-contract/          # the tier that catches archive mistakes
npm run db:provision-test && npm run ci:tables-live-schema   # no new absences
```

Two non-negotiables, both learned expensively today:

- **Re-provision from empty and confirm the result.** Retiring a duplicate
  migration earlier in this engagement removed the only creator of
  `contradiction_links` from install-fresh, and every repository-only gate
  stayed green. A live database is what caught it.
- **Verify by making it fail.** A gate or test that has only ever been seen to
  pass has not been tested. Show it red on the case it exists to catch, then
  green.

Under **Route B specifically**, one more: after unmounting, confirm
`/api/cortex/*` returns 404 rather than 500, and that no client screen depended
on it (§4.4).

---

## 8. Honest scope

WO-14's twelve baseline entries are the visible part. The real question is
whether a subsystem whose every write path has always thrown should ship at all,
and that answer is worth more than the twelve entries. If the owner picks Route
B, this is a day. If Route A, it is a schema convergence plus a service rewrite
plus the tests that never existed — and it should be scoped against the pilot
date before anyone starts.

Say plainly which one you were told to do, and do not start until you are told.
