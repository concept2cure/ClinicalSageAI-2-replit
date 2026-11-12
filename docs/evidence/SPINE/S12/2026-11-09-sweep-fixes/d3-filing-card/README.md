# Sweep fixes, group d3-filing-card (package D3): the Filing card's rows and the header's filing label

2026-11-09. Three defects verified by the biotech sweep (`cdb6d35be`, routed to D3). The changes are uncommitted in
the working tree for the session to review. Nothing was committed, pushed, stashed or reset.

## What already exists

| Path | What it does today | What it did not do |
|---|---|---|
| `client/src/concept2cure/v2/surfaces/ProjectHome.tsx` `openMarketOnSubmit` (~1705) | The Filing card's market line opens Submit. On the next frame it scrolls the market's verdict into view and focuses it with `preventScroll`. | Nothing else used the pattern. The Commitments row and the Agency letters row both only called `chooseStage('respond')` (~2332/2338). |
| `client/src/concept2cure/v2/surfaces/ProjectRespond.tsx:264-265` | The commitments section, `<section aria-labelledby="pj-commitments-h">` with `<h2 id="pj-commitments-h">`, sits below the agency's letters. | The h2 has no `tabIndex`, so `focus()` on it does nothing. |
| `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:579` | Makes a row focusable at the moment it focuses it: `setAttribute('tabindex','-1')`. | (The pattern this change reuses for the heading.) |
| `client/src/concept2cure/v2/surfaces/ProjectMarkets.tsx:285, :580` | The visually-hidden text `<span class="pj-sr">`: the market's name inside `.pj-mkt-verdict` (Submit), and ". Open it on Submit" inside the `.pj-status-open` button (the Filing card's market row). | (Unchanged.) |
| `client/src/concept2cure/v2/styles/project-home-v2.css` `.pj-sr` (~553), `.pj-status-open` (~547), `.pj-mkt-verdict` (~471), `.pj-stagebody` (~420) | `.pj-sr` is position:absolute. | None of its hosts was positioned, and neither is the page's scroller (`.page-inner.pj`, overflow:auto). The hidden text hung off the document and made the document scrollable. |
| `client/src/concept2cure/v2/surfaces/programSequence.ts` `programTypeLabel` (208-212) | Labels a program type for the header byline (via `projectWords.ts` `filingTypeWords`), the market badge (`ProjectMarkets.tsx:72`) and the records lines (`ProjectRecords.tsx:47,52`). | It printed a document class's label in lower case ("clinical study report") and an unknown key raw ("dmf"). |
| `client/src/concept2cure/v2/surfaces/Projects.tsx` `filingLabel` / `documentClassLabel` (186-205) | The project list's labeller: capitalises a class label, uses the pathway vocabulary (`@shared/constants/mdx`), and upper-cases any other key. | (The answer the header now gives.) |
| Tests: `projectHomeTeamSetup.test.tsx` (Filing card rows), `projectHomeIdentityFacts.test.tsx` (header facts), `newProjectWizardSaysWhatIsMissing.test.tsx` (`filingLabel`), `_cssRules.ts` + `j1PageLayout.test.ts` (CSS-as-text) | Existing harnesses. Each was extended. | |

Searches run: `pj-sr|pj-status-open|pj-status-item|pj-status-market`, `openMarketOnSubmit|chooseStage('respond')|programTypeLabel`, `programTypeLabel|filingTypeWords` across `client/src`, `setAttribute('tabindex'|focusHeading|scrollToSection`, `pj-stagebody`, `.pj-grid|.pj-main` in the v2 stylesheets, `project-home-v2` in the tests.

## What changed

- **(a) The market row moved the shell 48px.** In `project-home-v2.css`, `position:relative` was added to three existing rules:
  - `.pj-status-open`, the Filing card row's `.pj-sr`;
  - `.pj-mkt-verdict`, the Submit verdict's `.pj-sr`;
  - `.pj-stagebody`, every step body's visually-hidden text (`.sr-only` and `.pj-sr`).

  The task named only the first. In the running app the span that hangs off the document once Submit opens is the
  **verdict's** (ProjectMarkets.tsx:285), not the row's. The `row-only` run below keeps the verdict unpositioned and
  still moves 48px. `.pj-stagebody` was needed for (b), described next.
- **(b) The Commitments row now lands on the commitments.** In `ProjectHome.tsx`, `openMarketOnSubmit`'s body became
  `openStepAt(chooseStage, stage, selector)`, and the market line keeps using it with the same selector. The Commitments
  row calls `openStepAt(chooseStage, 'respond', '#pj-commitments-h')`: it chooses the step, then on the next frame
  makes the heading focusable when it is not (the Inconsistency.tsx pattern), scrolls it into view (`block:'start'`,
  smooth) and focuses it with `preventScroll`. The Agency letters row is unchanged: Respond opens at the letters.

  The first running-app walk of (b) landed and focused correctly, but the shell moved 48px **on Respond**. Respond's
  letters carry `.sr-only` text ("Urgency: high", `.cc-comm-l`) 151px below the fold, so the document itself was
  scrollable. Positioning `.pj-stagebody` contains that text. Before the change, Evidence's document was 499px taller
  than the window.
- **(c) The header said "dmf" and "clinical study report".** `programTypeLabel` now gives the project list's answer:
  - the application label;
  - else the class label with a capital;
  - else the pathway label when the value is a pathway;
  - else the key in capitals.

  One function serves every caller: the header byline, the market badge and the records lines. A test holds it equal
  to `filingLabel` for every application type, document class, pathway and alias key. In `ProjectHome.tsx` the
  header's dead lower-case fallback (`filingDocumentClassOf(...)?.label`) was removed. It could be reached only when
  `filingTypeWords` returned null, that is, for an empty type. Its misplaced docstring, which sat above `isUsInd`, now
  sits on `programTypeLabel`.

Files changed (all in this group):
- `client/src/concept2cure/v2/styles/project-home-v2.css`;
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`: only `openMarketOnSubmit`/`openStepAt`, the Commitments row's
  onClick and the header's `filingWords`;
- `client/src/concept2cure/v2/surfaces/programSequence.ts`;
- tests:
  - `__tests__/projectHomeFilingCardCss.test.ts` (new);
  - `__tests__/projectHomeTeamSetup.test.tsx` (new describe "the Filing card's rows land where they say");
  - `__tests__/projectHomeIdentityFacts.test.tsx`;
  - `__tests__/newProjectWizardSaysWhatIsMissing.test.tsx`.

## Red, then green

- `red.log`: the new and extended tests against the unfixed source. **6 failed**:
  - two CSS host tests: `'static'`;
  - the Commitments landing: `expected [] to include <h2 id="pj-commitments-h">`;
  - header `dmf`: `'dmf'`; header `csr`: `'clinical study report'`;
  - the labeller agreement: `'dmf'`.

  The guards passed already: header `ind_amendment`, Agency letters unchanged, the `.pj-sr` source scan. Three later
  sections show checks failing on the case each one exists for:
  - **RED (2):** the (b) tests after they moved to their own describe (to keep the file under `max-lines-per-function`),
    with HEAD's onClick put back for that run only;
  - **RED (3):** the source scan with its host list cut, which reports `surfaces/ProjectMarkets.tsx:285`;
  - **RED (4):** the step-body test with `.pj-stagebody`'s position taken out for that run only.

  Each temporary edit was restored, and `git diff` shows only the fixes.
- `tests.log`: the new tests plus **every** existing suite that reads `programTypeLabel`, `filingTypeWords`,
  `filingLabel`, ProjectHome, ProjectMarkets, ProjectRecords, ProjectRespond or `project-home-v2.css`. **67 files,
  685 tests, all passed.**
- In the running app (Vite serves the client and CSS from source, so these changes are live without a restart):
  - `walk.cjs`, the market row on C2C-101 (`6065271c-…`), at 1440×900:
    - `walk-red.json` (unfixed CSS): `scrollTop 48`, top bar at `-48`. **FAIL.**
    - `walk-row-only.json` (only `.pj-status-open` contained): still `scrollTop 48`. **FAIL.**
    - `walk-green.json`: `scrollTop 0`, top bar at `0`, Submit open, the verdict on screen and focused. **PASS.**
  - `walk-bc.cjs`:
    - `walk-bc-red.json` (before `.pj-stagebody`): the Commitments row lands and focuses, but `scrollTop 48`. **FAIL.**
    - `walk-bc.json`: Respond open, "Commitments to the agency" at y=48 and focused, `scrollTop 0`. No step (Plan,
      Evidence, Author, Review, Submit, Respond) makes the document scrollable. The headers read "DMF", "Clinical study
      report" and "IND amendment" on local projects of those types. **PASS.**
    - The same per-step scan at 390×844 also showed no document overflow on any step.
  - Screenshots are in `screenshots/`: `red.png` (top bar gone, blank strip at the foot), `green.png`,
    `bc-commitments-red.png`, `bc-commitments.png`, `bc-header-*.png`.

## Lint (`lint.log`)

`npx eslint` on each changed file, compared with `git show HEAD:<file>` under the same config:

- `ProjectHome.tsx`: 0 errors and 6 warnings, before and after. All six are pre-existing size and complexity warnings.
- Every other file: 0 errors and 0 warnings, before and after. `projectHomeFilingCardCss.test.ts` is new and has none.

The repo's eslint does not lint `.css`, so the CSS gates were run instead: `ci:check-shell-css-collisions` OK (22,
baseline 22), `ci:check-css-selector-shadowing` OK (0 new), `ci:undefined-css-classes` OK. A narrow `tsc` run
(changed files and their imports) reported no error in any changed file. The 18 errors it reported are in untouched
files, from ambient declarations that config leaves out. The full `npm run typecheck` (24 GB heap) was not run.

## Not done, and why

- **`filingLabel` in `Projects.tsx` is not yet reduced to a delegate** (`programTypeLabel(t) ?? ''`). The pathway rule
  now exists in both functions. A test holds them equal on every known key, but RULE 3's zero duplication wants one
  body. `Projects.tsx` is outside this group's files.
- **`ProjectRespond.tsx:265`'s h2 has no `tabIndex={-1}`.** The handler sets it when it focuses, as Inconsistency.tsx
  does. Putting it in the markup belongs to that file's owner.
- **One visually-hidden span still has no positioned host:** the composer's `.sr-only` in `.pj-convo` (`app-v2.css`).
  It sits near the top of the page and causes no overflow at 1440×900 or 390×844. Containing it (or positioning
  `.pj-grid` / `.page-inner.pj`, the real scroller, which would contain everything) is `app-v2.css`'s, outside this
  group.
