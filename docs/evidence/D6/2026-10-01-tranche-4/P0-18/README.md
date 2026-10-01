# P0-18 (DP-01 residual): the database refuses an unsigned effective or retired QMS document

Row D6. Security audit 2026-09-24, DP-01 residual. Date: 2026-10-01. HEAD when the work started: `0e58e794`.
PostgreSQL 16.13 (`c2c_testdb`, deploy-shaped). Runtime role `app_service` (NOSUPERUSER NOBYPASSRLS), `app.rls_enforce=on`.

## What was wrong

e1c224f6 closed the routes. A QMS controlled document reaches `effective` only through
`approveQmsDocumentSigned`, and reaches `retired` only through `retireQmsDocumentSigned`
(`server/services/qms/document-approval-signature.ts`). Each one writes a single `electronic_signatures` row
in the route's transaction. The database did not enforce any of this. As the runtime role, in its own tenant,
with RLS enforcing, each of the following committed with no signature row:

- `UPDATE qms_documents SET status = 'effective'`
- the same UPDATE to `'retired'`
- an INSERT of an `effective` row

A revised document returns to `draft`, and its earlier approval stays live because revising does not revoke it.
A bare UPDATE could then make that unsigned new version effective again
(`red/psql-runtime-role-bare-update.txt`, `red/dbtest-before-fix.txt`).

## What is true now

`migrations/20261001_qms_document_signature_required.sql` adds two constraint triggers, both
`DEFERRABLE INITIALLY DEFERRED`. One runs on INSERT and one on UPDATE, and both call
`public.qms_documents_signed_status_guard()`. A row change that moves `status` **into** `effective`
(or `retired`) commits only if the **same transaction** wrote an `electronic_signatures` row that matches all of these:

| column | required value |
|---|---|
| `organization_id` | the document's organization |
| `signed_target` | `'qms-document:' \|\| id` |
| `signature_type` | `qms-document-approval` (`qms-document-retirement` for `retired`) |
| withdrawn? | no: `superseded_by IS NULL`, `is_valid` not false, `verification_status` not `revoked` (the same three columns `isSignatureWithdrawn` reads) |
| written by this transaction | `created_at = LOCALTIMESTAMP` |

These are the values the two signed functions write.

**Why the check is deferred.** The governed path runs the status UPDATE first
(`applyApproval` / `applyRetirement`) and inserts the signature afterwards (`persistGovernedActionSignature`).
A check that ran after each statement would refuse every real approval. The dbtest shows this directly: the
same check switched to `SET CONSTRAINTS … IMMEDIATE` refuses `approveQmsDocumentSigned`, and the
`not-deferred` mutant makes the approve, retire and re-approve routes fail. If the deferred check refuses at
COMMIT, the COMMIT fails, the route's catch rolls back, and the route answers 500 through `serverError`,
with no error text in the body.

**Why "same transaction" and not just "a signature exists".** Requiring only that a signature exists would
let the old approval authorise an unsigned revised version. "Written by this transaction" relies on two facts:
`electronic_signatures.created_at` is `timestamp DEFAULT now()`, and no writer sets it. So a row this
transaction wrote carries this transaction's start time. Savepoints do not change it.

**Existing rows do not break a deploy.** A trigger does not validate rows that are already stored, and the
`WHEN` clauses fire only on a change *into* `effective`/`retired`. To check this, an unsigned effective row
was stored first. The file was then applied twice through `applyMigrationFiles` (the deploy's own applier).
The row is still effective, and an edit that leaves its status alone still commits as the runtime role
(`green/apply-twice-legacy-row.txt`).

The guard was not disabled for any fixture. The one fixture that set `effective` directly now gives the
document its signature in the same transaction.

## Red / green

| proof | red (before) | green (after) |
|---|---|---|
| psql as app_service: bare UPDATE → effective, → retired | both COMMIT, 0 signatures (`red/psql-runtime-role-bare-update.txt`) | both refused at COMMIT with `QMS_SIGNATURE_REQUIRED`; rows stay draft (`green/psql-runtime-role-bare-update.txt`) |
| `tests/db/qms-document-signature-required.dbtest.ts` (13 cases) | 7 failed / 6 passed: 6 refusal cases committed; the ordering case found no such constraint (`red/dbtest-before-fix.txt`) | 13/13 (`green/dbtest-after-fix.txt`) |
| governed approve / retire / re-approve routes (real auth, reverifySigner, runtime pool) | pass | pass; status row and signature row share one `xmin` |
| `tests/db/compliance-reports.dbtest.ts` | guard applied, fixture unchanged: refused at seed, 17 skipped (`red/compliance-reports-fixture-refused.txt`) | fixture signs on one transaction: 17/17 (`green/compliance-reports-fixture-signed.txt`, run together with the P0-18 file: 30/30) |
| migration applied twice via `applyMigrationFiles`, with an unsigned legacy effective row | — | both runs applied, legacy row untouched and editable (`green/apply-twice-legacy-row.txt`) |
| `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:column-reachability` | — | all OK (`green/gates.txt`) |
| neighbours: change-control pglite, three QMS route suites, `c2c-apply-path` and `tenant-isolation-sweep` (both replay the set on PGlite) | — | 6 files, 71/71 (`green/neighbour-suites.txt`) |
| ESLint on both test files | `max-params` warning on the first draft | clean (`green/eslint.txt`) |

### Each predicate is load-bearing (`green/mutants.txt`, `mutants.sh`)

Each mutant weakens one part of the guard on the local database. The dbtest then runs, and the original is
restored through the applier afterwards (verified: both triggers deferrable, function source restored).

| mutant | case that turns red |
|---|---|
| no organization filter | "…of another organisation…" (line 281) |
| no signature-type filter | "…of the wrong kind…" (line 274) |
| withdrawn signatures count | "…or already revoked…" (line 288) |
| any transaction's signature counts | "an approval written by an earlier transaction does not make a revised version effective" |
| `NOT DEFERRABLE` | approve, retire, re-approve routes; the ordering case; the fixture case (6 red) |

## Files

| file | change |
|---|---|
| `migrations/20261001_qms_document_signature_required.sql` | new: function + two constraint triggers; `to_regclass` guard; raises if `electronic_signatures` lacks a column the guard reads |
| `scripts/db/migration-set.mjs` | one line, after the P0-4b line, above the IND block and the final isolation steps |
| `tests/db/qms-document-signature-required.dbtest.ts` | new (lane `dbqsr`, orgs 93180/93181; removes its own rows) |
| `tests/db/compliance-reports.dbtest.ts` | fixture: `effectiveQmsDocument` makes A's and B's documents effective with an approval signature on one transaction; `approvalSignature` takes a side and a client |

`scripts/db/migration-set.mjs` (last touched 10-01 03:24, session_01GCu8tcx7BxXG5B6SysALUV, D1) and
`tests/db/compliance-reports.dbtest.ts` (last touched 10-01 06:16, session_0194UQPxy9Er2ibRAjog8Ven, P1-41)
were edited by other lanes within the last 24 hours.

## Commands

```bash
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export APP_DATABASE_URL='postgresql://app_service:<local password>@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export RLS_ENFORCE=on
docs/evidence/D6/2026-10-01-tranche-4/P0-18/repro.sh              # psql as the runtime role
docs/evidence/D6/2026-10-01-tranche-4/P0-18/apply.sh              # on a database without the guard: legacy row, apply twice
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run --config vitest.db.config.ts \
  tests/db/qms-document-signature-required.dbtest.ts tests/db/compliance-reports.dbtest.ts
docs/evidence/D6/2026-10-01-tranche-4/P0-18/mutants.sh            # weakens the guard briefly, then restores it
node docs/evidence/D6/2026-10-01-tranche-4/P0-18/seed-probe.mjs   # demo seed, rolled back
npm run ci:migration-set-order && npm run ci:migration-drop-safety && npm run ci:column-reachability
```

## Residuals (outside this item's files)

1. **The GA demo seed is refused on a guarded database.** `scripts/seed/ga-demo.d/123-qms-quality.mjs`
   inserts seven documents as `effective` with no signature, so `npm run db:seed` fails at that step
   (`red/demo-seed-refused.txt`, run inside a transaction that is always rolled back). It is not in CI.
   Proposed fix: seed those documents as `in_review` so a demo user approves them through the signed route.
   Writing a signature row would fabricate a Part 11 record. The seed's own pglite test
   (`changeControl.pglite.integration.test.ts`, which asserts its counts) moves with it. That test's
   hand-written DDL does not carry this guard, which is why it stays green.
2. **The boot check does not cover this guard.** `server/services/audit/audit-immutability-triggers.ts` lists
   triggers that boot, `securityHealth` and the daily sweep require. An operator's `DISABLE TRIGGER` on
   `trg_qms_documents_signed_status_*` is re-armed by the next deploy but would not be reported before then.
   The guard could be added there, or to a sibling list of governance triggers.
3. `superseded` is not covered, because nothing in `server/` writes it.
4. The migration manifest was not regenerated, per instruction. `npm run db:sync-manifest:check` covers
   `db/migrations/` only and reports in sync.

## Resume note

The interrupted earlier attempt left nothing for P0-18 in the tree: no migration, no test, no set entry and
no evidence folder. Everything here is from this attempt.
