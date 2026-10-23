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
- `verified-ui-cohort.txt`: final 38/38 checks, two files, exit 0. Exact command,
  final source hashes and result hash are in `verified-inputs.json`.
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
