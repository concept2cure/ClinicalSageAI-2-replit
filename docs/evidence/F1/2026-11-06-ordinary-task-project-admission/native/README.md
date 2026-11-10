# Native ordinary-task admission proof

The real existing ordinary HTTP writer was exercised before production edits,
then after the repair, using PostgreSQL 16 at the local disposable test database.
`workflow-project-admission.dbtest.ts` extends the preceding workflow fixture;
its previous 57 workflow cases remain in the final run.

## Before repair: three genuine counterexamples

`red-before.txt.gz` records **3 failed, 57 skipped**, with exit 1. The selected
tests ran before the ordinary writer or shared admission helper was changed:

1. Actual active organization member 7 named private project 12, owned by 9,
   with matching workspace 72 and self-assignment. Expected 403 and no writes;
   actual response was 200 with one task, one action and one audit row.
2. Owner 7 named project 11, actually in workspace 71. The saved task's workspace
   was null instead of 71.
3. Actual organization viewer 12 carried a synthetic claimed administrator
   role and requested an unfiled self-assigned task. Expected 403 and no writes;
   actual response was 200 with one task, one action and one audit row.

`red-source-hashes.json` records the command and equal before/after hashes for
the route, project helper, shared task writer and RED test. The four matching
`.red.gz` snapshots preserve those bytes. The backend owner was given permission
to change production behavior only after this RED capture was reported.

## After repair: frozen full matrix

`green-after.txt.gz` records **100 passed, zero failed**, exit 0, with Vitest
duration 8.22 seconds. `green-source-hashes.json` records unchanged source hashes
through this run. The shared `create-task.ts` hash is identical to RED.

The 43 ordinary cases comprise:

- Three original counterexamples.
- Twenty-one current-actor/project cases: ten invalid explicit IDs, foreign and
  missing parents, archived/deleted parents, use-only and inactive edit shares,
  mismatched/null-parent workspace claims, and revoked membership, inactive
  user and inactive organization on unfiled work. Revoked-actor cases name
  another still-current member, so assignee lookup cannot mask actor admission.
- Eight source/compatibility cases: admitted and forbidden projects resolved
  from each existing authoring/canonical source kind, ordinary unfiled intake,
  unknown source kind, source without an anchor, and explicit-project precedence
  over source metadata. Unfiled tasks persist both scope fields as null.
- Eleven canonical-write cases: six RR1 protected input columns, actual audit
  insertion failure with total task/action/audit rollback, confirmed and lost
  COMMIT notification behavior, and both existing route aliases preserving
  metadata, status, dates, named assignment provenance, reason and atomic lineage.

The two alias cases join actual task/action/audit rows and compare PostgreSQL
`xmin` values. The rollback case injects a real temporary PostgreSQL CHECK
constraint into `audit_logs`; all counters remain unchanged. The lost-COMMIT
case commits on PostgreSQL first, then loses only the acknowledgement. The
response is `OUTCOME_UNKNOWN`; the request connection is discarded once, the
one task/action/audit remains visible to the owner, and no success notice is
sent. A separate positive case names another assignee and observes the notice
after confirmed COMMIT, so the no-notice case is not satisfied by self-assignment.

All existing workflow cases, including both actual PostgreSQL lock-wait and
permission-retention cases, pass alongside the ordinary cases. Both runtime and
fixture-owner pool closure assertions pass. The database was released to the
root for its independent aggregate qualification after this run.

The initial expanded run passed 98/100; its two failures were a test-only
lineage JOIN omitting the existing `task:` target prefix. That query was fixed
before the final frozen run. This was not a production failure.

## Reproduction and limits

Run from the repository root with Node 22, `DATABASE_URL` and
`TEST_DATABASE_URL` pointing to an owner-capable **disposable** PostgreSQL 16
database, and `RLS_ENFORCE=on`, `NODE_ENV=test`, `CI=true`:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.db.config.ts tests/db/workflow-project-admission.dbtest.ts --reporter=verbose
```

Add `--testNamePattern 'ordinary task project admission counterexamples'` to
reproduce the selected RED cases against their saved source snapshot. Scoped
ESLint of the final test is clean (`lint.txt.gz`).

Authentication and tenant middleware install an explicit synthetic test identity.
The real request-bound Drizzle/SQL connection uses a disposable restricted
`NOSUPERUSER NOBYPASSRLS` runtime role with forced tenant RLS; the role assertion
is executed. Actual actor/project/workspace/share admission and task/action/audit
SQL run on PostgreSQL. Only `notifyTaskEvent` is replaced by a spy from a partial
side-effects mock; cascade and dependency-cycle functions retain their actual
implementations. The fixture uses canonical ORM task columns and existing audit
DDL/migration, with narrow test-only document/program anchors. It does not run a
complete production migration set, deployed login/JWT flow or notification
delivery transport, and makes no claim about other task writers.

`SHA256SUMS` covers the raw compressed evidence, hash records and saved sources.
No full production database, real credential or deployment artifact is included.
