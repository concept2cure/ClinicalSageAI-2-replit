# Native unified-task admission proof

The existing POST `/unified` route was exercised on actual PostgreSQL 16 before
production edits and again after the bounded repair. The native suite preserves
all 100 previously qualified workflow/ordinary cases and adds 69 unified cases.
Its existing fixture was extracted once into
`tests/db/workflow-project-native-fixture.ts`; no DDL or policy was duplicated.

## Genuine RED before production edits

`red-before.txt.gz` records **4 failed, 100 skipped**, exit 1, with Vitest
duration 4.28 seconds. The actual existing route produced these outcomes:

1. Active organization member 7 requested private project 12, owned by 9, with
   matching body/request workspace 72 and self-assignment. Expected 403 and no
   task/action/audit; actual response was 201 with one of each row.
2. Owner 7 requested project 11 without a body workspace. The actual project's
   workspace is 71, but the saved task's workspace was null.
3. Actual organization viewer 12 carried a synthetic claimed administrator
   role and requested unfiled work. Expected 403 and no writes; actual response
   was 201 with one task, one action and one audit row.
4. Active organization member 7 requested workspace-only unfiled work in
   foreign workspace 81, with no request workspace claim. Expected 403 and no
   writes; actual response was 201 with one task, one action and one audit row.

`red-source-hashes.json` contains the command and equal before/after hashes of
the unified route, its existing service, shared admission helper and RED test.
The `.red.gz` snapshots preserve those exact bytes. This run predates fixture
extraction. Production edits were authorized only after RED was captured and
reported; the raw RED evidence remains unchanged.

## Frozen GREEN matrix

`green-after.txt.gz` records **169 passed, zero failed**, exit 0, with Vitest
duration 11.81 seconds. It passed on the first expanded run. The seven recorded
production/test files stayed unchanged throughout execution; their hashes are
in `green-source-hashes.json` and their bytes in `.green.gz` snapshots. The
unified service, ordinary route and shared `create-task.ts` retain their prior
hashes, and all earlier workflow/ordinary cases pass.

The 69 unified cases comprise:

- Four original counterexamples.
- Twenty current actor/project cases: ten malformed explicit project IDs,
  foreign/missing and archived/deleted parents, revoked organization membership,
  inactive user/organization on unfiled work, use-only and inactive edit shares,
  and a valid current project editor.
- Twenty-six workspace cases: independent body/request project claims, actual
  null/foreign/missing project workspaces, an explicit matching project
  workspace, valid workspace-only tasks, missing/mismatched workspace-only
  claims, ten invalid body workspace IDs, and an actual workspace read failure.
  Unfiled requests without body scope preserve null project/workspace even when
  request context alone carries workspace 71, foreign workspace 81 or malformed
  text. Explicit valid workspace-only intake keeps its same-organization scope.
- Nineteen preservation/durability cases: both document source kinds stay
  metadata on unfiled work, explicit scope remains independent of source
  metadata, all six accepted module defaults, both existing aliases with actual
  fields/attribution/reason and atomic lineage, six RR1 protected input columns,
  actual audit failure rollback and a committed-but-unacknowledged COMMIT.

Refusal helpers compare owner-side task, dependency, action, audit and template
usage counters before and after the request. Both alias cases join actual task,
action and audit rows and compare their PostgreSQL `xmin` transaction identity.
The audit-failure case installs a real temporary CHECK constraint on the audit
table, then verifies complete task/action/audit rollback and restores it.

The workspace-read fault temporarily revokes SELECT from the restricted runtime
role, asserts that the role truly lacks that privilege, invokes actual HTTP/SQL,
and restores SELECT in `finally`. The result is sanitized
`TASK_PROJECT_ACCESS_UNAVAILABLE`/503, with zero changes. No database operation
in this proof is replaced by a SQL mock.

The lost-COMMIT case commits on PostgreSQL first and then loses only its
acknowledgement. Actual owner reads see one task/action/audit. The response is
`OUTCOME_UNKNOWN`, discards the uncertain request connection exactly once and
does not claim that nothing was saved. Unified creation still introduces no
notification. Existing ordinary notification ordering and both workflow
lock-wait/permission-retention cases also pass in this same run.

Runtime and owner pool `.ended === true` assertions pass in cleanup. All source
and test writers were frozen, and the database released for the root's aggregate
qualification, after this run. Scoped ESLint on both resulting test files exits
0 with no findings (`lint.txt.gz`). The main test is 463 lines and its single
extracted fixture is 206 lines.

## Reproduction and qualification limits

Use Node 22 from the repository root. Point `DATABASE_URL` and
`TEST_DATABASE_URL` to an owner-capable **disposable** PostgreSQL 16 database,
with `RLS_ENFORCE=on`, `NODE_ENV=test` and `CI=true`:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.db.config.ts tests/db/workflow-project-admission.dbtest.ts --reporter=verbose
```

To select the original RED cases against their saved bytes, add
`--testNamePattern 'unified task project admission counterexamples'`.

The fixture supplies a synthetic authenticated identity and tenant middleware.
It verifies a disposable `NOSUPERUSER NOBYPASSRLS` runtime role and forced tenant
RLS, then runs real request-bound actor/project/workspace/share admission and
task/action/audit SQL. Canonical ORM task columns and existing audit DDL/migration
are reused, with narrow test-only source anchors. A partial side-effects mock
replaces only notification delivery; actual cascade/cycle functions remain.

This is not a deployed login/JWT, full migrated database, browser workflow,
notification-transport or all-task-writer qualification. No production screen,
route mount, service, table, identity scheme or module behavior was added by
these tests. `SHA256SUMS` verifies the evidence, hash records and saved sources.
