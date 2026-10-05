# S5b (1) — a tool call whose arguments were lost is not run on `{}` (row 74, brief D15)

When a model's tool arguments do not survive the stream, the gateway marks
the call with `inputParseError` and leaves `input` as `{}`. That looks exactly
like a call that asked for nothing. The SSE stream has refused to dispatch
such a call since S1. `executeAgenticLoop`, the adapter every other door uses,
dropped the marker in `toToolCall` and ran the handler on `{}`. That covers
four doors today and the sub-agent child loop next. An unattended child would
have run a search for nothing and reported its result.

## Change

- `AnaToolExecutor.ts` `toToolCall` carries `inputParseError`.
- `agentic-tool-dispatch.ts` `dispatchOnce`: after the allowlist and before
  the scope and the handler, a lost-input call is answered with
  `lostToolInputResult` (the stream's own helper) and nothing runs.
  `onToolEvent` end still fires, with the parse error as `errorMessage`.

## Declared behaviour change

For `send-message.ts`, `ana-intelligence.ts`, `ana-realtime.ts` and
`deep-investigation.ts`, a truncated tool input is now an error result the
model reads ("The arguments for this call did not reach the tool …"). Before,
the handler ran on `{}`. A tool that was not offered is still answered
`TOOL_NOT_OFFERED`.

## Verification

- `red.txt`: on the unchanged tree, the probe handler was called (1 of 3 red;
  the allowlist case and the control already held).
- `mutations.txt`: three mutations, all red:
  - drop the carry;
  - guard placed before the allowlist;
  - guard removed.
- `green.txt`: the new test plus the executor loop suites, lost-input and
  deep-investigation neighbours: 6 files, 65 tests.
- The whole `server/services/ana/__tests__` directory plus every test that
  names `executeAgenticLoop`: 228 files pass. Two fail, and both fail the same
  way with this change stashed, so neither is caused by it:
  - `governed-reason-not-invented.test.ts`: one registered tool unscanned;
    already handed on;
  - `deepening-tools.test.ts`: `mockPool.connect.mockResolvedValue is not a
    function` at import.
