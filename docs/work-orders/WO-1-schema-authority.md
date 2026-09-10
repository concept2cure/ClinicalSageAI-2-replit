# WO-1 — Establish schema authority

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** external pilot on real customer data
**Prerequisite for:** WO-2, WO-3

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
