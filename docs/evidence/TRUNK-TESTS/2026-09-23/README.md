# concept2cure-v2 CI: the red gates put back to green, 2026-09-23

**Why this sits under TRUNK-TESTS.** It moves no launch row by itself. Every
row's CI evidence depends on it: CI's Lint job gates every downstream job
(Production Boot Smoke, Blank DB Provisioning + Deploy Migration, Integration
Tests, Coverage). While Lint was red, those jobs reported "skipped", and a
skipped job cannot evidence anything. The D6 session found the tree red while
filing its own evidence and fixed what was red.

## What was red, and why

At `aa80f8415` (run 35874278603; `red/ci-lint-job-aa80f8415.txt`):

| Gate | Cause | Whose | Fix |
|---|---|---|---|
| dependency-risk ledger (Security Scan) and its integration test in `test:ci-scripts` | The ledger's lockfile seal was stale after speakeasy was removed (`a689ad680`). | D6 | Resealed; no entry changed (`811be46c0`). |
| real-database tests never inherit the pg mock | The rule matched any quoted string ending in `/setup`, so a route URL such as `'/api/setup'` in a dbtest read as an import of the pg mock. | gate | The rule now matches only a module specifier. An 8-case self-test runs in CI ahead of the gate (`811be46c0`, `f48ab65d9`); with the old rule it fails 2 cases (`red/db-test-isolation-selftest-old-rule.txt`). |
| regulatory-honesty contract | It still required the Authoring signature copy to say "PIN-verified". `6f79a000f` had retired the PIN. | stale test | Now requires "signer's password is re-verified" and forbids the PIN claim (`811be46c0`). |
| audit_logs fixtures accept the audit writer's columns | Both freeze-gate suites (`760888fef`) declared 6 of the 16 columns `writeChainedAuditRow` writes, and stubbed the writer. | W5 lane | Both suites load `AUDIT_LOGS_PGLITE_DDL` and use the **real** chained writer; the stub is gone (`4226565db`; `red/audit-logs-fixture.txt`). |
| ESLint warning ratchet | 6474 > 6464. The growth was in files other lanes changed after `cc5aa066d`. | several | Below. |

## The ESLint ratchet

Two lanes paid it down independently and landed the same day:
- The D5 lane (`a3e66c99b`) took back its own warnings: protocol reviews,
  signature persistence and the protocol client surfaces.
- This lane took back 11 warnings in other files, by behaviour-preserving
  refactors only (`d45b3a9f7`, `58b510dab`). No disable comments and no limit
  changed. The per-file list is in `green/eslint-ratchet.txt`.

How each change was checked:
- A fixer recorded the file's tests and lint counts before and after.
- An independent reviewer read each diff against HEAD for behaviour change.
- I read the production diffs myself, and ran the 27 affected test files
  together: 418 of 418 pass.

Two refactors were produced and **not** landed:
- A split of `coauthorSnapshotFromSource.test.ts`. It moved every `vi.mock`
  into a shared module, a pattern this repo does not use, and rewrote a file
  another lane is working in. Its reviewer failed it.
- A protocol-reviews extraction, duplicated by `a3e66c99b`, which landed first.

The tree is then at 6440, and the baseline is ratcheted down to it
(`4a3e1a9b8`); no rule's count rose.

## Found, not fixed

On a database where migrations created `public.c2c_document_aliases`, the
freeze-gate row-lock suite fails before it reaches the lock it tests:
- It runs in a private schema.
- The alias reader probes `to_regclass('public.c2c_document_aliases')` by
  schema-qualified name, and the probe answers "present".
- The unqualified SELECT that follows resolves in the private schema and fails.

The suite passes on an empty database, which is what the CI Test job uses
(`4226565db` message). The result is the same before and after this work.
The owner is the alias map's lane: probe the search path's table, or run the
suite in `public`.

## Evidence

| File | Shows |
|---|---|
| `red/ci-lint-job-aa80f8415.txt` | The failing CI steps, verbatim. |
| `red/audit-logs-fixture.txt` | The fixture gate naming both freeze-gate fixtures. |
| `red/db-test-isolation-selftest-old-rule.txt` | The self-test failing on the gate's old rule. |
| `green/gates.txt` | Each gate above passing at `4a3e1a9b8`, and `test:ci-scripts` 43 of 43. |
| `green/regulatory-honesty.txt` | 14 of 14. |
| `green/eslint-ratchet.txt` | The per-file deltas, 6440 ≤ 6464, and the lowered baseline. |
