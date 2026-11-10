# The editor regression `84b415e24` unmasked was in the tests, and the tests were already fixed

Task #33 (L2). Commit `84b415e24` (2026-10-19, "Repair 39 client suites crashing on a stale authService mock")
let five editor suites run again, and they then failed on a different error. The D6 README
(`docs/evidence/D6/2026-10-19-stale-authservice-mocks/README.md`, "What the crash was hiding") recorded the failure
as a possible editor regression: a second `Save` button on a governed save, and a missing section-check panel.

**Verdict: no editor regression. Both errors came from one control, "Check saved sources", which the tests'
unanchored queries matched by accident. The tests were corrected on 2026-10-20. At HEAD all five suites pass
(34/34). This change modifies no source file and no test file.**

## What already exists

These pieces are cited by path. Line numbers are at HEAD `1d789b516`.

| Piece | Where | What it does today |
|---|---|---|
| The section Save button | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:4507` (group `aria-label="Save and sign"`), `:4559` (`data-testid="save-section"`) | The only Save button. It reads "Save" or "Saved". |
| The section "Check" button | `DocumentWorkbench.tsx:5134-5141` | Runs the mechanical section scan (`POST /api/authoring/sections/:id/ai/deficiency-scan`). It renders only after the sections load. |
| The section-check panel | `DocumentWorkbench.tsx:5179-5184` (`data-testid="section-check"`) | Appears when `check && check.section_id === activeSection.id`. `git log -S'section-check'` shows its last change was `0365b4eae` (2026-10-12), before any of this. |
| "Check saved sources" | `editor/SavedAssemblySourcesNotice.tsx:16`, rendered by `editor/AuthoringAssemblyBuild.tsx:93` inside the `<details>` at `:84` | A read-only check of the saved assembly sources. It is specified in `docs/design/SAVED_ASSEMBLY_SOURCES_2026-10-18.md:10,15` ("Add **Check saved sources** … inside the existing build controls"). The `<details>` is closed by default, so users don't see the button until they open it. jsdom does not hide content inside a closed `<details>`, so the tests do see it. |
| "Re-file saved text" | `editor/AuthoringRefileSavedText.tsx:89` (rendered by `RefileControls`) | The deliberate re-file of an unchanged saved section, added by `848fa68e3` (2026-10-23). Its own suite, `editor/__tests__/authoringRefileSavedText.test.tsx`, passes 26/26 (`neighbours/`). |
| The five suites | `client/src/concept2cure/v2/__tests__/{authoringReasonForChange,authoringSaveFilingCommit,authoringSectionCheckRecord,documentAuthoringAuditRail,documentAuthoringEditor}.test.tsx` | They pass at HEAD with exact queries. Save is found as `within(group 'Save and sign').getByRole('button', /^Save(?:d)?$/i)`. Check is found as `/^Check$/`. |
| Earlier test corrections | `c24db62ac` (2026-10-20, "Align retained authoring fixture controls with exact Save and Check actions"); `67d96c060` (2026-10-20) | `c24db62ac` anchored the queries to `/^Save$/i` and `/^Check$/i`. `67d96c060` limited Save to the "Save and sign" group with `/^Save(?:d)?$/i`, and made Check case-sensitive. |
| The planned move | `.design/claude-convergence/D4.md:360-379` (D4-2) | D4-2 removes the "Save and sign" group. Save moves into `.ed-bar-acts`, keeping `data-testid="save-section"` (`:362`). The reason field gets its own group, "Reason for change" (`:376`). |

Searches run: `git log -S'Check saved sources'` (only `3cae08d23`), `git log -S'Re-file saved text'` (only `848fa68e3`),
`git log -S'section-check' -- editor/DocumentWorkbench.tsx`, `git log -S'blocks late reuse after the draft pane opens'`,
`grep -rn "Save and sign" client/src tests`, and `grep -n "D4.L\|Save and sign" .design/claude-convergence/D4.md`.

## The cause

Both families of failures come from one button: "Check saved sources".

- **"Found multiple elements with role button and name `/Save/i`."** The pattern `/Save/i` matched the real Save
  button. It also matched "Check saved sources", because that name contains "saved". It was not a second Save. At HEAD
  `/Save/i` matches three buttons; the third is "Re-file saved text" (`probe/a15adc805-buttons.txt`).
- **"Unable to find `[data-testid="section-check"]`" and "expected scan to be called".** Right after render, the only
  button matching `/check/i` is the disabled "Check saved sources". The section "Check" button appears only after the
  sections load. So `findByRole(/check/i)` returned the disabled button, the click did nothing, the scan never ran,
  and the panel never rendered (`probe/*-check-query-resolves-to.txt`). The panel itself is intact.

## The introducing commits

- **The collision:** `3cae08d23` (2026-10-18 00:44, "Reuse saved document assembly source references") added
  "Check saved sources" on purpose, as specified in its design note. It is the only result of
  `git log -S'Check saved sources'`.
- **The crash that hid it:** `ad372567d` (2026-10-17 23:13, "Build documents and sections inside the existing
  editor") added `const actor = (): string => { const user = authService.getUser(); … }` to
  `editor/useAuthoringAssemblyBuild.ts`. `git show ad372567d -- editor/useAuthoringAssemblyBuild.ts` shows that line
  being added. `3cae08d23` adds `getUser` only to a test mock. At `6d919391e`, the parent of `3cae08d23`, all five
  suites already crash at `useAuthoringAssemblyBuild.ts:23` (`red/6d919391e-*.txt`). So the collision was hidden from
  the moment it landed.
- **A correction to the D6 README:** at line 17 it credits the `actor()` line to `3cae08d23`. The line came from
  `ad372567d`. That file is outside this task's allowed paths, so the correction is filed here and not edited there.

## The verdict

1. **Exactly one Save button exists,** at `84b415e24` and at HEAD. The other `/Save/i` matches are separate,
   specified controls whose names contain "saved".
2. **The section-check panel was not deleted, renamed or moved.** At HEAD, the exact "Check" query opens it, and its
   content assertions pass.
3. **The colliding control is specified** in `docs/design/SAVED_ASSEMBLY_SOURCES_2026-10-18.md`.
4. **This is not an early D4-2 or D4-3 move.** The "Save and sign" group and `AuthoringFilingBar` are still at
   `DocumentWorkbench.tsx:4507`.

So the tests were wrong, not the code.

## The fix

**None at HEAD. The minimal fix at the cause is already in place.** The cause was the tests' unanchored patterns,
and `c24db62ac` and `67d96c060` corrected them. The rules for this task allowed only two kinds of change: fixing code
that is wrong, or updating a test that an intended change made wrong. Neither applies at HEAD:

- No code is wrong.
- No test is wrong.

Nothing was weakened. The exact queries are what keep these suites green; the next section shows they fail when
loosened.

**Not done here; handed to D4-2.** D4-2 removes the "Save and sign" group. Four queries still look it up:
- `authoringReasonForChange.test.tsx:130`
- `authoringSaveFilingCommit.test.tsx:150`
- `documentAuthoringEditor.test.tsx:166`
- `documentAuthoringEditor.test.tsx:219`

The D4.L table (`D4.md:1430`, "Tests that pin names D4 moves") does not list these three files. The commit that
removes the group should do two things:
- Switch those four lookups to `screen.getByTestId('save-section')`. That testid has one match at HEAD, and D4-2 keeps
  it (`D4.md:362`).
- Add the three files to D4.L.

That change is not made here, for two reasons. The test would describe a change that has not happened. And the
group-scoped query is the more precise check while the group exists.

## Red

- **At `84b415e24`** (rebuilt with `git archive` in a scratch folder; no checkout or worktree). Files: `red/84b415e24-*.txt`.

  | Suite | Failed | Error |
  |---|---|---|
  | `authoringReasonForChange` | 6 of 7 | multiple buttons named `/Save/i` |
  | `authoringSaveFilingCommit` | 4 of 4 | same |
  | `documentAuthoringEditor` | 2 of 12 | same |
  | `authoringSectionCheckRecord` | 5 of 5 | no `[data-testid="section-check"]` |
  | `documentAuthoringAuditRail` | 2 of 5 | "expected scan to be called", then no `section-check` |

- **At `6d919391e`:** every test in all five suites crashes at `useAuthoringAssemblyBuild.ts:23` (`red/6d919391e-*.txt`).
- **At HEAD `1d789b516`, with the queries loosened (the check made to fail).** This is in `red/head-loose-queries/`.
  - `loosen.py` puts the pre-`c24db62ac` forms back into copies of the five suites: `/Save/i` and `/check/i`.
    `loose-queries.diff` shows the exact edits: 4 Save lookups and 3 Check lookups, plus import paths made absolute.
  - The copies run from a scratch folder against the live source, with `vitest.loose.config.ts`.
  - **Result: 19 of 34 fail, with the same signatures as at `84b415e24`.** Twelve fail on multiple `/Save/i` matches,
    six on the missing `section-check`, and one on "expected scan to be called". By suite: 6, 4 (of 5, since the fifth
    test uses `getByTestId('save-section')`), 5, 2 and 2.
  - **Control:** the same copies with only the import paths rewritten pass 34/34
    (`1d789b516-control-exact-queries-five-together.txt`). So the failures come from the queries, not from the harness.

## Green

Commands: `npx vitest run --config vitest.config.ts --maxWorkers=1 <files>`

- `green/b854c54c2-<suite>.txt`: each suite run alone. 7 + 5 + 5 + 5 + 12 = **34 passed**.
- `green/f23853723-five-together.txt` and `green/1d789b516-five-together.txt`: all five together, **34/34** both times.
- `head/f5c46642a-*.txt` and `head/a15adc805-five-together.txt`: the diagnosis's earlier runs, also 34/34.
- `green/no-editor-change-a15adc805..1d789b516.txt`: HEAD moved during the runs, from other sessions' commits. This file
  shows that no editor source, editor test, `Authoring*.tsx`, `DocumentAuthoring.tsx` or any of the five suites changed
  in that range. It also shows that none of them has uncommitted changes. So every run above tested the same editor code.

This change modified no file, so no other test imports a changed file.

## Neighbours, and one separate failure that is not part of this task

`neighbours/` holds the suites for the colliding controls.

| Suite | Result |
|---|---|
| `editor/__tests__/savedAssemblySources.test.tsx` | passes |
| `authoringDraftTermination.test.tsx` (also corrected by `c24db62ac`) | passes |
| `editor/__tests__/authoringRefileSavedText.test.tsx` | passes, 26/26 |
| `editor/__tests__/savedAssemblySourcesFlow.test.tsx` | **fails 1 of 15 at HEAD**, every run |

The failing test is "blocks late reuse after the draft pane opens, then permits a fresh explicit check after closing
it", at `savedAssemblySourcesFlow.test.tsx:281`. The error is "Unable to find `[data-testid="ai-draft-body"]`". The
same test passes at `84b415e24` (12/12, `neighbours/84b415e24-savedAssemblySourcesFlow.txt`).

It is a separate regression in the AnA draft pane, introduced after 2026-10-19. It is not one of the five suites and
has a different signature. It is reported here and not fixed, because it is outside this task. Recent changes to that
area include:
- `surfaces/AuthoringAiDraft.tsx`: `8013c9457`, `0f4bc4f2c`, `7b4a16cf8`, `424ca42d8`;
- the test file: `b513b53e4`.

## Files in this folder

- `README.md`: this file.
- `red/84b415e24-*.txt`, `red/6d919391e-*.txt`: the red runs at the two older commits.
- `red/head-loose-queries/`: the loosened-query red run at HEAD and its control, with `loosen.py`,
  `vitest.loose.config.ts` and `loose-queries.diff`.
- `head/`: the diagnosis's runs at HEAD.
- `green/`: this task's runs at HEAD.
- `probe/`: every button whose name matches `/Save/i` or `/check/i`, with the component that renders it, at
  `84b415e24` and `a15adc805`. Also what `findByRole(/check/i)` resolves to, and the probe test itself.
- `neighbours/`: the suites for the colliding controls, including the one separate failure.
