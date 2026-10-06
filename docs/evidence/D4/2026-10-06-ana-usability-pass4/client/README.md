# AnA conversation selection and recovery — W3 / D4

Date: 2026-10-06 UTC. Scope: client conversation history ownership and recovery.

## Reproduced defect

The shell's chat survives navigation between conversation screens. History reads
had no cancellation or ownership check. Selecting Alpha, then Beta, could display
Alpha again when its slower response arrived last. The next question carried
Alpha's `thread_id` and history. An older read could also clear the loading flag
while Beta remained pending. Reset did not stop history from restoring an old
conversation over a fresh question.

A failed switch retained the prior transcript and thread id, and the conversation
screen hid its failure when that transcript was nonempty. The composer remained
enabled during history loading. Its submit handler cleared the person's draft.

`thread-red.txt` records 10 failing regressions and 13 passing existing cases
before production changes: seven hook cases and three conversation UI cases.

## Change

- A history request owns its AbortController. New selection, reset and unmount
  cancel the old request; identity checks also reject stale responses and body
  reads even if the transport finishes after cancellation. Stale success, error
  and finally paths cannot replace the latest conversation or loading state.
- Selecting history clears the old transcript and thread identity. The latest
  failed read records its thread and recovery message. Synchronous send guards
  prevent a question from going to the old thread or silently starting a new one
  while history is loading or failed.
- The conversation composer preserves its draft during loading/failure. A failed
  read offers Retry for the selected thread. Explicit New clears the failure or
  cancels a pending read and retains the typed draft; it remains unavailable while
  AnA is answering. Existing active-stream navigation behavior is preserved.
- The lead's shared type and shell/rail wiring use the same optional
  `threadLoadError` contract; their evidence is in the parent directory.

## Verification

`targeted-green.txt`: **53 tests pass across six suites**, covering the real hook's
request bodies and cancellation, delayed response bodies, same-tick send guards,
retry/reset after failure, conversation UI draft retention, existing history,
network waits, progress, and run policy. `thread-green.txt` is the earlier focused
24-test green run; the final targeted run also verifies New during pending load.

An initial broader run containing the existing drive suite exited without a final
summary. It is not counted as a passing run. The completed six-suite run above is
the reported validation.

`lint.txt`: zero errors, 42 existing source warnings; the two changed test files
have no warnings. `git diff --check` passes. No full typecheck, live provider run,
or production latency measurement is claimed.

Tests used Node 22.16 with a 2 GiB heap, one Vitest worker and no file parallelism.
No dependency, model, approval or governance changes.
