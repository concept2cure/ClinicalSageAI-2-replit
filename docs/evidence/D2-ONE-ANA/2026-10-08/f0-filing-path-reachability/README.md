# F0: filing-path reachability gate

Launch row **D2**. Slice F0 of `docs/design/FILING_SPINE.md` §7.2.

## What was wrong

The filing path runs Evidence → Author → Review → Submit → Respond inside one
project. On 2026-10-08, six hops on it had no control that named what it opened.
Nothing in CI said so. A hop that navigates to the right surface without the
document, sequence or section looks like a working link in every existing check.

## What changed

- `tests/ui/filing-path-reachability.test.ts` (new). One check per hop. Each check
  starts from a fixed anchor and follows the components and functions that region
  renders or calls, through the same file and relative imports, three levels deep:

  | Hop | Anchor | Green when | Fixed by |
  |---|---|---|---|
  | `review-tab-to-document` | `ProjectHome.tsx`, `stage === 'review'` | No `task-board`; `setEditorTarget({ docId })` is reached | F7 |
  | `outline-node-to-started-section` | `DocumentWorkbench.tsx`, `filing.flat.map(` | No "no draft yet" toast; `/api/authoring/sections` is posted | F4 |
  | `placed-document-to-sequence` | `AuthoringPlaceIntoFiling.tsx` (and `ProjectMarkets.tsx` once it exists) | Every `onNav('submission-center')` stashes a `sequenceId`; Submission Center reads it from `consumeNavParams` | F10 |
  | `dispatched-sequence-to-transmit` | any client file | A caller of `/api/submissions/sequences/${…}/transmit` | F12 |
  | `respond-to-response-sequence` | `ProjectHome.tsx`, `stage === 'respond'` | It stashes `followUp` for the Submission Center, and the Submission Center reads it | F15 |
  | `author-document-row-to-document` | `ProjectHome.tsx`, `stage === 'author'` | No list row's `onClick` is only `onNav('document-authoring')`; `setEditorTarget({ docId })` is reached | F3 |

- `tests/ui/filing-path-reachability.baseline.json` (new). It lists the six hops
  that are red today, each with its slice and a reason. It can only shrink:
  1. A hop that is not in the baseline must be green.
  2. A hop that is in the baseline must still be red. When a slice turns a hop
     green, the test fails until that slice removes the hop's entry.
  3. Only the original six hops may appear in it, so a new hop must be green
     when it is added.
- Each check also runs against two fixtures that are part of the test:
  - the dead end as it was on 2026-10-08, which must be red;
  - the shape the slice is specified to build, which must be green.

  This shows that every check can fail on the case it guards, and that every
  check can pass.

This gate checks only that each control exists and names its object. Each
slice's own test checks how the control behaves: the right request, refusals
shown verbatim, and failed reads never shown as empty.

## Runs

All runs used `npx vitest run --config vitest.config.ts tests/ui/filing-path-reachability.test.ts`
at `b0b1694a` plus this change.

| File | Setup | Result |
|---|---|---|
| `red/vitest-empty-baseline.txt` | Empty baseline | 6 failed, 14 passed. Every hop is red, and each failure gives its reason (for example, "the Review tab sends the person to the task-board alias"). All 12 fixture checks pass. |
| `red/vitest-hop-green-but-baselined.txt` | `ProjectHome.tsx`'s Review button rewritten to `setEditorTarget({ docId })`, then reverted | 1 failed: "review-tab-to-document is reachable now … Remove it from … baseline.json in the same change (F7)". This is the ratchet. |
| `red/vitest-unknown-baseline-entry.txt` | A baseline entry `evidence-to-vault` added, then removed | 1 failed: "was not red when F0 landed; a new hop must be green when it is added". |
| `green/vitest.txt` | Baseline as committed | 20 passed. |

The test file also typechecks clean under `tsc --strict`.

## What it does not prove

- The checks read source. They do not render anything. A control can exist and
  still be broken at runtime, which is what each slice's own rendering test is
  for.
- Locating regions depends on indentation. A stage branch is read as its line
  plus the more-indented lines under it, which holds for formatted source. If a
  slice restructures the stage switch so that an anchor no longer matches, the
  hop reads red with "renders no … stage". That is a false red, never a false
  green, and the slice updates the anchor.
