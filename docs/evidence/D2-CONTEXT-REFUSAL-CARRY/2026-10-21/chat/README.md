# Reach existing context refusal through classic chat

## What already exists

`server/routes/chat/send-message.ts` already catches executor failures, files
the failed turn and preserves the strict raw-body limit's 422 response. Other
errors, including the canonical `GatewayContextWindowError`, become generic
503 provider failures. `server/services/ai-gateway/context-budget.ts` already
owns that class and its measured size/ceiling/reduction sentence. The existing
gateway classifier/status table own `TOKEN_LIMIT_EXCEEDED` and 413. This suite
qualifies reaching those existing semantics through the actual mounted handler.

## Frozen fail-first evidence

Test: `server/routes/chat/__tests__/send-message-context-window.test.ts`.
SHA-256:
`b00c34256a20ae012cece4006f74e35023d6708e246db51aa7939e7abfdd2a30`.
The final baseline run has **3 intended failures and 4 passing controls / 7
tests**, exit 1. All 24 selected inputs match baseline
`30afd3bd17a90c8de4a44098354d9de3a34cb4bc` both before and after that run;
the current head differs only by the committed contract/evidence.
[frozen.json](frozen.json) binds exact tests and artifacts. No test edits follow
freeze. Final lint before freeze has **0 errors and 0 warnings**.

The red cases construct the real existing context error, covering measured
multi-candidate guidance with reserved answer tokens, recorded/not-recorded
writer outcomes, and a zero-reserve request without tools. They fail because
the actual catch returns 503/provider code/message instead of 413 and the
canonical measured sentence plus the fixed prior-work uncertainty suffix.
Raw execution results and the original error remain in failed-turn arguments;
no missing export/import causes these failures. Inputs and error messages are
checked for mutation.

Passing controls preserve the existing raw-body 422 response byte for byte,
generic provider 503, copied context class name/code/message rejection, and a
real provider-wrapped token failure. The last deliberately has classifier code
`TOKEN_LIMIT_EXCEEDED` but remains a generic route failure, so classification
code alone cannot widen the new context branch.

An initial pre-freeze run had the same 3 intended failures/4 controls and one
lint warning for unqualified `structuredClone`. The test was corrected to
`globalThis.structuredClone` before the final lint and freeze. That earlier
run/report/lint remain under `prefreeze-initial-*`; they are not the frozen
baseline qualification.

## Exact commands and limits

From `/workspace/Concept2Cure`, with explicit selected-input hashes immediately
before and after the final Vitest command (see `baseline-before.json` and
`baseline-after.json`):

```sh
PATH=/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH node_modules/.bin/eslint server/routes/chat/__tests__/send-message-context-window.test.ts --format json > docs/evidence/D2-CONTEXT-REFUSAL-CARRY/2026-10-21/chat/lint-before-freeze.json
PATH=/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH NODE_OPTIONS=--max-old-space-size=4096 node_modules/.bin/vitest run --config vitest.config.ts --maxWorkers=1 --no-file-parallelism server/routes/chat/__tests__/send-message-context-window.test.ts --reporter=verbose --reporter=json --outputFile=docs/evidence/D2-CONTEXT-REFUSAL-CARRY/2026-10-21/chat/baseline-results.json > docs/evidence/D2-CONTEXT-REFUSAL-CARRY/2026-10-21/chat/baseline-run.txt 2>&1
```

The mounted Express handler, catch and serialization are real. Executor, DB,
retrieval, prompt context and writer are deterministic substitutes. Synthetic
record IDs are test writer outputs. This suite does not qualify allocation,
live provider admission, exact tokens, source access, actual actions/receipts,
durable records or agency acceptance. Raw transcripts retain their exact bytes,
including terminal whitespace. No production, Git or compiler work was done
by this owner.

## Root EOF qualification addendum

Before production edits, root removed only one extra trailing EOF newline from
the frozen test file. Original bytes/diff and repeat baseline are retained in
`../whitespace-review/`: three intended failures, four controls, no skips,
included lint zero and all 24 selected baseline inputs unchanged. The final
hash is in `../frozen-tests.json`; every assertion and fixture is unchanged.
