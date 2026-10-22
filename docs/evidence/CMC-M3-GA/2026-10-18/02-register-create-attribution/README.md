# Who recorded this? Every CMC register create now names its operator

Row **D2**. GA plan item 2 (decision 2026-10-05, P-28).

## The defect

A CMC register row recorded **when** it was written and never **who** wrote it.

Not "the writer was not audited" — the writer was not recorded anywhere:

- On the provisioned database **none of the register tables carries an
  attribution column.** A `pg_class` / `information_schema` join over
  `drug_substances`, `drug_products`, `cmc_material_specs`,
  `cmc_formulation_records`, `cmc_container_closures`,
  `cmc_characterization_studies`, `manufacturing_processes`,
  `quality_specifications` and `cmc_batch_records` returned **0** columns named
  `created_by`, `updated_by`, `created_by_id` or `recorded_by`.
- The **audit chain held no row for a register create** either. Every CMC
  action on record was a *governed act* — `CMC_CHANGE_PROPOSED`,
  `cmc.source_evidence.link` / `unlink`, `cmc.contradiction.resolve`,
  `cmc.specification.approval_withdrawn`, `cmc.register.retire_signed`. The
  data entry those signatures are **about** was anonymous. On this machine's
  database, before the change: `SELECT count(*) FROM audit_logs WHERE
  action='cmc.register.create'` → **0**.
- `server/services/cmc/register-writes.ts` contained no audit call at all, and
  1 of 61 routes in `server/api/cmc/routes.ts` called `recordGovernedAction`.

21 CFR Part 11 §11.10(e) asks for audit trails that "independently record the
date and time of **operator entries** and actions that create, modify, or
delete electronic records". The time was there; the operator was not.

Two consequences, both named in earlier evidence as owed:

1. An inspector asking *who recorded this specification limit?* had no answer.
2. The separation-of-duties question a section approval needs to ask — **is
   this approver the last writer of the records the section cites?** — could
   not be asked at all, because the writer was not inferable from anything.

## The fix

**`server/services/cmc/register-audit.ts`** is the one module that inserts a
register row, and the one that records who recorded it.

**Why the chain and not a `created_by` column.** Nine `created_by` columns
would be a second place for one fact, and a column is not tamper-evident: a
row's own attribution can be updated by whoever can update the row. The audit
chain is per tenant, hash-chained and sealed (`services/audit/chain.ts`), the
runtime role holds no UPDATE or DELETE on it, and it already carries every
governed CMC act — so the register write belongs beside them, in the stream an
inspector already reads.

**Why it commits with the row.** Two reasons, and they are the same reason.
`services/audit/chain.ts` states in its own header that the caller MUST run
`computeAuditChain*` and its INSERT in one transaction: the chain position is
taken under `pg_advisory_xact_lock` and announced in a transaction-local GUC
that the `audit_logs` BEFORE INSERT trigger reads, and outside a transaction
both end with the statement that made them. And a create that wrote the row and
*then* its audit row would, on any audit failure, leave behind exactly the
unattributable regulated record this module exists to prevent.

So there are two doors and no third:

| Door | For | What it does |
|---|---|---|
| `insertRegisterRow(orgId, actor, register, table, values)` | the 15 registers written through Drizzle | `db.transaction`: the insert and the chained row, or neither |
| `createOnConnection(pool, {…}, insert)` | the 3 registers written as raw `INSERT … RETURNING` | one pinned connection, `BEGIN` … `COMMIT`, released in `finally` |

`pool.query` takes whichever idle connection the pool hands back, which is why
the raw-SQL registers needed the second door rather than the first.

**Why an absent actor refuses.** `resolveRegisterActor` is called **before** the
transaction opens, so a create with nobody to name writes nothing at all rather
than opening one and rolling it back. Both doors have an operator — the route
from the session (`resolveActorUserId`), the guided interview's projector from
the commit scope it runs for — so an absent actor is a programming error, and it
fails loudly (`REGISTER_ACTOR_MISSING`) instead of writing an unattributable
regulated record. `RegisterActor.userId` is **required and nullable** rather
than optional, which is what makes a swapped argument a compile error:
`express.Request` declares `userId?: number` and the Module 3 `ProjectSource`
declares none, so neither can stand in for an actor. TypeScript reported exactly
that while this change was being made
(`'projectId' does not exist in type 'RegisterActor'`).

**The eighteen registers are one list** (`CmcRegister`), because "who recorded
this?" must have the same answer whichever register is asked about. A register
missing from that list is a register an inspector cannot attribute.

**The Module 3 write-through stays outside the transaction**, where it already
was: a propagation failure never rolls the register row back
(`link-to-module3.ts`), and the link is not part of the entry the operator made.
A test asserts that still holds.

**The specification route keeps `specification_audit_log`** and now writes it on
the same transaction as the row and the chained record. It is this register's own
version history, which the specification screen reads; it answers *what changed*,
where the chain answers *who entered what*, tamper-evidently. Before this change
the two writes were separate `pool.query` calls, so a failure between them left a
specification with no history row.

## Red, then green

**Against a real Postgres, through the real chained writer**
(`register-create-attribution.pglite.integration.test.ts`, 28 tests; tables built
from the Drizzle definitions so each row has every column the service writes, and
`migrations/20260921_audit_logs_chain_seq.sql` applied from disk so the rows are
written in the shape the deployed chain has).

With the attribution module present but not wired into the one write path
(`red-before.txt`), **all 14 cases of the first revision failed**, and the first
seven print the defect itself:

```
drug_substance wrote no audit row: expected [] to have a length of 1 but got +0
drug_product wrote no audit row: …
container_closure wrote no audit row: …
material_spec wrote no audit row: …
formulation_record wrote no audit row: …
characterization_study wrote no audit row: …
manufacturing_process wrote no audit row: …
```

…and the no-actor cases printed a regulated record written for nobody:

```
promise resolved "{ row: { id: 2, …(23) }, …(1) }" instead of rejecting
```

After: **28 pass** (`green-after.txt` covers 75 across the four suites of the
first revision). What they hold:

- each of the seven service creates writes one `cmc.register.create` row naming
  the operator (`actor_id` **and** `user_id`), the tenant, the table, the record
  id, the target, the register and the row as written, with a `sha256_chain`;
- the eight registers created in their own route go through the **same** insert
  and are recorded the same way;
- the three raw-SQL registers are recorded on one pinned connection, the
  specification with its own history row on that same transaction;
- a create with **no actor**, `userId: 0` or `userId: null` writes neither a
  register row nor an audit row, and says what is required and that nothing was
  written;
- with `audit_logs` renamed away, **no register row is left behind** — on both
  doors;
- a Module 3 link failure still does **not** roll the attributed row back;
- three creates by two people **walk as one tenant chain** under the real
  verifier (`verifyAuditChain` → `ok`, 3 rows checked).

**Through the real server** (`npm`-less: `bash scripts/dev/cmc-staff-simulation.sh`
against `tsx server/index.ts` on PostgreSQL 16): **158 passed, 0 failed**, and
the chain afterwards carries a create row for **16 of the 18 registers** — every
one the simulation exercises — each naming the signed-in operator:

```
 register               | table_name                    | rows | actors
------------------------+-------------------------------+------+-------
 analytical_method      | analytical_methods            |    1 |      1
 batch_record           | cmc_batch_records             |    1 |      1
 characterization_study | cmc_characterization_studies  |    3 |      1
 comparability_study    | cmc_comparability_assessments |    1 |      1
 container_closure      | cmc_container_closures        |    2 |      1
 dissolution_profile    | cmc_dissolution_profiles      |    2 |      1
 drug_product           | drug_products                 |    1 |      1
 drug_substance         | drug_substances               |    2 |      1
 formulation_record     | cmc_formulation_records       |    1 |      1
 impurity_profile       | cmc_impurity_profiles         |    4 |      1
 manufacturing_process  | manufacturing_processes       |    2 |      1
 material_spec          | cmc_material_specs            |    3 |      1
 qc_test                | qc_testing                    |    8 |      1
 reference_standard     | cmc_reference_standards       |    2 |      1
 specification          | quality_specifications        |    2 |      1
 stability_study        | stability_studies             |    2 |      1
```

`process_validation` and `change_control` are **not** in that list because the
simulation does not create them; they are covered by the integration suite
above. Said plainly rather than rounded up to eighteen.

## The guard that keeps it true

The behaviour above cannot prove the **absence of a new write path**: a route
added next month with its own `db.insert(stabilityStudies)` would write a
perfectly valid register row that no audit row names, and nothing would fail —
recording would appear to work. That is exactly how the registers came to have
no operator in the first place: sixteen creates, written one at a time, each
reasonable.

`register-create-recorded.test.ts` (24 tests) holds the line at the source
level, with comments stripped first so a guard cannot be satisfied by deleting
an explanation:

- each of the 15 Drizzle registers has **no insert of its own** anywhere under
  `server/`;
- each of the 3 raw-SQL registers is inserted by **exactly one** file, and that
  file imports `createOnConnection`;
- `cmc.register.create` has **one writer**;
- the actor is resolved **before** the transaction opens;
- the catalogue names all eighteen registers, with no duplicates.

**Shown failing on the case it exists to catch** before being reported as
working (`red-gate-unrecorded-insert.txt`): the recorded insert in the
stability-study route was replaced with the direct `db.insert(stabilityStudies)`
it used to be, and the gate said

```
stabilityStudies is inserted directly in server/api/cmc/routes.ts. A register
create goes through insertRegisterRow (server/services/cmc/register-audit.ts),
which writes the row and the §11.10(e) record of who recorded it on one
transaction.: expected [ 'server/api/cmc/routes.ts' ] to deeply equal []
```

## Also green

- `server/api/cmc` + `server/services/cmc` + the AnA flow-session suite:
  **1345 tests, 65 files, 0 failures.**
- `tsc --noEmit` clean; the ESLint warning profile of every touched file is
  unchanged (`register-writes.ts` 3, `routes.ts` 17, `specificationRoutes.ts` 2,
  `batchRecordRoutes.ts` 0).

## What this unlocks, and what is still owed

The separation-of-duties question is now **askable**: `cmc.register.create` names
the operator of every record a Module 3 section is composed from, so a section
approval can be checked against the people who wrote the records it cites. That
control is the next increment and is not claimed here.

**Still owed, unchanged by this:** OQ-008 and its runner (P-28), and OQ-007 for
Reporting & analytics. `audit_logs.old_values` is hard-coded NULL for every
caller of `writeChainedAuditRow` — the open DP-13 — which costs nothing for a
create (there is no prior state) and is not this change's to fix.
