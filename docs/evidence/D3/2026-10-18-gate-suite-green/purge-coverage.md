# D3: `ci:purge-coverage` — the finding was stale schema, and the gate's advice would have codified it

**Row:** D3 — Tenant isolation proven. Same lane and day as `README.md` in this
directory. **Base:** `f50a4b40e`.

`ci:purge-coverage` was the one tenant gate `README.md` left red, because this
container had no `DATABASE_URL` and the gate fails closed rather than passing on
nothing. A local PostgreSQL turned out to be reachable, so it was run properly.

## What it reported

```
❌ purge-coverage: NEW org-keyed table(s) a tenant purge cannot reach:
  - relation_extraction_log
```

`relation_extraction_log` is org-keyed (`organization_id INTEGER NOT NULL
REFERENCES organizations(id)`), holds per-document extraction telemetry — entity,
relationship, triplet and cross-document-link counts plus a processing time — and
has no FK to any document, so no cascade path. On the face of it: tenant data a
purge cannot erase, which is exactly what this gate exists to catch.

## Why that reading was wrong

The table is already in a DROP list. `db/migrations/20260901_drop_dead_audit_tables.sql:110`
names it among the dead audit tables, and the apply order is right: its only
creator, `migrations/0006_regulatory_atoms.sql`, sits at allowlist line 531 and
the drop at 2150, so an ordered replay drops it after creating it (CLAUDE.md
Rule 1 — the set re-runs unconditionally, so order is the whole question).

Two facts settled it:

1. **Five of the seven other tables in the same drop list were already absent**
   from this database (`assumption_history`, `auth_password_history`,
   `doc_activity_log`, `ind_protocol_history`, `qc_compliance_history`,
   `strategy_audit`). So the migration had run here. Only
   `relation_extraction_log` and `program_activity_log` survived.
2. **Re-running the migration dropped both, with no skips:**
   `[dead-audit-drop] dropped 2, kept 0 (rows / dependencies / wrong relkind), 17
   already absent.` The migration's guards — rows present, inbound foreign keys,
   `DROP … RESTRICT` refused — all passed; nothing was overridden.

So the two tables existed because this local database had not replayed that
migration since they were re-created, not because of any defect. Local schema
drift. `ci:purge-coverage` then passes (`green/D-purge-coverage-current-schema.txt`).

**No change was made to `PURGE_CHILD_TABLES`.** Adding `relation_extraction_log`
would have been the wrong fix: a correctly-migrated database does not have the
table, so the entry would be a phantom.

## The actual defect: the gate's failure guidance

The message read:

> Either add it to PURGE_CHILD_TABLES (FK-safe order) or give it an ON DELETE
> CASCADE path from a table already there.

Two dispositions, both of which assume the table is real. Followed literally —
and it is written as an instruction, not a prompt to investigate — it produces a
purge list naming a table that does not exist on a deployed schema. That makes
the purge *look* more complete than it is, which inverts the gate's purpose. This
session came close to doing it.

The message now puts the schema question first:

```
First: confirm the table still exists on a CURRENT schema. This gate reads the
live database, and a table some migration drops can linger on a local one
that has not replayed it — in which case the fix is to migrate, not to list
a table that a correctly-migrated database does not have. Listing a phantom
here makes the purge look more complete than it is, which is the opposite of
what this gate is for.

If it is real: add it to PURGE_CHILD_TABLES (FK-safe order) or give it an ON
DELETE CASCADE path from a table already there. A tenant that asks to be
erased must not keep rows in a table nobody remembered to list.
```

Guidance only. The detection logic, the baseline and the exit code are untouched.

## Proof

| Stage | Result | File |
|---|---|---|
| Gate against the drifted local schema | FAIL — `relation_extraction_log` | quoted above; reproduced by the run that opened this lane |
| Migration re-run | `dropped 2, kept 0, 17 already absent` | quoted above |
| Gate against a current schema | OK, exit 0 | `green/D-purge-coverage-current-schema.txt` |
| M2: a genuinely new org-keyed table | FAIL, exit 1, and the corrected guidance prints | `red/M2-purge-forced-new-table.txt` |
| Gate selftest | 30 passed — "the gate fails on what it exists to catch" | `green/E-purge-selftest.txt` |

M2 is the control: a real `zz_purge_gate_probe` table carrying
`organization_id NOT NULL REFERENCES organizations(id)` was created, the gate
detected it and exited 1 with the new text, and the probe was dropped again. So
the rewording did not blunt the detection it advises on.

`scripts/` is eslint-ignored, so this file contributes no lint warning; the
warning eslint prints for it is "File ignored because of a matching ignore
pattern".

## Carried forward

- This database is a local development one and was drifted. Nothing here says
  anything about a deployed estate, and no deployed estate was queried. If
  `relation_extraction_log` or `program_activity_log` exist on one, that is a
  separate question about whether the 20260901 migration has reached it.
- `program_activity_log` was dropped here as part of the same re-run. It was not
  flagged by purge-coverage, presumably because it is already covered or not
  org-keyed; it was not investigated beyond observing that the migration removed
  it cleanly.
