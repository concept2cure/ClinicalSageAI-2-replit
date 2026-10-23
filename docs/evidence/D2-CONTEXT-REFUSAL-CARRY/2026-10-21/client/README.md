# Existing client context-refusal recovery — frozen proof

## What already exists

`client/src/concept2cure/components/ana/useAnaChat.ts` already owns actual
fetch/SSE parsing, error recovery, partial text, refusal codes and turn-record
carry. `client/src/lib/queryClient.ts` owns the canonical `serverMessage`
sanitizer and `errorCodeOf` reader. `anaProgress.ts` owns `readTurnRecord`.
Existing refusal/stream-refusal/turn-record suites expose these seams. This
suite reaches the existing context classification through the same hook; no
second parser, sanitizer or record reader is introduced.

## Freeze and commands

The new file is
`client/src/concept2cure/components/ana/__tests__/useAnaChat-context-window.test.ts`,
SHA-256 `32241c9cc91241fab9911a51c47d98c8178b05a4e6acf91e55131d9bc8f06f1b`.
[frozen.json](frozen.json) records its exact command, Node 22 qualification,
raw/report hashes, all 24 post-run baseline checks and lint command/result.
[pre-run-pins.json](pre-run-pins.json) records all 24 selected source/fixture/
configuration hashes unchanged before the qualification run. All remain
unchanged at freeze; these selected pins are not an exhaustive dependency graph.

The canonical configuration run exited 1 with **22 intended failures and
9 passing controls, zero skips**. [baseline-vitest.txt](baseline-vitest.txt)
retains raw output and [baseline-vitest.json](baseline-vitest.json) retains the
machine report. Failures are actual hook behavior: generic retry copy replacing
context guidance, generic partial warnings, and HTTP parsing losing sanctioned
messages/valid records. No missing exports, imports or feature-detection skips
supply failures. Missing/empty/internal message cases run through actual SSE and
HTTP transport parsing; they catch synthesized `Stream error` and HTTP status
error leakage as well as direct recovery-helper omissions.

The checked file has **zero lint errors and zero warnings** with explicit
`eslint --no-ignore` before freeze. The first lint command used the default
ignore and produced one ignored-file warning; that raw report is retained as
`pre-freeze-lint.json`. `pre-freeze-lint-included.json` is the actual included
lint result. An initial unchanged test run had identical 22/9 counts and remains
retained as `initial-baseline-vitest.{txt,json}`; qualification was repeated
after included lint and explicit pre-run pins. The test file was not changed
between either run and is immutable after freeze.

## Coverage and limits

The real React hook reads fixture SSE and non-2xx `Response` streams. Cases cover
empty/partial canonical guidance, sanitized fallback, refusal code, spinner end,
exact partial text, top-level and nested HTTP records, explicit not-recorded
outcomes, malformed/missing unconfirmed records and the independent audit
warning. Existing generic, raw-body-budget422, access and rate recovery remain
passing controls. Every case sends exactly one POST, with no automatic retry.

The server-stated record flag is observable through a real `run_started` SSE
frame followed by a valid recorded/not-recorded error outcome: no
`recordConfirming` lookup is started and fetch is called once. A non-2xx response
has no `run_started` event and its current turn has no run ID, so the private
flag's effect cannot independently trigger a public lookup there; valid HTTP
record carry is directly asserted instead. Missing/malformed records never
become recorded by default.

Only fetch supplies synthetic HTTP/SSE responses. No live gateway, provider,
current-source admission, durable record storage, exact token sizing or agency
acceptance is qualified by these client tests.
