# P-73 slice 2b — passage generation hold

W3 / D2 and D4. Scope: the existing passage-alternatives panel can receive a
reason that stops new drafting while the receiving writing region is unresolved.
The caller owns that reason; this panel does not resolve or establish jurisdiction.

## What already exists

- `client/src/concept2cure/v2/editor/DraftPassage.tsx` renders the passage,
  creates its three alternatives through `useAuthoringDraftReview`, compares
  arrived candidates, and proposes the chosen replacement through the editor's
  governed proposal door. It currently has only busy/sealed generation gates.
- `client/src/concept2cure/v2/editor/useAuthoringDraftReview.ts` owns scoped
  generation, turn records and retained alternatives. It is reused unchanged.
- `client/src/concept2cure/v2/editor/__tests__/workbenchDraftPassage.test.tsx`
  already exercises real workbench selection, alternative generation and tracked
  replacement. Focused component scenarios will extend this existing file.
- Searches: `rg` for `PassageAlternatives`, `Draft three alternatives for this
  passage`, generation holds and passage tests; `git log --all --diff-filter=D`
  for `client/**/*DraftPassage*` and `client/**/*passage*test*` found no deleted
  implementation to restore.

## Intended change and verification

Add optional `generationHold` text. Display it and stop the passage's draft
action, without treating the document as frozen or blocking candidate comparison,
tracked replacement, Back or Close. No hook/transport, model, server or authority
changes are part of this extension.

Red scenarios: a hold prevents a generation request and can be lifted; adding a
hold after alternatives arrive retains comparison, replacement and navigation.
Run only these focused scenarios before and after the production change.

## Verification

Command (both runs, with output redirected to the named receipt):

```sh
npx vitest run --config vitest.config.ts client/src/concept2cure/v2/editor/__tests__/workbenchDraftPassage.test.tsx -t 'passage generation hold'
```

- [Red receipt](passage-region-hold-red.txt): exit 1; two tests failed before
  production edits. The hold reason was absent and regeneration stayed enabled.
- [Green receipt](passage-region-hold-green.txt): exit 0; both focused tests
  passed (14 unrelated tests skipped). A held request makes no draft call;
  lifting the hold permits explicit drafting. A later hold keeps arrived
  candidates, comparison, tracked replacement and Back/Close available.
- `git diff --check -- client/src/concept2cure/v2/editor/DraftPassage.tsx client/src/concept2cure/v2/editor/__tests__/workbenchDraftPassage.test.tsx`
  passed.

Only the selected scenarios ran, using the existing mocked draft API. No model
calls, broad tests, typecheck, warning ratchet, commit or push were performed.

## Test fixture compatibility

P-73 slice 2b removes the standalone panel's implicit FDA default and makes the
workbench use the exact section drafting-region projection. Existing source,
acceptance, alternatives, assembly, termination and revision tests are not
unknown-region tests: their mocked candidates and expected requests already
describe FDA drafting. Before fixture edits, the agreed compatibility update is
to declare `region="FDA"` in those existing standalone mounts and to add
`draftingRegion: 'FDA', draftingRegionState: 'recorded'` to the served workbench
passage sections. This preserves each test's original subject without restoring
the production fallback or weakening assertions. Unknown-region and mismatch
coverage belongs to the new writing-agency suite owned by the parent lane.

Run the five related standalone suites once after these fixture-only changes,
and the existing workbench passage file with its exact-section projection.

```sh
npx vitest run --config vitest.config.ts client/src/concept2cure/v2/__tests__/authoringAiDraft.test.tsx client/src/concept2cure/v2/__tests__/authoringDraftAlternatives.test.tsx client/src/concept2cure/v2/__tests__/authoringAiDraftAssembly.test.tsx client/src/concept2cure/v2/__tests__/authoringDraftTermination.test.tsx client/src/concept2cure/v2/__tests__/authoringDraftRevise.test.tsx client/src/concept2cure/v2/editor/__tests__/workbenchDraftPassage.test.tsx
```

[Related fixture receipt](passage-related-fixtures-green.txt): exit 0; all six
related files and 80 tests passed in one run. Scoped `git diff --check` passed.
This follow-up changed test fixtures only; assertions, production source gates,
candidate acceptance and source-lineage behavior were preserved. No model calls,
broad suite, typecheck, warning ratchet, commit or push.

## Workbench writing-scope integration

Extend the existing passage fixture's saved section projection and existing
program GET response to exercise the actual DocumentWorkbench → AuthoringAiDraft
→ PassageAlternatives path. Verify that an exact Japanese section projection
selects PMDA even in a recorded US IND program, and that a section with no
regional projection uses the recorded EU CTA program's EMA writing agency.
Assertions inspect all three requests to the existing draft endpoint. This
adds integration coverage only; no production changes or model calls.

```sh
npx vitest run --config vitest.config.ts client/src/concept2cure/v2/editor/__tests__/workbenchDraftPassage.test.tsx -t 'workbench passes the recorded writing scope'
```

[Integration receipt](passage-writing-scope-integration-green.txt): exit 0; both
new integration scenarios passed in one filtered run (16 unrelated tests skipped).
All three real-client request payloads name PMDA for the Japanese section in a
US IND program, and EMA for the unscoped section in an EU CTA program. Scoped
`git diff --check` passed. The prior 80-test run was not repeated.
