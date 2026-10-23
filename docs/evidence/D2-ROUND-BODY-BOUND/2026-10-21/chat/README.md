# Classic chat typed refusal — frozen fail-first suite

## What already exists

`server/routes/chat/send-message.ts` already catches executor exceptions and
files a failed turn through `recordLoopTurn`. Every such error currently returns
503 `AI_PROVIDER_UNAVAILABLE`. This suite extends qualification of that existing
catch through the mounted Express handler; it introduces no production carrier.

## Frozen baseline

The new test file is
`server/routes/chat/__tests__/send-message-result-budget.test.ts`, SHA-256
`c65f2f63632dc965f4da22e08f5fe5a64ba1ddbab3e425452c71504cad4912bd`.
All selected root baseline inputs still match
`8c6bd712ecbf0e8e6a62cd581d1b1f7186b98aaf`; the two intervening commits
contain only the approved contract/evidence. [frozen.json](frozen.json) pins the
file, baseline inputs and raw run artifacts. No test edits follow this freeze.

The canonical Node 22 baseline run reports **2 intended failures, 2 passing
controls / 4 tests**, exit 1. Both failures are the actual route returning
503/provider code instead of the specified 422/budget code and safe uncertainty
message. New error-class availability is feature-detected: the baseline throws
an equivalent ordinary error into the existing catch; the completed run uses
the real exported class. Missing exports do not cause the red result.

The failing cases also verify that the handler passes raw execution results
and the original error to the failed-turn writer, and preserves either its
recorded reference or its explicit not-recorded outcome. Passing controls retain
the ordinary provider failure and reject copied error name/code as proof of a
typed refusal. The final route must use the actual class identity.

## Commands and seam

From `/workspace/Concept2Cure`:

```sh
PATH=/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH NODE_OPTIONS=--max-old-space-size=4096 node_modules/.bin/vitest run --config vitest.config.ts --maxWorkers=1 --no-file-parallelism server/routes/chat/__tests__/send-message-result-budget.test.ts --reporter=verbose --reporter=json --outputFile=docs/evidence/D2-ROUND-BODY-BOUND/2026-10-21/chat/baseline-results.json > docs/evidence/D2-ROUND-BODY-BOUND/2026-10-21/chat/baseline-run.txt 2>&1
PATH=/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH node_modules/.bin/eslint server/routes/chat/__tests__/send-message-result-budget.test.ts --format json > docs/evidence/D2-ROUND-BODY-BOUND/2026-10-21/chat/lint.json
```

Scoped lint: **0 errors, 0 warnings**. The native handler, response serialization
and error catch run. Executor, database, retrieval, context and record writer
are deterministic substitutes. Synthetic record IDs are test writer outputs;
this suite does not establish durable records, allocation correctness, source
admission, actual tools/actions, provider service or any live regulatory outcome.
The raw transcript is byte-preserved, including terminal whitespace.
