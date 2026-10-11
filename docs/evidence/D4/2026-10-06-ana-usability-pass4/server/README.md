# Command-only answers retain the real outcome — 2026-10-06

Workstream W3, launch row D4. Scope: the command-cleanup assignment in
`server/routes/ana-ri/post-processing.ts` and the dedicated
`post-processing-command-only.test.ts` regression suite.

## Defect and change

`processCommandsInResponse` removes command fences after dispatch. A reply made
entirely of commands correctly produces `cleanedText: ''`. The stream postprocessor
treated that valid empty string as missing and restored the raw command JSON.
Its existing `blocksOnlyAnswer` fallback never ran for these replies.

The postprocessor now retains `cmdResult.cleanedText` verbatim. Its existing final
answer selection can explain a pending confirmation, a refusal with its reason,
or an actual success. Prose surrounding command blocks remains unchanged. The
existing parser, dispatcher, authorization, proposal/signature gates, answer
verification, persistence, and fallback wording are unchanged.

This is one assignment change plus an explanatory comment. It does not change
model behavior or assert that a proposed action happened.

## Behavioral evidence

The dedicated suite imports the actual postprocessor, command parser/dispatcher,
authorization/proposal logic, answer verifier, and turn recorder. Only external
I/O and role lookups are mocked. `create_task` produces a real pending-confirmation
envelope; denying its role produces the real refusal; `list_projects` exercises
an actual successful read handler over an empty mocked tenant result.

Every case checks the same final answer in `post_done`, conversation persistence,
the sealed record's stored-answer blob, verification, and working-memory input.
The record retains the original streamed text separately. It also checks that no
governed write or write transaction occurred.

- `before-tests.txt`: 3 failed, 2 passed against production code at `d669c6f0`.
  The confirmation, refusal, and success cases all receive raw fenced JSON;
  ordinary prose and mixed prose/command controls pass.
- `after-tests.txt`: 5 suites, 21 tests passed. Covers the new five cases plus
  existing action-block proposal, answer-check, proposal-check, and turn-record
  suites. Run with one worker to bound workspace memory and without overlapping
  client tests.
- `before-lint.json` / `after-lint.json`: zero errors. The production file retains
  four pre-existing warnings; its main function complexity decreases from 93 to
  92. The new test has zero warnings.
- `git diff --check` passed. Evidence files use tracked-compatible extensions.

No live provider/database test or full local typecheck was performed.

## Reproduction

From the repository root using Node 22.16.0:

```sh
export PATH=/root/.npm/_npx/2ad0c2d1aba2dd61/node_modules/node/bin:$PATH
node node_modules/vitest/vitest.mjs run \
  server/routes/ana-ri/__tests__/post-processing-command-only.test.ts \
  --config vitest.config.ts

node node_modules/vitest/vitest.mjs run \
  server/routes/ana-ri/__tests__/post-processing-command-only.test.ts \
  server/routes/ana-ri/__tests__/post-processing-action-block-proposal.test.ts \
  server/routes/ana-ri/__tests__/post-processing-answer-check.test.ts \
  server/routes/ana-ri/__tests__/post-processing-proposal-check.test.ts \
  server/routes/ana-ri/__tests__/post-processing-turn-record.test.ts \
  --config vitest.config.ts --maxWorkers=1

node node_modules/eslint/bin/eslint.js \
  server/routes/ana-ri/post-processing.ts \
  server/routes/ana-ri/__tests__/post-processing-command-only.test.ts \
  --format json
git diff --check
```
