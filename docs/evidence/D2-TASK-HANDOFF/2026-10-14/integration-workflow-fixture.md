# Native workflow review fixture repair

2026-10-14; W1 / D2, under the
[task handoff contract](../../../design/TASK_DRAWER_HANDOFF_2026-10-14.md).
Scope is the existing native workflow test and its test-only review helper.
No production admission, review, signature or release rule changed.

## Failing-first evidence

The real-database step of
[exact-source `6ffcb425` Integration job 116128560774](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38642062236/job/116128560774)
had ten failures in `tests/db/workflow-import-governance.dbtest.ts`.
The unchanged fixture reproduced **9 passed / 10 failed / 19 total**, no skips,
in the isolated merged-source baseline at `23502318`. Full private outputs are
`/workspace/scratch/task-handoff-native/merged-32-before.log` and `.json`;
`merged-32-before-source-pins.json` and `merged-32-before-census.json` retain
the baseline source and per-file census.

The first failure stopped at `approveAssignedReview`, original line 81:

```text
REVIEW_INPUT_INVALID: A verdict and the exact saved review context are required.
expected 400 to be 200
at approveAssignedReview (.../tests/db/workflow-import-governance.dbtest.ts:81:57)
```

The fixture still posted the legacy status/comments-only verdict. The native
route correctly refused it; the affected adoption/release assertions could not
execute past that prerequisite. Active memberships and the canonical project
anchor were already present in this fixture.

## Repair and native result

`tests/db/workflow-import-review-fixture.ts` now obtains the assigned reviewer's
actual authenticated GET context and parses the shared read/expected schemas.
It checks document, actor, organization and current assignment before the existing
POST supplies the exact request round and saved-content binding. After the
original HTTP-success assertion, shared receipt parsing checks the persisted,
chained current verdict, its identities, request ID, digest/basis and complete
retained snapshot against the GET result. It derives no new hash or permission.

All **108 original assertion lines and all 19 original cases remain**. The
original password/signature, forced-RLS isolation, stale-source, machine-origin,
qualification-hold, concurrent freeze/edit, revision and controlled-output checks
continue through their actual native paths. No guard mock, legacy fallback,
skip, suppression or baseline change was added.

The control tower provisioned an isolated local PostgreSQL 15 container using
canonical `install-fresh.mjs` and `deploy-migrate.mjs`, both exit zero. The test
uses the restricted `app_service` runtime connection with `RLS_ENFORCE=on`.
Its first passing case queries the actual NOSUPERUSER/NOBYPASSRLS role, compares
the canonical scoped pool identity and verifies enabled/forced RLS on the source
table. No other workspace's private launcher or credentials were used.

Both the initial repair and extracted-helper replay passed **19/19**, no skips.
Selected raw verdict lines from the final extracted-helper replay,
`/workspace/scratch/task-handoff-native/workflow-binding-extracted-final.log`:

```text
✓ ... > opens a real non-owner NOSUPERUSER NOBYPASSRLS connection 20ms
Test Files  1 passed (1)
     Tests  19 passed (19)
  Duration  14.98s
```

The matching `.json` records every case. After this replay, the existing pure
HTTP-call helper was expressed as an equivalent two-line arrow to avoid adding
a file-length warning; request parameters and behavior did not change. Final
scoped ESLint is **zero errors / zero warnings** in
`workflow-binding-lint-final.json`; `git diff --check` passes.

Full logs and environment configuration remain private; no credentials or
driver configuration were copied here. This is local native SQL/HTTP/signature
test evidence, not a deployed human acceptance run, live MFA ceremony, scientific
qualification or a whole-CI pass. Final published-source verification belongs to
the control tower's release evidence.
