# Actual PostgreSQL workflow project admission

## What already exists

The only workflow task writer is `server/routes/taskManagement.routes.ts`.
This qualification reuses `tests/db/scheduler-harness.ts`, its canonical tenant
RLS policy and role provisioner, modeled columns from `shared/schema.ts`, the
existing narrow audit/actions DDL and the actual audit-chain migration. The
pre-implementation inventory and closure contract are in the parent README.
No production schema or new writer was added.

## Genuine pre-fix failures

`red-before.txt.gz` records two actual PostgreSQL failures before the route
changed. A member without edit access to another same-organization private
project, with a matching actual workspace claim, received HTTP 200. Owner reads
confirmed two tasks, one edge, three actions, three paired audits and one usage
increment. A legitimate owner received tasks with null workspace instead of the
project's actual workspace. The three captured source hashes were unchanged.
Exact pre-fix route and test bytes are retained as compressed fixtures.

## Final result

57 tests pass against nine unchanged captured source/test files. Scoped test
lint has zero errors and warnings. The suite covers malformed/missing IDs,
foreign/missing/closed parents, current organization membership and role,
active edit versus read-only sharing, actual workspace ownership and claims,
immutable authenticated organization/creator, both route aliases and legacy
200 envelope, complete task/edge/audit/usage atomicity, builtin templates and
protected review-route columns.

The two actual PostgreSQL barriers verify both sides of a permission race:
- a share revoked while a parent lock delays admission is refused;
- after admission, edit-membership revocation waits on the workflow transaction
  until its atomic commit, and the next create is refused.

Injected actual row constraints prove rollback of tasks, edges, usage and both
ledger halves. A request wrapper loses an acknowledgement only AFTER the actual
COMMIT succeeds: the response stays unknown, the request connection is discarded,
and owner reads prove the one workflow remains committed.

`first-expanded-diagnostic.txt.gz` preserves 55 passing cases and two test-only
owner-read JOIN failures. The narrow audit fixture uses TEXT ids and its action
pointer uses UUID; an explicit cast fixed those reads without a production
change. The final run is in `green.txt.gz`; provenance is
`green-source-hashes.json` and verification.json.

## Scope and cleanup

Authentication is synthetic. All current user/organization/project admission,
sharing, locks, task persistence, RLS and canonical chained audit SQL are real.
The runtime role is proved NOSUPERUSER and NOBYPASSRLS. This is not a deployed
login walkthrough or complete migration-schema qualification. The RR1 code
refusal is exercised; the separate production trigger suite is not claimed here.

Both runtime and owner Pool.ended are asserted after actual teardown. Every
fault constraint and lock holder is cleaned up. The disposable schema and role
are removed through the existing harness. The database slot is released.

To repeat, set TEST_DATABASE_URL to the disposable owner database and use Node22:

    DATABASE_URL="$TEST_DATABASE_URL" RLS_ENFORCE=on NODE_ENV=test CI=true \
      node node_modules/vitest/vitest.mjs run --config vitest.db.config.ts \
      tests/db/workflow-project-admission.dbtest.ts --reporter=verbose
