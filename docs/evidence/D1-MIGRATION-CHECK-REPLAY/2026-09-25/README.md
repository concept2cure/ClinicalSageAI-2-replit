# D1: three CHECK constraints broke the deploy that replays them (NARROWED)

**Row:** D1 (hosted production). `deploy-migrate` replays every `C2C_MIGRATION_FILES`
entry on every deploy (CLAUDE.md RULE 1), so a file that fails on replay stops every
deploy after it.
**Found by:** the lineage trace (data room → AnA → canvas → editor → vault → submission).
It flagged `20260907`; a sweep of the set for the same shape found two more.
**Status:** fixed, reproduced red → green, and gated.

## The defect

Three constraints are widened by one file and widened again by a later one. Each
widening used the same idiom, run unconditionally:

```sql
ALTER TABLE t DROP CONSTRAINT IF EXISTS x;
ALTER TABLE t ADD CONSTRAINT x CHECK (col IN (<this file's list>));
```

`ADD CONSTRAINT` validates every existing row. On a provisioned database, the replay
of the earlier file re-imposes its narrower list over rows the later file admitted.
The ADD fails, and the deploy stops at that file. This happens on every deploy from
the first such row on. A fresh database never shows it, so no test that starts empty
ever saw it.

| Constraint | Earlier file (replayed, narrower) | Later file (wider) | The row that breaks the deploy |
|---|---|---|---|
| `document_span_lineage_kind_valid`, `_kind_shape` | `migrations/20260907_span_lineage_accepted_machine_draft.sql` (3 kinds) | `migrations/20260908_span_lineage_machine_draft.sql` (4) | a `machine_draft` span: any AnA draft nobody has accepted yet |
| `c2c_documents_doc_type_check` | `migrations/20260806b_anda_ide_filing_types.sql` | `migrations/20260810b_eu_mdr_ivdr_outlines.sql` (adds `mdr`, `ivdr`) | any EU MDR or IVDR technical-documentation document |
| `submission_orchestrator_runs_status_check` | `db/migrations/20260725_submission_orchestrator_store_port.sql` | `db/migrations/20260725_esig_gate_columns_port.sql` (adds `awaiting-signature`) | a submission held at the e-signature gate across a deploy (`submission-package-orchestrator.ts:2227` stores the status on the row) |

The drop-safety gate exempted the idiom on purpose. Its comment read: *"whichever
such file runs last simply defines the object"*. That is true of the end state and
false of the step before it.

## The fix (RULE 1: amended in place, each with a dated header note)

In each earlier file, the replacement now runs only while the constraint's current
definition does not yet admit what that file adds:

```sql
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conrelid = '<table>'::regclass AND conname = '<name>'
                  AND pg_get_constraintdef(oid) LIKE '%''<value it adds>''%') THEN
  ALTER TABLE … DROP CONSTRAINT IF EXISTS …;  ALTER TABLE … ADD CONSTRAINT …;
END IF;
```

- A fresh database still runs creator → earlier → later.
- A provisioned database keeps the wider definition.
- A drizzle-push database, which has the table but no named constraint, still gets one.
- The later files are unchanged. They are the last definers, so replaying them only
  re-validates rows against the widest list.

## Evidence

| File | What it shows |
|---|---|
| `01-red-before-fix.txt` | `tests/schema-contract/check-constraint-replay.pglite.test.ts` against the unfixed files. The fresh-database case passes 3/3, which proves the harness. The replay fails 3/3 with Postgres's own `check constraint "…" of relation "…" is violated by some row` (SQLSTATE 23514). |
| `02-green-after-fix.txt` | The same test after the amendment, 6/6: the replay succeeds, the row survives, the definitions are unchanged, and a bogus value is still refused. |
| `03-gate-red-on-unfixed-set.txt` | `ci:migration-drop-safety` against the real set with the three files restored to HEAD. It exits 1 and names exactly the four replacements (`20260907` ×2, `20260806b`, the store port) as **NARROWED**. |
| `04-selftest-against-old-gate.txt` | The new selftest against the old gate: 4/12 wrong. The old gate called all three NARROWED fixtures OK. |
| `05-selftest-new-gate.txt` | The new gate: selftest 12/12, and the real set OK with 4 conditional replacements checked. |

The test reads its file order from `C2C_MIGRATION_FILES`, not from a hand-kept list.
The doc-type fixture takes the creator's constraint clause from
`20260528_phase9_document_schema.sql` itself.

Also run green:

- the 50 test files, 420 tests, that read these migrations, including every PGlite
  span-lineage suite and the e-sig and orchestrator contracts;
- `ci:migration-set-order`, `ci:migration-reachability` and `ci:migration-prefix-collisions`.

## The gate

`scripts/ci/check-migration-drop-safety.mjs` gains a third mode, NARROWED. A
same-file replacement of a constraint that a later file in the set also defines must
be conditional: a `pg_constraint` lookup by that name that reads
`pg_get_constraintdef`, in code, not in a comment. The selftest pins four cases:

- an unguarded earlier file fails;
- a guarded one passes;
- a guard naming a different constraint fails;
- a guard written only in a comment fails.

## Not done here

- Each deploy still replays the later files' `DROP`/`ADD`. That takes an ACCESS
  EXCLUSIVE lock and a full validation scan of `document_span_lineage`, which grows
  per span. Nothing about that is incorrect, but it is deploy latency on a hot write
  path. The same guard on `20260908` would remove it. That is left for whoever next
  touches it, rather than amending a file nothing requires amending today.
- `c2c_documents` on a drizzle-push database: `shared/schema.ts` declares `doc_type`
  without the CHECK (the file's own note). Unchanged.
