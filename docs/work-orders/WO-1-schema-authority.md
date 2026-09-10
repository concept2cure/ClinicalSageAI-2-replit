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
