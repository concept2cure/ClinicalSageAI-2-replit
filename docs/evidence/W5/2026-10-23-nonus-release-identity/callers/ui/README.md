# Existing Dispatch UI continuation — W5 / D7

## What already exists

`SubmissionSeqWorkspaces.tsx` already shows renewal only from explicit server
`dispatchAuthorization` plus the current independent-signer/gate assessment.
`SubmissionCenter.tsx` already runs a fresh precheck, the existing Part 11 modal,
the dispatch act, and the existing readiness refresh after a confirmed receipt.
The region is not reinterpreted in the UI. No second action or refresh was added.
Only the FDA-specific type comment changed in production.

## Executed proof

- `existing-ui-cohort.txt`: 36 existing/expanded checks passed before the comment
  change. This established that the existing UI already handles non-US renewal;
  it is an exploratory run, not a separately pinned qualification run.
- `verified-ui-cohort.txt`: historical pre-refactor 38/38 checks, two files,
  exit 0. Its source hashes and result hash remain in `verified-inputs.json`.
- FDA, EMA and JP follow the same server-authorized renewal control. Missing
  authorization, attempted-transmission refusal, blocking gates and author status
  withhold renewal. A valid release does not offer unnecessary renewal.
- FDA, EMA and JP sign once for the actual sequence with intent `dispatch`, pass
  its new action ID once to the dispatch act, then reread current readiness after
  a confirmed receipt. EMA/JP pre-sign gate drift takes no signature or act.
  Unconfirmed receipts keep the unresolved verdict, do not refresh it into a
  success and do not repeat the sign or dispatch request.

These are Vitest/jsdom component and workflow tests with mocked API and password
verification boundaries and a real existing modal. They do not claim native
browser, database, agency transmission, human witnessing or regulatory acceptance.

## Warning-ratchet correction

The first lint run (`lint.txt`) included one new test callback-complexity warning
among eight warnings. It was initially misreported as all existing warnings;
the canonical push ratchet correctly rejected that growth. The mocked precheck
branch is now a private `renewalPrecheck` helper in the same test fixture, with
all assertions and outcomes preserved. No suppression or baseline was changed.

`refactored-ui-cohort.txt` is the current 38/38 replay (exit 0).
`refactored-lint.txt` has zero errors and seven warnings, all in the unchanged
production surface; both test files have no warnings. Exact commands, current
source hashes and result hashes are in `refactored-inputs.json`. Earlier logs
and input pins are historical and preserved.
