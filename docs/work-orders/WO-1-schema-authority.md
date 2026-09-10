# WO-1 — Establish schema authority

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN — duplicates 64 → **31**, and the number itself was wrong until today · **Blocks:** external pilot on real customer data
**Prerequisite for:** WO-2, WO-3

> ### 2026-09-10 — where this actually stands
>
> **The count was understated, and the gate is what was broken.** Both
> `ci:duplicate-table-ddl` and `ci:unbacked-tables` matched `CREATE TABLE`
> followed by a *bare* identifier, so a leading double quote failed the match —
> and `drizzle-kit generate` quotes everything. `migrations/0000_sweet_joseph.sql`
> holds **297 CREATE TABLE statements**, is the largest migration in the
> repository, sits in the root `migrations/` tree that install-fresh's overlay
> walks, and both guards counted it as creating nothing. Fixed, and proved by
> making the old pattern fail on a quoted duplicate it reported as green:
> distinct tables 1150 → 1416, collisions 34 → 60.
>
> **Progress against the true number.** 60 → **31**, in four commits, every one
> checked against a database built from empty by `scripts/db/provision-test-db.sh`:
>
> | | What | Duplicates |
> |---|---|---|
> | Stage 0 | `scripts/db/provision-test-db.sh` — the harness the rest depends on | — |
> | Stage 1 | a byte-identical `q_sub` mirror; two `sql/` orphans; the db-verify fixture excluded after diffing all six shapes live | 47 → 34 |
> | gate fix | the 297 invisible definitions above | 34 → **60**, honestly |
> | Stage 2 | **18 files that no applier runs**, archived | 60 → **31** |
>
> **The block on WO-2 is lifted.** The third pass below refused five of five
> remediations because they turned on what a *populated* database contains,
> which no repository-only check can see. That instrument now exists and is
> repeatable (`npm run db:provision-test`, `docs/DB_TEST_HARNESS.md`).
>
> **What the remaining 27 are — and why this work order cannot finish them.**
> Every one of the 27 has now been diffed against a live database, and the
> answer is uniform: **none of them is dead text.** That is the material change
> in this work order's scope.
>
> | Count | What | Why WO-1 cannot resolve it |
> |---:|---|---|
> | 12 | `cortex.*` | parked by your call, pending WO-14's product decision |
> | 5 | hand-written DDL vs the pushed shape (`compliance_tracking`, `project_milestones`, `template_usage`, `vault.documents`, `vault.document_chunks`) | needs a convergence migration, or is already reconciled and the pair is the record of it |
> | 3 | `contradiction_*` | the two shapes differ by 14 CHECK constraints, a column type, six nullability flips and a `timestamptz`/`timestamp` split — plus a column-name split that breaks four writes on *either* shape (WO-15 §7) |
> | 3 | `submission_orchestrator_*` | the live shape is broken by a trigger writing a column push omits (WO-15 §6) |
> | 2 | `risk_items` / `risk_controls` | blocked on ledger C-29's open rename decision |
> | 1 | `c2c_template_specs` | **not a defect** — a verified byte-identical defensive guard |
> | 1 | `core.programs` | WO-15 §1; removing the entry fails `ci.yml:91` while both `CREATE`s remain |
>
> **So the original exit criterion is not reachable from here, and pretending
> otherwise would be the dishonesty this work order exists to remove.**
> Deleting `duplicate-table-ddl-baseline.json` requires WO-14 (12 entries) and
> C-29 (2). Promoting `:strict` to blocking requires the file to be empty, so it
> requires the same. And the remaining 11 are not deduplication at all — each
> needs an `ALTER TABLE … ADD COLUMN IF NOT EXISTS` inside `C2C_MIGRATION_FILES`,
> which is [WO-15](WO-15-schema-the-code-expects-that-no-deploy-creates.md)'s
> work, not this one's.
>
> **WO-1's remaining deliverable is therefore the baseline itself**, and it is
> done: all 27 entries carry a written classification, there is no "unreviewed"
> category, and two of them are marked as things that must NOT be "fixed" by
> removal. A reader can now tell parked from blocked from not-a-defect from
> outstanding, which was not true this morning.
>
> **Five live defects were found on the way and are NOT in this work order.**
> They are schema the code expects that no deploy path creates — including a
> `core.programs` that can be permanently missing `org_id` while a cross-tenant
> guard renders the failure as a silent deny. See
> [WO-15](WO-15-schema-the-code-expects-that-no-deploy-creates.md).

---

## What the code actually says

```
$ npm run ci:duplicate-table-ddl:strict
[ci:duplicate-table-ddl] scanned 593 non-archived .sql files;
1186 distinct tables; 64 defined more than once (strict mode)

$ npm run ci:migration-prefix-collisions:strict
[ci:migration-prefix-collisions] FAIL — 4 prefix collision(s) not in baseline
```

The baseline is **63**. The measurement is **64**. A table gained a second
definition and nothing caught it, because `:strict` runs in no pipeline (WO-4).

## Why this blocks the pilot

`CLAUDE.md` RULE 1: every migration re-runs on every deploy, unconditionally.
Drift is written to `c2c_migration_journal` and nothing reads it. Because every
duplicate definition is `CREATE TABLE IF NOT EXISTS`-guarded, the gate's own
output states the consequence:

> the surviving column set is decided by migration ORDER, not by code — and it
> can differ per environment.

So the schema of a deployed environment is not derivable from this repository.
Every downstream assurance claim — RLS coverage, the 611-table purge baseline,
audit reconciliation — asserts against a target that cannot be pinned down. A
tenant-isolation fix built on top of this is a fix you cannot prove.

## Scope

1. For each of the 64 tables, identify the **canonical** definition per ADR-0006
   (`docs/adr/0006-canonical-migration-lineage.md`) and reduce to one.
2. Resolve the 4 colliding prefixes across 13 files by renumbering, per the
   gate's own instruction (`ls migrations/ | grep -E "^[0-9]{4}_" | sort | tail -1`).
3. Amend creating migrations **in place** where a column must be removed. RULE 1
   is explicit: do not append a DROP. Each amendment carries a dated header note
   saying what was removed, why, and which change removed it.
4. Delete `scripts/ci/duplicate-table-ddl-baseline.json` and
   `migrations/.prefix-collisions-baseline.json`.

## Exit criteria

**Two of them, and the second was missing until 2026-09-10.** See
*The exit criterion was measuring the repository* below for why.

**A. The repository defines each table once.**

```bash
npm run ci:duplicate-table-ddl:strict          # exit 0, baseline file absent
npm run ci:migration-prefix-collisions:strict  # exit 0, baseline file absent
npm run ci:migration-set-order                 # still passes
npm run ci:migration-drop-safety               # still passes
npm run ci:migration-drop-safety:selftest      # failure branch still exercised
```

**Deleted, not rewritten.** `npm run ci:duplicate-table-ddl:write-baseline`
would turn this gate green in one command and is the wrong outcome. The
baseline's own header says: *"Each entry is a defect to be reconciled per
ADR-0006."*

**B. Every database that already exists converges onto that definition.**

For each table whose duplicate definitions DIVERGE in columns, a convergence
migration exists that is:

- `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — never a second `CREATE TABLE`,
- listed in `C2C_MIGRATION_FILES`, so RULE 1's unconditional re-execution
  carries it to already-provisioned databases,
- and verified against `ci:tables-live-schema` on a database restored from a
  real environment, not a fresh install.

Criterion A without criterion B is a repository that looks converged over an
estate that is not. A is cheap and visible; B is the one that changes what a
customer's database contains.

### The exit criterion was measuring the repository

Criterion A was the whole of this work order until an adversarial review of the
proposed cortex remediation rejected it. Two independent reviewers reached the
same conclusion:

> *All five primitives are created with `CREATE TABLE IF NOT EXISTS`. Adding
> 073 to install-fresh's step-6 list changes the shape ONLY on databases
> provisioned after the change. `IF NOT EXISTS` never adds a column to an
> existing table … So a change filed to remove a two-shape divergence instead
> introduces a THIRD shape keyed on install date.*

**You cannot converge duplicate `CREATE TABLE` definitions by editing
`CREATE TABLE` statements.** That is obvious once stated and it was not stated
anywhere in this work order, in the gate, or in ADR-0006. Every
already-provisioned database keeps the shape it has, whatever the repository
says afterwards.

RULE 1's replay guarantee is what makes convergence possible at all — and it is
a property of `applyMigrationFiles` over `C2C_MIGRATION_FILES`, which is
`deploy-migrate`. `install-fresh` provisions once. `db_migrate.sh` provisions
once and, per `.github/workflows/neon-preview-db.yml:92`, is expected to fail if
run at all. So a convergence step that is not in `C2C_MIGRATION_FILES` reaches
no existing database, and `ci:duplicate-table-ddl:strict` cannot tell the
difference — it reads files.

The same review corrected a second thing this work order depended on:
`db_migrate.sh` has **no automated caller**, so its 304 files are not
"operator-provisioned schema". 107 `.sql` files are reachable by it and nothing
else. Those tables may exist in no deployed database at all — which is what
ADR-0007 means by *"the deployed shape is canonical"*, and why promoting a
definition that only that script applies would have been backwards.

## Blast radius

High. Touches migration files that run on every deploy. Every change must be
validated against a from-scratch install (WO-2's harness) before merge.

## Estimate

2–3 weeks. The 64 are not uniform — expect a long tail where two definitions
diverged and picking either loses a column someone depends on. Those are the
ones to escalate, not to guess at.

---

## PROGRESS — 2026-09-10 (not closed)

**Duplicates 64 → 56.** Eight resolved. The remaining 56 are genuinely the
2–3 weeks this work order estimated; what follows is the map that makes them
tractable, and one bug found on the way that mattered more than the count.

### The 63 were not one problem. They are five, at very different risk

Classified by which applier each definition sits on
(`docs/evaluation-2026-09/evidence/applier-reachability.mjs`):

| Count | Class | Risk |
|---:|---|---|
| 23 | **SPLIT-APPLIER** — one creator on deploy-migrate, one on install-fresh | Two environments can hold different shapes |
| 18 | **NEITHER-APPLIER** — dead DDL | None at runtime; noise that hides the rest |
| 10 | ONE-LIVE-ONE-DEAD | A trap for readers, not for the database |
| 5 | BOTH-FRESH-ONLY | Fresh installs only |
| ~~3~~ 0 | ~~**BOTH-ON-DEPLOY-SET**~~ | **Resolved** — was the dangerous class |

Work the classes, not the alphabet. `BOTH-ON-DEPLOY-SET` was three entries and
the only class where set position silently decides a production schema.

### Done

1. **`stab_results`, `cmc_methods`, `stab_signoffs`** — all three
   BOTH-ON-DEPLOY-SET. `stab_results` was two entirely different tables under
   one name (`result_id` UUID + four FKs vs `id` SERIAL + VARCHARs); the
   runtime uses the first and got it only because entry 598 precedes entry 600.
2. **Two dead schema dumps archived** to `sql/_legacy/` —
   `cro_database_schema.sql` (490 lines) and `document_versions.sql`, both
   referenced by nothing since 2026-06-16. Removed four duplicates including
   `users`, `organizations` and `audit_logs`, which were never competing
   migrations at all.
3. **The `capa` bug** — see the WO-1 commit. Two fabricated CAPA records were
   being INSERTed on every deploy, unguarded, into a regulated table.

### The thing to understand before doing the remaining 56

**There are six paths that apply SQL in this repository, not one**, and they
cover different subsets:

| Applier | Covers | Files |
|---|---|---:|
| `deploy-migrate.mjs` | `C2C_MIGRATION_FILES` (production, incremental) | 261 |
| `install-fresh.mjs` | `migrations/*.sql` less six RLS files, + authoring subsystem, + named pre-overlay creators, + the whole `*_gcc_*` tree at step 6 | 288 |
| `db_migrate.sh` | `db/migrations/` 0XX, 1XX, date-prefixed (operator) | 304 |
| ci.yml psql loop | `db/migrations/*_gcc_*.sql` → **a CI test database** | 43 |
| drizzle `migrate()` | the journaled baseline | 1 |
| `preview_db_test` | only migrations a PR adds | — |

Only **7** non-archived `.sql` files are reached by no durable applier, and all
seven are accounted for: the six RLS migrations `install-fresh` excludes by name
and one `emergency_security_migration.sql`.

**So the problem is not that tables go uncreated. It is that answering "which
applier creates this table, in which shape" requires reading six code paths,
several of which are documented only in prose inside a 2,000-line module.** That
is the schema-authority problem stated precisely, and it is why the fix is one
manifest rather than 56 individual reconciliations.

### Two corrections recorded, because the method matters

An earlier revision of the reachability script modelled **two** appliers and
concluded that 69 tables were "referenced by server code and created by
nothing" — including `vault.documents`. That was wrong, twice over: it missed
`db_migrate.sh`, and then missed `install-fresh` step 6. Both were caught by
checking an implausible result against a known-good case rather than by
re-reading the code. A document vault that exists in no database is not a thing
that goes unnoticed, so the number had to be wrong before the cause was found.

The script now models all six paths and deliberately makes **no** claim about
which tables exist in a deployed database — that cannot be derived from the
repository, which is the whole point of `ci:tables-live-schema` and of WO-2.

### Next action, fully scoped: retire `migrations/0010_operating_system_foundation.sql`

This is the single highest-value remaining move — it resolves 5 duplicates,
closes one of the three surviving prefix collisions, and **fixes a live ADR
violation**. It is written up here rather than done because it needs one change
this session should not make unreviewed.

**The evidence that it is right:**

- **ADR-0007 decides it.** *"The deployed shape is canonical:
  `db/migrations/20260323_assumption_decision_contradiction.sql`. The raw-SQL
  services … were correct all along."* Its point 6 calls `migrations/0010`
  **dead** outright, and notes `contradiction_links` — written by
  `assumption-registry-service.ts:173,205` — "throws in production today"
  because its DDL lives only there.
- **The contract test is waiting for it.**
  `tests/schema-contract/operating-system-collision.contract.test.ts:192`: *"The
  order-independence acceptance … remains gated on ADR-0006 retiring the dead
  0010 files, and lives in the C-6 block above until then."*
- **Fresh installs currently violate the ADR.** install-fresh's overlay runs
  before deploy-migrate, so on a fresh install the dead file's 41-column
  `assumption_records` and 42-column `decision_records` win over the canonical
  25/26-column deployed shape. Same for `governance_boundary_rules`, where the
  divergence is worse than column names:

  | | canonical (`db/migrations`) | dead `0010` |
  |---|---|---|
  | `from_boundary` / `to_boundary` | `TEXT` + CHECK enum | native `governance_boundary` ENUM |
  | `domain_track` | `TEXT`, deliberately — the file cites ADR-0007 | native `domain_track` ENUM |
  | `created_at` / `updated_at` | `TIMESTAMPTZ` | **`TIMESTAMP`** — timezone-naive |

  Governance audit timestamps are timezone-aware or not depending on how the
  database was provisioned.
- **No dependency blocks it.** The twelve ENUM types it defines are used by no
  other SQL file (the live files' `domain_track` is a *column* of type `TEXT`,
  not a use of the type). `assumption_history` and `contradiction_links` have no
  other SQL creator, which is precisely ADR-0007 point 6's already-recorded
  defect.

**What blocks it, and it is a good block.** I archived the file, ran the
contract test, and **8 of 10 tests failed** with
`ENOENT: no such file or directory`. `tests/schema-contract/harness.ts:149` maps
`drizzleShaped: 'migrations/0010_operating_system_foundation.sql'` and applies
it to a live database to characterise the collision. So the test that gates the
retirement is itself pinned to the file being retired — by design, and it must
be rewritten in the same change:

1. Rewrite `harness.ts`'s `drizzleShaped` fixture to carry the Drizzle-shaped
   DDL **inline**, so the collision characterisation survives the file's removal.
2. Promote the C-6 order-independence assertions to the ADR-0007 acceptance
   block, per that block's own comment.
3. Archive `migrations/0010_operating_system_foundation.sql`.
4. Re-run the contract test, `ci:model-migration-agreement` (it fails on the
   archive alone — the Drizzle models diverge once the file stops creating
   those tables), and the seven migration gates.

I reverted rather than push through it: the change is right, the acceptance test
disagreeing is the system working, and rewriting a Part 11 schema-contract
harness belongs in a reviewed change of its own.

---

## PROGRESS — 2026-09-10, second pass: the 0010 retirement landed

**Duplicates 51 → 47. Prefix collision groups 4 → 3** (the `0010` group is gone
entirely). The blocked retirement described above is done, in the four steps it
needed.

### What made it possible

The blocker was that `tests/schema-contract/harness.ts:149` pinned
`drizzleShaped` to the file being retired and applied it to a live PGlite
instance. That is not incidental — the collision test exists to *demonstrate*
that the surviving schema depended on application order, so the losing shape has
to remain applicable. Deleting the file outright would have deleted the test's
ability to show the defect it guards.

So the DDL moved rather than died:
`tests/schema-contract/fixtures/drizzle-shaped-operating-system.sql`, verbatim,
with a header saying what it is and why it must never go back under a migration
tree. `check-duplicate-table-ddl.mjs` now excludes `tests/**/fixtures/` —
narrowly, so a migration that drifts into `tests/` is still caught.

### The orphaned Drizzle models are deleted

`shared/schema/operating-system.ts` carried a banner saying `assumptionRecords`,
`assumptionHistory`, `decisionRecords` and `contradictionLinks` were "retained
solely so their removal is its own reviewed change under the ADR-0006 legacy
retirement". This is that retirement — and it had to be the same change, because
removing the file alone left those models declaring **28 and 27 columns no
migration creates**, which is exactly what `ci:model-migration-agreement`
reported when the archive was attempted on its own.

Four tables, ten enums and eight type/schema exports removed; the file went
594 → 215 lines. Two enums survived — `governanceBoundaryEnum` and
`domainTrackEnum` — because the **canonical** governance tables below them use
those. Worth noting for ADR-0007 point 5: the deployed DDL stores those columns
as `TEXT` with `CHECK`, not as Postgres ENUM types, and this module is not in the
drizzle-kit push surface, so the `pgEnum` declarations are typed access that
creates nothing.

**Zero importers re-verified at deletion.** A bare-word grep first suggested
three importers of `assumptionRecords`/`decisionRecords`, which would have
falsified ADR-0007's premise. All three were artefacts: one match inside a
comment describing what the service used to do, and two local variable names in
`governed-intelligence-inconsistency-routes.ts:230-232`. The only real import
from this module is `governance-boundary-service.ts:21`, and it takes
`governanceBoundaryRules` / `governanceBoundaryTransitions` only. ADR-0007 stands
exactly as written.

### Verification

| Check | Result |
|---|---|
| `operating-system-collision.contract.test.ts` | **10/10** — the gating test |
| `governance-boundary-failopen.contract.test.ts` | 4/4 — the harness's other consumer |
| `server/services/__tests__/operating-system.test.ts` | 33/33 (it uses the names as mock keys, not imports) |
| `ci:typecheck:no-regression` | 0 errors — catches any dangling import of a deleted symbol |
| 12 migration / schema gates | all PASS, including `ci:model-migration-agreement` |

`ci:duplicate-exported-types` still fails on `ReadinessCheck`, byte-identical to
what `evidence/01-gate-sweep.json` recorded at `d31a9db6`. Pre-existing, wired
into no pipeline, unrelated.

### What ADR-0007 point 6 still leaves open

`contradiction_links` — written by `assumption-registry-service.ts:173,205` via
raw SQL — had DDL only in the retired file and throws in production today.
Deleting the Drizzle model does not change that; porting the table or retiring
the sub-feature remains the scoped follow-up the ADR records.

### Operator follow-up for the fabricated CAPA rows

`scripts/ops/audit-fabricated-capa-rows.mjs` (`npm run ops:audit-fabricated-capa`).

Removing the INSERT stopped the bleeding; it did not remove the ~2N rows already
written to every environment. This script closes that out, and is deliberately
not a migration: a DELETE in a replayed migration would run against a regulated
table on every deploy, forever, with nobody reading the result.

- **Reports by default**, deletes only on `--delete`, `--json` for an evidence pack.
- Deletes only rows still matching the seed **exactly** on `study_id`, `title`,
  `why`, `owner` and `status`. `due_date` is excluded from the match on purpose —
  the migration computed it as `CURRENT_DATE + INTERVAL`, so no two copies agree
  on it and matching on it would find nothing.
- A row that has been **edited since seeding is never deleted**. It is reported
  separately for a human, because an edited CAPA may now carry real
  investigation content.
- Exits 1 when fabricated rows are present and nothing was deleted, so a runbook
  step or release gate can treat "fabricated records still in the database" as a
  failure rather than a note.

Run the report against every environment before running `--delete` against any.

---

## PROGRESS — 2026-09-10, third pass: the remaining 47, put through adversarial review

**Outcome: none of it was applied, and that is the result.** Five specialist
analysts took the 47 remaining collisions in five groups; two independent
adversarial verifiers then attacked each group's proposals under two lenses —
applier-order and blast-radius. Fifteen agents, ~2.0M tokens, 607 tool calls,
about an hour.

**Nine of the ten verifications came back refuted. Every group's remediation
contained at least one defect that would have made the repository or a customer
database worse.** The tenth — the applier-order lens on the fifth group — came
back clean.

### The pattern in the results

**The diagnosis held everywhere; the prescription failed everywhere.** Every
verifier independently re-derived the applier globs from source rather than
trusting the evidence JSON, and every one confirmed the winner-per-applier map,
the column-set divergences and the runtime impacts. One re-derived
`C2C_MIGRATION_FILES` by importing the real array (261 entries) and testing all
fifteen named files; another noted the sweep is genuinely last via a `const` at
`migration-set.mjs:2040` that a naive regex parse misses.

So the 47 are now understood. What nobody had was a safe way to fix them.

### What the review stopped, specifically

| Group | The proposal | Why it was refused |
|---|---|---|
| cortex | Add `073` to install-fresh, amend `079` | `CREATE TABLE IF NOT EXISTS` never adds a column to an existing table, so it changes only databases provisioned afterwards — **a change filed to remove a two-shape divergence would have introduced a third, keyed on install date** |
| non-lineage | Run four migrations from the `db-verify` README under `ON_ERROR_STOP=1` | **Proven by execution** on PGlite: aborts at statement 11 on `relation "audit_events" does not exist`, so the three files queued behind it never run and `to_regclass('public.audit_logs')` ends `null`. Strictly worse than today |
| split-applier | Rename `notes` → `execution_notes` and append an `UPDATE` | On a fresh box the `CREATE TABLE` no longer has `notes`, so the appended `UPDATE` raises 42703 — and install-fresh's overlay wraps each file in its own transaction and **rolls the whole file back**, deleting all four contradiction tables from every fresh install |
| same-applier-root | Rename the `risk_items` pair | `migrations/20260609_design_risk.sql` is not in `C2C_MIGRATION_FILES`, and `deploy-migrate` is the only applier that touches a populated database — so the rename is a **no-op on every existing deployment** and `/api/design-risk` stays broken |
| concept2cure-core | Widen `044b`'s `core.programs`, delete the baseline entry | Widening leaves **both** `CREATE TABLE`s in place, so deleting the baseline entry unbaselines a still-live collision and `ci:duplicate-table-ddl` — a blocking step at `ci.yml:91` — exits 1. The verifier proved it by running the gate |

And one that is worth quoting, because it is the failure mode this work order's
own history warned about, repeated by an agent that had been told about it:

> *It states "NOTHING IN server/ QUERIES THIS TABLE", calls the grep
> "Exhaustive" … Running that identical grep returns five live query sites …
> This is the prior session's exact failure mode restated — the import line was
> read, the handler bodies were not.*

`concept2cure_review_comments` is written on every review-comment POST. The
proposal would have handed a future dead-table sweep a live table.

### What this changes

**Stop attacking the remaining 47 file by file.** The evidence says the
per-collision edit is not the unit of work:

1. **Convergence needs a migration, not an amendment** (exit criterion B above).
   Every safe fix for a *divergent* table is an `ALTER TABLE … ADD COLUMN IF NOT
   EXISTS` inside `C2C_MIGRATION_FILES`, because that is the only replaying
   path. Editing creators is for the repository half only.
2. **It cannot be verified from the repository.** Four of the five refutations
   turned on what a *populated* database already contains — which shape it was
   provisioned with, whether the table already exists, whether the column is
   there. `ci:duplicate-table-ddl:strict` reads files and cannot see any of it.
   **So WO-1's remaining scope is blocked on WO-2**, which stands up a database
   to measure against. Proceeding without one is how five plausible proposals
   became five defects.
3. **The gate that would catch a bad convergence does not exist.** Nothing
   checks that a table with two definitions has an `ADD COLUMN` step reaching
   every environment. Proposed for WO-5, alongside the skip-reason check WO-8
   surfaced.

### Recorded for whoever picks this up

Findings that survived every lens, and are safe to act on once WO-2 provides a
database:

- The seven `cortex.*` `079` stubs that lose to `074`/`077`/`078` on every
  applier are dead code, not divergence — only **five** cortex tables actually
  diverge (WO-14).
- `db/migrations/20260501_q_sub.sql` and `migrations/20260501_q_sub.sql` are
  **byte-identical** (md5 `ebad5201783623187705fae35c4f6bde`, empty diff). A
  duplicate with no divergence is the cheapest class in the set.
- `scripts/db-verify/00_bootstrap_base.sql` and the `sql/` files are on no
  applier; the collisions involving them are a categorisation question, not a
  schema one — but see the non-lineage row above before touching the README's
  apply set.
- `cortex.expertise_scores` has RLS enabled and no tenant column at all
  (`077:534` after a `-- NO org_id` comment), and `cortex.health_check()`
  returns `status: error` on every applier because it sizes two indexes no file
  creates.

**The most useful thing this pass produced is a negative result, and it cost
about an hour to get instead of a bad deploy to discover.**
