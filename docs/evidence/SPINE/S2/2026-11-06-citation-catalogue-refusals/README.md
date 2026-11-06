# The editor's citation catalogue says a refusal as itself, with no retry

**`Plan: F1`** (the files are in D4's paths, and no session holds them). Session
`session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-06. This completes the hand-off in
`docs/evidence/SPINE/S2/2026-11-05-data-room-refusals/` ("D4: `useProjectSourceCatalog.ts` does not classify
refusals").

## The defect

The editor's **Cite a source** picker reads the project's whole source catalogue through
`client/src/concept2cure/v2/editor/useProjectSourceCatalog.ts`. A refused read showed the gate's raw words, "Module
access denied", with **Try again**: a plan without the feature, a part not in this release, a role, or a project not
in this organization. None of those changes on a retry. The founder's 2026-11-05 rule says these are never one
generic failure.

## What already exists (RULE 3)

- The one read classifier: `readFailureFor` and `describeReadFailure` in
  `client/src/concept2cure/mdx/hooks/useFetchJson.ts`. The Vault (`3c84ddc6ac`) and the Data Room panel
  (`b61a8b345`) already use it.
- `errorCodeOf` in `client/src/lib/apiErrorCode.ts`, and `ApiRequestError`'s `status` and `code`.
- The picker (`RichSectionEditor.tsx`) already shows **Try again** only when it is given `onRetry`.

## The change

- `useProjectSourceCatalog` words a refused read through the classifier, and says `retryable: false`. An expired
  session says so. A failure to answer keeps the server's words, or the generic ones, and stays retryable.
- `DocumentWorkbench` passes `onRetry` only when the catalogue read can be retried.

Behaviour only; no layout.

## Evidence

- `01-red.txt`: the six new hook cases before the change. All six fail.
- `02-green.txt`: the hook suite and the picker's suite after it, including two new picker cases:
  - a refusal shows its words and no **Try again**;
  - a failure keeps **Try again**, and it calls the retry.
- All 36 suites that render `DocumentWorkbench`: 511 passed. Lint shows the same 12 warnings as trunk. The typecheck
  passes.
