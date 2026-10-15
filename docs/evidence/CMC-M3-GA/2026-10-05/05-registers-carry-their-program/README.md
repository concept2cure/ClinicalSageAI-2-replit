# The six core CMC registers carry their program, and an edit never moves a record into another

Row **D2** (launch catalog data integrity), with **D3** (a create must name a
program the tenant holds). From the discovery map's client and server mappers:
`cmc-cross-program-write-through` (P0), `core-registers-not-project-scoped` and
`create-paths-skip-project-membership`. Each was re-read in the code before
fixing. This completes the per-record-type register scope the product owner
chose on 2026-09-28.

## The defect

Six tables recorded no program: `drug_substances`, `drug_products`,
`stability_studies`, `analytical_methods`, `process_validation` and
`cmc_change_control`. As a result:

- **Lists were organisation-wide.** The register cards admitted it
  ("all programs — this register cannot be narrowed").
- **A save took its program from the request body.** Editing program A's
  substance while program B was open upserted `cmc_source_objects (B,
  drug_substance, 'drug_substance:12')`. B's §3.2.S then composed from A's
  material, and A kept a stale copy.
- **The contradiction sweep read every program.** A's sweep raised B's
  unvalidated method and failed study as A's findings.
- **A create forwarded a body program unchecked.**
- **Recorded stability results never reached Module 3.** Found while proving
  this fix. The pull-point PUT names no program, so with no program on the
  study the write-through never ran: the results never reached Module 3,
  nothing went stale, and §3.2.S.7 / §3.2.P.8 were approved without them.

## The fix

- **`migrations/20261005_cmc_core_registers_project.sql`**, on the durable
  applier before the final pair:
  - a nullable `project_id text` and an `(organization_id, project_id)` index on
    each of the six tables;
  - a backfill that fills NULLs only where `cmc_source_objects` names exactly
    one program for the row. A forked row stays unfiled rather than being
    guessed. Integer keys only.
  - Additive, no DROP, replay-safe (applied twice locally). `shared/schema.ts`
    carries the column.
- **`register-writes.ts`** gains `filedProjectOnCreate`, `projectOnEdit`,
  `withoutProject` and `PROGRAM_FILED_REGISTERS`.
  - A create files under the body's program only once `projectBelongsToTenant`
    says it is the tenant's. Otherwise it returns 409 and nothing is written.
  - An edit never moves a filed record, whatever the body says.
  - A legacy unfiled record is filed under the open program on its first edit,
    and refused if another program already holds its canonical source.
- **`routes.ts`**: all six POSTs and PUTs use the helpers. The GETs read
  `?projectId=` through the existing `projectFilter`, which keeps unfiled rows
  visible, and their projections carry `projectId`.
- **`contradiction-registers.ts`** reads methods and stability for the program,
  plus the unfiled ones.
- **Client `cmcRegisters.tsx`**: drug substances, drug products, stability
  studies and analytical methods are `'program'` registers. A method is
  validated for a product's matrix and cited in that dossier's §3.2.S.4.2 /
  §3.2.P.5.2. The `'program-unscoped-store'` state and its note are deleted:
  nothing can be in that state any more.
- **The staff simulation's new step 11c-file** asserts that the recorded pull
  points are linked, recompiles, and checks that §3.2.S.7 tabulates all six.

## Red, then green

`register-program-filing.pglite.test.ts` has 8 tests on PGlite. With three
mutants planted (no tenant check at create, a filed record moved by the body,
the fork check skipped), these three fail:

```
× refuses a program that is not this organisation’s, and files nothing
× keeps program A’s substance in A when it is edited with program B open
× refuses when another program already holds its canonical source, and changes nothing
Tests  3 failed | 5 passed (8)
```

Restored: 8/8. `contradiction-registers.pglite.test.ts` now carries the column
and a case for one program's method and failed study in another program's sweep
(7/7). `cmcRegisterScope.test.ts` and `cmcSuiteWrites.test.tsx` read the
narrowed paths.

Other checks:

- `server/api/cmc`, `server/services/cmc` and the v2 client suites: green.
- Gates: `ci:migration-set-order`, `ci:migration-drop-safety`,
  `ci:column-reachability`, `ci:drizzle-tenant-scope` and `ci:runtime-ddl` all
  pass.
- tsc clean; the ESLint ratchet shows no file changed its count.

## Live (`live-probe.txt`)

- Program A's substance was edited with program B named in the body. Its program
  and its single source object stayed A's, and B's list does not show it.
- A create naming a program outside the organisation returned 409 with the
  refusal.
- Staff simulation: **121 passed, 0 failed**, including the new linked-results
  checks.
