# Draft pane regression: `ai-draft-body` never appears in two workbench suites

Row: D4 (the one editor). Lane: L2 (editor). Date: 2026-11-01. Tree: `concept2cure-v2` at
`dd5a97689` and `72383e342` (the second only changed `.design/claude-convergence/COORDINATION.md`).
Checked independently at `b3c9e4421` and committed after that check (see "Independent check").

## Verdict

**The test was wrong. The code is right.** No capability was lost. 8013c9457 deliberately stopped the draft pane
from assuming FDA. It also made the pane hold drafting when a section read carries no writing-agency projection.
That commit updated one workbench suite's section fixture (`sourceFirstAssemblyFlow.test.tsx`) to the new read shape
and missed two others. Both of them are fixed here, in the tests only.

| Suite | At HEAD | After |
|---|---|---|
| `client/src/concept2cure/v2/editor/__tests__/savedAssemblySourcesFlow.test.tsx` (the reported case, line 281) | 14/15 | 15/15 |
| `client/src/concept2cure/v2/editor/__tests__/workbenchDraftParagraphs.test.tsx` (sibling, same cause, found while running related suites) | 0/4 | 4/4 |

## What already exists

- **`client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx`** is the draft pane, the one review-and-accept surface for
  `POST /api/authoring/sections/:id/ai/draft`. The `ai-draft-body` textarea (line 527) renders only inside
  `{draft && grounding && …}` (line 493). Draft section (line 470), Draft three alternatives (line 481) and
  regenerate (line 598) are disabled while `generationHold` is set. `generate()` (line 321) also refuses under a hold.
- **`client/src/concept2cure/v2/editor/writingAgencyPresentation.ts`** (added by 8013c9457) turns the
  recorded filing into the Region default, the hold and the region note. `referenceHold` (line 22) returns *"The saved
  section or application could not be read. Re-read this section before drafting."* when the read errored
  **or when `draftingRegionState` is absent** (line 29). With no recorded agency, the default region is `''` (line 64).
  The hold then reads *"Choose a supported writing region before drafting. No receiving agency is assumed."*
  (line 37).
- **`client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`** passes the pane
  `recordedFiling = { registryId, draftingRegion, draftingRegionState, state }` (line 5424). The projection is
  taken from the active section's row in the sections read. The workbench passes no `region`.
- **`client/src/concept2cure/v2/editor/assemblyDraftQueue.ts`** (AnA drafting after a build) uses the
  same projection. It falls back to the plan's region only when `draftingRegionState` is absent (line 50).
  Otherwise a section that is not `recorded` fails with *"The saved section does not establish a drafting region."*
  (line 53).
- **Server: `server/services/authoring/authoring-document-read.ts`** attaches
  `projectSectionDraftingRegions` (from `server/services/authoring/authoring-draft-region-projection.ts`) to **every**
  section of the sections read (lines 162–166). The value is `recorded`, `not-recorded`, `global` or `unavailable`, with
  `unavailable` as the fallback. The current server never sends a section row without `draftingRegionState`.
- **The unit contract** is in `client/src/concept2cure/v2/__tests__/authoringWritingAgency.test.tsx`.
  *"requires an explicit supported choice when no receiving agency is recorded"* expects a blank Region, a
  disabled Draft section, no request, and a draft once the person chooses a region.
- **Searches run:** `ai-draft-body`, `ai-draft-generate`, `ai-draft-alternatives`, `Draft three alternatives`,
  `Draft section`, `Draft empty eligible sections with AnA` and `passage-alternatives` across `client/src/**/*.test.ts(x)`.
  The run found 12 suites that click a drafting door. 6 of them mount the workbench. All 12 were run (below). `git log 84b415e24..HEAD` was run on
  `AuthoringAiDraft.tsx` and on the test file. No deleted pane or second implementation is involved. No code path is
  added, moved or removed.

## Cause

1. **Missing element:** `[data-testid="ai-draft-body"]`. No draft ever arrived because the test's click on Draft
   section hit a disabled button.
2. **Why it is disabled:** the pane showed *"The saved section or application could not be read. Re-read this
   section before drafting."* (`red/draft-pane-dom-at-failure.txt`). The program read in the fixture is
   `ready` with no registry id. So the hold came only from the test's sections fixture
   `{ success: true, sections: storedSections }`, whose rows have no `draftingRegionState`. Since 8013c9457 the client
   treats a missing projection as an unread section and fails closed, as RULE "fail closed" requires.
3. **Commit:** `8013c94575d96aaf7fb4cf0f2805bc8bd20bdc8a`, *"Use recorded project context and bounded evidence in core
   drafting"* (2026-10-30). Bisected on `git archive` trees in the scratchpad, sharing the repo's `node_modules`
   (`bisect/`):
   - `84b415e24`: 12/12 pass. The file had 12 cases then.
   - `162f2845e` (parent of 8013c9457): 15/15 pass. The other named candidates, 424ca42d8, 7b4a16cf8, 0f4bc4f2c
     and b513b53e4, are all ancestors of this green tree, so they are cleared.
   - `8013c9457`: 14/15, the same `ai-draft-body` error. It is the only commit in `162f2845e..8013c9457`.
   - `workbenchDraftParagraphs.test.tsx` has the same boundary: 4/4 at `162f2845e`, 0/4 at `8013c9457`.
4. **Intended, by its own record:**
   - `docs/design/TRIAL_APPLICATION_DRAFTING_2026-10-30.md` §"Audit implementation increment (2026-10-30)" (line 176).
     It says: *"The section read projects its effective saved template's agency … GLOBAL/unknown scope has no FDA
     default."*
   - `docs/evidence/D4/2026-10-30-ind-development/region-ui.md` (line 40) says: *"No recorded or declared supported
     agency means a blank selection and an explicit choice before drafting, rather than an automatic FDA default."*
     It also says *"An unavailable or identity-only reference never falls back to a parent or program agency."*
   - The same commit changed `sourceFirstAssemblyFlow.test.tsx` (line 82) to send the projection. It did not change
     these two suites, which also read sections through the workbench.

## Fix (tests only, no assertion removed or loosened)

`fix.diff` holds the exact change.

- **`savedAssemblySourcesFlow.test.tsx`**: the sections read now sends the server's projection per section.
  - The pre-existing section is `not-recorded`, because this document has no saved template.
  - The section the build appends is `recorded`/FDA, matching the template region the fixture's own `plan().draftRegion`
    states. This is the same modelling as `sourceFirstAssemblyFlow.test.tsx`.
  - The line-281 case now asserts the intended hold before drafting: a blank Region, a disabled Draft section, and
    the "Choose a supported writing region before drafting." note. It then chooses FDA explicitly and drafts.
  - Every original assertion after that point is unchanged: the retained manual edits, no adoption, no commit or
    accept, and the fresh check after Close.
- **`workbenchDraftParagraphs.test.tsx`**: the sections read sends `not-recorded`, because the report has no saved
  template. `openAlternatives` now asserts the blank Region and disabled Draft three alternatives, then chooses FDA
  explicitly. All other assertions are unchanged.

**Why per section, not one value for all:** the first draft of the fix sent `not-recorded` for every section. That
turned the AnA=true build case red, because the queue then refused the appended section with "does not establish
a drafting region" (`fails-on-purpose/anA-true-vs-blanket-not-recorded-fixture.txt`). A section built from a template
that records FDA is projected `recorded` by the server, so the fixture now says so.

## Red

- `red/savedAssemblySourcesFlow-HEAD-dd5a97689.txt`: 1 failed, 14 passed. *"Unable to find an element by:
  [data-testid="ai-draft-body"]"* at line 281.
- `red/draft-pane-dom-at-failure.txt`: the pane's DOM at the failure, showing the region-note hold.
- `red/workbenchDraftParagraphs-HEAD.txt`: 4 failed. *"Unable to find role="radiogroup" and name /alternatives/i"*.
  `red/workbenchDraftParagraphs-pane-hold-excerpt.txt` shows the same hold.

## The new assertions fail on the case they exist to catch

In a scratch `git archive HEAD` tree, `writingAgencyPresentation.ts` was mutated to the pre-8013c9457 behaviour, so a
section with nothing recorded defaults to FDA:

- `fails-on-purpose/new-assertion-vs-fda-default-mutant.txt`: the line-281 case fails with `expected 'FDA' to be ''`
  (line 289).
- `fails-on-purpose/workbenchDraftParagraphs-vs-fda-default-mutant.txt`: all 4 fail with `expected 'FDA' to be ''`
  (line 77).

## Green

- `green/savedAssemblySourcesFlow-fixed.txt`: 15/15.
- `green/workbenchDraftParagraphs-fixed.txt`: 4/4.
- `green/related-drafting-suites.txt`: 16 files, 236/236. This covers every suite that clicks a drafting door, plus
  the region adapters. The files are:
  - `savedAssemblySourcesFlow`, `workbenchDraftParagraphs`, `workbenchDraftPassage`, `workbenchDocumentAccess`
  - `sourceFirstAssemblyFlow`, `projectFilesAssemblyFlow`, `authoringUnsavedWork`, `authoringWritingAgency`
  - `authoringDraftInputs`, `authoringAiDraft`, `authoringAiDraftAssembly`, `authoringDraftAlternatives`
  - `authoringDraftRevise`, `authoringDraftTermination`, `assemblyDraftRegion`, `assemblyWritingRegion`

  Nothing imports the two changed files, which are tests. No product file changed.

## Gates (`gates/`)

- D0 guards (`foundations*.test.ts`): 3 files, 53/53.
- `npm run --silent ci:undefined-css-classes`: OK.
- `npm run --silent ci:canvas-path`: OK.
- ESLint on both changed files: exit 0 with 0 problems, both at HEAD (`git show HEAD:<file> | eslint --stdin`) and after.
- Targeted `tsc` over the two changed tests: 0 errors in them. Its 4 errors are in untouched files
  (`*.module.css` and `import.meta.env` declarations a standalone config does not load).

## Independent check (`skeptic/`)

A second session re-ran every claim at `b3c9e4421`. Nothing changed in `editor/**`, `surfaces/Authoring*` or
`shared/authoring` after `dd5a97689`. It did not reuse the receipts above.

- **Red:** `skeptic/red-HEAD-both-suites.txt`. Both suites as committed (`git show HEAD:<file>`), copied beside the
  originals and run: 5 failed, 14 passed. The failures are the line-281 case (`ai-draft-body`) and all 4 paragraph cases
  (`radiogroup`).
- **Verdict:** `server/services/authoring/authoring-document-read.ts:162-166` gives every section a projection, and
  `unavailable` is the fallback. `authoring-draft-region-projection.ts` returns `not-recorded` for a section with no
  template source. `writingAgencyPresentation.ts:29` holds a section that has no projection. The design records and
  `authoringWritingAgency.test.tsx` match the README's citations.
- **No assertion weakened:** in both files, every original line after the drafting click is unchanged. Only
  assertions were added.
- **No capability lost:** no product file differs from HEAD. `AuthoringAiDraft.tsx` (the pane, Draft section, Draft
  three alternatives) and the saved-sources reuse block are exercised by the 236 tests.
- **Fails on purpose:** `skeptic/fails-on-purpose-fda-default.txt`. The check uses a `vi.mock` wrapper, not a scratch
  tree. It makes an unrecorded section default to FDA. The same 5 cases then fail with `expected 'FDA' to be ''`.
- **Green:** `skeptic/green-16-suites.txt`, 16 files, 236/236.
- **Gates:**
  - D0 guards: 53/53 (`skeptic/d0-guards-shared-tree.txt`). An earlier run failed only on the Vault lane's
    uncommitted `sp-eyebrow` baseline. HEAD's guard file passed 33/33 against the same tree
    (`skeptic/d0-ratchet-HEAD-guard-file.txt`).
  - `ci:undefined-css-classes`: OK. An earlier run failed only on `vd-*` classes in `Vault*.tsx`.
  - `ci:canvas-path`: OK.
  - ESLint: exit 0 on both files, at HEAD and after.

## Not done

- No running-app check. No product code changed, so no screen behaviour is claimed. Running the pane in the app
  would show the hold that 8013c9457 already shipped.
