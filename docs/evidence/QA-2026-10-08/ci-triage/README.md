# CI triage — concept2cure-v2, 2026-10-08

Workflow `.github/workflows/ci.yml`. Runs examined:

| Run | Head | Role |
|---|---|---|
| 37748915598 | c4da48c9a | base, before this lane's pushes |
| 37756121383 | 6c58f587b | our first head |
| 37771675884 | e79cca4d9 | newest head (authority for the current head) |

Method. Job logs were read with the GitHub job-log API (it returns the last
5,000 lines of a job). Each failure was reproduced locally with the job's own
command and `RLS_ENFORCE=off` (an ignored local `.env` sets it on). Classification
ran the same tests on `git archive` exports of c4da48c9a (base) and e79cca4d9
(head) with `node_modules` symlinked — no worktree, no branch (CLAUDE.md Rule 0).
Raw outputs: `red.txt`, `green.txt`, `base.txt`, `mutation.txt` in this folder.

Classes: **(a)** caused by a commit on this branch since c4da48c9a; **(b)** already
red on the base; **(c)** environmental (needs proof).

## Failures, causes, fixes

### 1. Lint › Guardrails — requestDb (RLS) adoption (no regressions) — class (a)

- Check: `node scripts/ci/audit-requestdb-coverage.mjs --strict-no-regression`.
  Red on 6c58f587b and e79cca4d9: `FAIL — 1 NEW route(s) on the shared pool above
  baseline of 228 … server/routes/insights-canvas-routes.ts`. Green on c4da48c9a
  (`base.txt`: the file imports no shared `db` there).
- Cause: 4ac15bdd1 (Reporting & analytics, "scope follows the program") added
  `import { db } from '../db'` to `server/routes/insights-canvas-routes.ts` and
  resolved the open program with `resolveProgramProjectAnchor(db, …)`. That
  function's own contract is "the RLS-scoped per-request Drizzle client —
  `requestDb(req)`, never the shared pool".
- Fix (no baseline change): `pickLead` takes the request and reads the anchor on
  `requestDb(req)`, only when a program is named. The mount
  (`/api/insights-canvas`, `authenticateToken`) already installs `req.dbClient`
  through `establishRequestTenantScope`, so no mount change is needed; a request
  without it now fails closed (500) instead of reading on the shared pool.
- Tests (`server/routes/__tests__/insights-canvas-open-program.test.ts`): the anchor
  is resolved on `requestDb(req)` — not the shared `db`; with no request-scoped
  client the open program is not read at all (500, anchor never called). Both red
  on the HEAD route (`red.txt`: `expected { __db: true } to be NodePgDatabase`,
  `expected 200 to be 500`), green after. The catalog and portfolio-unavailable
  test apps now install the request-scoped client the production mount provides.
- Gate after the fix: `OK — no new shared-pool routes (227 current, 228 baseline)`.
  The gate also reports `server/routes/notification_routes.ts` as migrated: that
  file was deleted in bea4192be. The baseline was not rewritten here.

### 2. Lint › Guardrails — every tenant entry point considers entitlement — fixed before this triage

Red on 6c58f587b only. Fixed by ca49916f8 (mdx-admin.ts re-read, justification
digest refreshed); green on e79cca4d9 (run 37771675884). Locally:
`ci:tenant-entry-points OK — no unclassified tenant entry points`.

### Test › Run tests — what failed where

| Run (head) | Failed tests (files) |
|---|---|
| 37748915598 (c4da48c9a, base) | 2 (2): §4, §5 |
| 37756121383 (6c58f587b) | 3 (3): §3, §4, §5 |
| 37771675884 (e79cca4d9) | 8 (5): §3, §4, §5, §8 (biopharma fixture), §3b (ind-forms ×4) |

### 3. Test › Run tests — `threads-program-list.test.ts` — class (a)

- `listThreads by program > lists the org's threads bound to the program…`:
  `expected [ 7, …(4) ] to deeply equal [ 7, …(3) ]` (received an extra `0`).
- Cause: e04b568fe ("conversations page past eight", QA j5) added `OFFSET $5` and a
  fifth bound parameter (the list position, 0 when none is asked for). The older
  test still pinned four parameters. Passes on c4da48c9a (`base.txt`).
- Fix: the test pins the new shape exactly — `LIMIT $3 OFFSET $5` and
  `[7, program, 5, 41, 0]`. Paging itself stays pinned by
  `server/routes/__tests__/chat-threads-program-paging.test.ts`.

### 3b. Test › Run tests — `tests/routes/ind-forms-artifact-ident.test.ts` (4 tests) — class (a)

- Red at e79cca4d9 only: `resolves the program org-scoped, audit-logs the content
  hash…` and `keeps the audited-unplaced path when the program has NO anchor`
  (`expected … [ 200 ]`), and the two `FAILS CLOSED when the audit write …` cases
  (`expected … [ 500 ]`). All 9 pass on c4da48c9a (`base.txt`).
- Cause: aac603a1b (P-20 follow-up, by decision) replaced the "audited-unplaced"
  answer for a program with no project record — 200 `governed:false, audited:true`
  over an `ind_form.artifact.unplaced` audit row — with 409 `PROGRAM_NOT_ANCHORED`,
  nothing written, and made the anchor lookup strict (a lookup that cannot complete
  is 500). It pinned the new contract in
  `server/routes/__tests__/ind-forms.contract.integration.test.ts` but left this
  handler test asserting the removed branch.
- Fix (test only; the route is as aac603a1b left it): the four cases now pin the
  current contract at the handler — 409 `PROGRAM_NOT_ANCHORED` with "Nothing was
  saved", no `governed`/`audited` field, no insert and no audit write (for both the
  "program row but non-integer anchor" and "anchor lookup answers none" shapes); a
  lookup that throws is a 500 that never says `PROGRAM_NOT_ANCHORED`; and with the
  audit store rejecting or resolving unpersisted the refusal still claims nothing.
  The mocks are typed, so the file has no type errors (14 at HEAD, from the old
  `vi.fn<[], unknown[]>` signature; `tests/` is outside the tsconfig project) and
  no ESLint warning (1 at HEAD).
- Fails again on what it guards (`mutation.txt`): restoring a 200 for the
  unanchored program fails four cases; `strict: false` fails the lookup-failure case.

### 4. Test › Run tests — `stream-tool-carry-over.test.ts` — class (b)

- `a step the person declined is not carried, and a first turn is offered what it
  was`: `expected [ 'list_platform_commands', …(3) ] to not include
  'get_cmc_requirements'`. Same failure on c4da48c9a (CI run 37748915598 and
  `base.txt`).
- Cause: a0b3de231 (2026-10-07) made `get_cmc_requirements`, `find_cmc_guidance`
  and `explain_cmc_topic` always-on in `server/services/ana/tool-selection.ts`, and
  retargeted the unit carry tests to non-core tools — but not this route test, whose
  fixture used `get_cmc_requirements` as "the tool a previous turn ran". So the
  declined-step test failed (the tool is offered whatever the carry does), and its
  sibling "the tool the previous turn ran is offered" passed without the carry.
- Fix: the fixture's record tool is `list_cmc_registers` (a CMC record tool outside
  `ALWAYS_ON_TOOLS`), plus a premise test that it is not always-on. No product code
  changed.
- The test can fail again on what it guards (`mutation.txt`): carrying errored steps
  in `carriedToolsFrom` → the declined test fails; dropping the carry in `stream.ts`
  → "the tool the previous turn ran is offered" fails.

### 5. Test › Run tests — `useAnaChat-progress.test.ts` — class (b)

- `holds a steer as pending from acceptance until the server confirms it landed`:
  `expected [ 'Focus on the safety endpoints' ] to deeply equal []`. Same on
  c4da48c9a.
- Cause: 519c6acd5 (2026-10-07, "reconcile steering receipts") matches a steer's
  `interjected` echo by the server's canonical text (trim + cap), no longer by
  position, and pinned that in `useAnaChat-steering-receipts.test.ts` ("does not
  consume unrelated pending work on an unmatched external echo"). This older test
  still sent an echo the server cannot produce (`'Focus on the safety'` for
  `'Focus on the safety endpoints'`) and expected it to clear the steer.
- Fix: the echo is the canonical text of what was sent; the test still requires the
  steer to be pending from acceptance until the echo, and cleared by it.
- Fails again if receipts never confirm (`mutation.txt`).

### 6. Coverage (ratchet) › Coverage may not go down — consequence of 3, 3b, 4, 5 and 8, not a drop

- Log (c4da48c9a, 6c58f587b and e79cca4d9): `[ci:coverage-ratchet] ❌ no coverage
  summary at coverage/coverage-summary.json`. "Measure coverage" ran the same suite
  and hit the same failing tests (at e79cca4d9: the same 8 in 5 files as the Test job).
- Cause: vitest 4.1.7 defaults `coverage.reportOnFailure` to `false`
  (`node_modules/vitest/dist/chunks/defaults.*.js`), so no summary is written when
  any test fails, and the ratchet refuses a missing summary. No metric was compared.
- Fix: the test fixes above. The threshold and `scripts/ci/coverage-baseline.json`
  are unchanged. The last runs with a green Test job also had a green ratchet
  (e.g. 37712043961 at c7ae8c070, 2026-10-08 01:15Z).

### 7. Integration Tests › Run integration tests — consequence of 3, 3b, 4, 5 and 8 (inferred)

- The step runs the same `npm test` as the Test job plus `RUN_INTEGRATION_TESTS=true`.
  The three files that flag gates (`poolInstrumentation.integration`,
  `rlsPolicy.integration`, `innovation-platform`) pass on the e79cca4d9 export
  against a GCC-migrated scratch database (17 passed; the 58 innovation-platform
  tests reported skipped in that run). Failures 3, 3b, 4, 5 and 8 are deterministic and in
  the shared suite, so they alone fail this step. When the Test job was last green
  (run 37712043961, c7ae8c070) this job was green too.
- Not read directly: the step's summary sits about 22,000 lines before the end of
  the job log (Postgres container output follows it), past the 5,000-line log API
  window, and the `integration-tests-results` artifact is served from
  `*.blob.core.windows.net`, which this session's network policy refuses.
- History: in earlier runs where Integration failed with Test green, the failing
  step was "Run real-database tests", not this one; that step passes on our heads.

### 8. Lint › Proof tier — schema contracts + golden journeys + export contracts — class (a)

- Green at c4da48c9a and 6c58f587b; red at e79cca4d9 (run 37771675884) and again at
  f10e35a1e (run 37776673903), so it is not intermittent. The step's output lies
  outside the 5,000-line log window, so the failing test was found by running the
  whole tier (`npm run test:proof-tier`: `tests/schema-contract`,
  `tests/golden-journeys`, `tests/export-contract`) on the e79cca4d9 export.
- One failure: `tests/schema-contract/biopharma-programs-router-columns.contract.test.ts
  › the fixture table matches the Drizzle definition column-for-column` —
  `expected [ 'actual_submission_date', …(41) ] to deeply equal [ …(43) ]`.
  Passes on c4da48c9a (`base.txt`).
- Cause: aac603a1b (P-20 follow-up) added `sponsor_address` and `ind_type` to
  `regulatoryPrograms` in `shared/schema/programs.ts` (and to
  `server/db/pglite-harness.ts`), but not to this test's fixture table, which is pinned
  to the Drizzle definition column-for-column so that its statement planning means
  something.
- Fix: the fixture gains the two columns, as 192b6427a did for
  `application_number`. The guard is unchanged and still fails on any further drift.
- The same file runs inside `npm test`, so it is also a Test-job failure at
  e79cca4d9.
- Every other proof-tier file passed on the export. `rds-ca-bundle.contract.test.ts`
  fails only in a `git archive` export (it runs `git ls-files`); it passes in the
  real checkout.

### Base-only: Lint › Audit — repo health scan (no regressions)

Red on c4da48c9a only; green on both of our heads after 99e2ba822
(`chore(repo-health): auto-refresh baseline after merge`). Nothing to do.

## Files changed

- `server/routes/insights-canvas-routes.ts` — the anchor read uses `requestDb(req)`.
- `server/routes/__tests__/insights-canvas-open-program.test.ts` — two new tests.
- `server/routes/__tests__/insights-canvas-catalog.test.ts`,
  `server/routes/__tests__/insights-canvas-portfolio-unavailable.test.ts` — test app
  installs the request-scoped client.
- `server/routes/chat/__tests__/threads-program-list.test.ts`
- `server/routes/ana-ri/__tests__/stream-tool-carry-over.test.ts`
- `client/src/concept2cure/components/ana/__tests__/useAnaChat-progress.test.ts`
- `tests/schema-contract/biopharma-programs-router-columns.contract.test.ts`
- `tests/routes/ind-forms-artifact-ident.test.ts`

ESLint: every changed file has the same warning and error count as at HEAD
(0/0, except `useAnaChat-progress.test.ts` 1/0 before and after). Typecheck of the
changed files (narrow program over the HEAD export): no error in any changed file.
Guardrails re-run on the working tree: `ci:tenant-isolation:no-regression`,
`ci:tenant-entry-points`, `check:security-patterns`, `ci:audit-route-mounts:no-regression`
all OK.

## Red → green

- `red.txt` — HEAD e79cca4d9 code: the six files of §1 and §3–§5 (insights-canvas tests
  carrying the two new assertions): 5 failed of 41; requestDb gate exit 1;
  biopharma fixture 1 failed of 6; ind-forms handler test 4 failed of 9.
- `green.txt` — HEAD + this change: 61 of 61 across eight files, gate exit 0; biopharma
  6 of 6; ind-forms 10 of 10; final run of every touched file plus
  `ind-forms.contract.integration`: 137 of 137 in 11 files.
- `proof-tier.txt` — the whole proof tier in one process on HEAD + this change:
  118 of 119 files; the one failure (`rds-ca-bundle`) needs `.git` and passes in the
  checkout.
- `base.txt` — the same files on c4da48c9a: §3, §3b, §8 and the requestDb gate pass
  there; §4 and §5 fail there.
- `mutation.txt` — each changed test fails when the behaviour it pins is broken.

## What stays red, and why

Every failure CI reported at e79cca4d9 (run 37771675884: Lint ×2 steps, Test 8 tests in
5 files, Coverage, Integration) has a fix in the working tree, uncommitted, for the lead
to commit. Until CI runs on that commit:

- **Coverage (ratchet)** — the gate has not compared a number since run 37712043961
  (c7ae8c070): every run since failed tests, so no summary was written. If coverage
  has fallen more than 0.5 points below `scripts/ci/coverage-baseline.json` in that
  time, the ratchet goes red for a real drop, and the files whose coverage fell can be
  named only from that run's `coverage-summary.json`. Not measurable here: the
  coverage run takes about 100 minutes in CI, and this machine is shared.
- **Integration Tests › Run integration tests** — expected green with the Test fixes
  (§7), but its own summary could not be read: the job log is beyond the 5,000-line
  API window and the artifact host (`productionresultssa13.blob.core.windows.net`) is
  refused by this session's network policy. Allowing that host in the environment's
  network settings would make the artifacts readable for the next triage.
- Not covered: commits after e79cca4d9 (f10e35a1e, another session's `tests/ui`
  change, whose Lint shows the same two failed steps), and other sessions'
  uncommitted work in the tree.
- Optional, not done: `docs/reports/requestdb-coverage-baseline.json` can ratchet
  down by one (`server/routes/notification_routes.ts` was deleted in bea4192be).
