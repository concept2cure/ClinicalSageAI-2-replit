# AnA interrupted responses and recovery — W3 / D4

Date: 2026-10-06 UTC. Scope: shared client response presentation and recovery.

## Reproduced defect

The streaming hook preserved partial response text after a server error, premature
EOF or timeout, and marked the turn interrupted. The shared activity mapper did
not carry that distinction. A text-only failed answer whose record was confirmed
therefore appeared as ordinary settled text, without an incomplete-response note
or Continue. Recording a failed turn does not mean its response completed.

`interruption-red.txt`: four failures and ten passing safeguards before the
presentation fix. Tests use real SSE responses, the real hook, the actual rail
adapter, and the rail and full conversation screen. The recorded-server-error
case reproduces independently of an unconfirmed-record warning.

## Change

- The hook marks an interrupted response as partial only when actual response
  tokens arrived. Generated failure copy is never mistaken for partial work.
- The shared activity projection shows that the text may be incomplete. The
  latest settled partial response offers user-triggered Continue through its
  existing host send path. Older turns keep their note without that button.
- Explicit Stop, repeated-step explanations, existing accurate stop reasons,
  completed responses and refusals without partial text retain their behavior.
  No request retries automatically. An unfinished tool reports an interrupted
  turn without inventing a network failure.
- HTTP 401 asks the person to sign in again; 403 gives access recovery. Unknown
  failures say the request could not complete instead of inventing a network or
  gateway cause. Existing provider-unavailable, weekly-cap and rate-limit copy
  remains specific. `refusal-red.txt` records four failing copy regressions and
  three passing existing explanations before that adjacent correction.

## Verification

**120 distinct tests passed across nine suites**, with one new test assertion
corrected after the broader run:

- `targeted-initial.txt`: 116 passed, one failed because the new tool-note test
  asserted `resultSummary`; the existing settlement contract stores `message`.
  This included seven fully green adjacent suites for refusals, existing Continue,
  activity rendering, accessibility, run-policy stops, network waits and records.
- `interruption-green.txt`: all 17 real-hook/host cases pass after correcting
  that assertion. Includes server error, EOF, timeout, explicit Stop, recorded
  failure, both hosts, older-turn suppression, HTTP 401/403/429, and complete text.
- `tool-note-green.txt`: the final tool-note test also opens the work disclosure
  and verifies the neutral message is visible.
- `route-refusals-green.txt`: three existing real-hook route-refusal cases pass;
  25 unrelated drive cases were deliberately excluded by the test-name filter.
- `lint.txt`: zero errors, 38 existing source warnings; the new tests have none.
  `git diff --check` passes. No baseline or gate changes.

Continue creates a new turn on the existing conversation; it does not resume the
failed server run or automatically replay tools. The server prefers persisted
history for an existing thread, and a failed turn's partial text may not have
been persisted. This change does not promise exact-position continuation or
change history authority, persistence, approvals, models, or provider behavior.
The partial-response flag is local to the current session.

Tests ran serially under Node 22.16 with a 2 GiB heap. No live-provider latency or
successful completion of the user's production workflow is claimed here.
