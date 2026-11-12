# F1: four sweep and lane findings in the editor, the shell and D0, and one trunk red (2026-11-12)

Five small repairs in one push (`COORDINATION.md` rule 6: one push per slice). Each was red first.

| # | Finding | From |
|---|---|---|
| 1 | Search cannot find a project by its code when eight newer projects contain it | S12's biotech sweep, finding 84 (blocker) |
| 2 | Place into filing refuses every document made from an IND template | S12's sweep, finding 22 (major) |
| 3 | The editor's citation catalogue shows an error when a save lands inside its read | The Quality lane, `COORDINATION.md` 2026-11-12 |
| 4 | D0's "one table-scroll rule" guard is red on CMC's register rule | The trunk-CI lane, 2026-11-10; S12's sweep, finding 51 |
| 5 | `csr-jobs-narratives.pglite.test.ts` does not load | Filing types, 2026-11-12 |

## What already exists (RULE 3)

- **`client/src/concept2cure/v2/paletteProjects.ts` `paletteProjectResults`.** Filters the palette's projects by title
  or code, in the list's order (newest-updated first), and cuts at 8. `Shell.tsx` `projectItems` lists them under
  "Projects". The palette already has a `note` item kind.
- **`client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling.tsx`.** `documentFilingCode` is the deepest CTD
  code all of a document's sections share. `ownSectionRefusal` refuses a code that is one of the document's
  sections. Both read codes with `normalizeCtdCode`. An IND template's working headings are stored as
  `<node>:work:<n>` (`server/services/authoring/ind-template-outlines-m1.ts`: "Working preparation heading, not an
  additional CTD node"). `sectionNumberLabel` already shows such a heading as its node (rB-F13, 2026-11-12).
- **`client/src/concept2cure/v2/editor/useProjectSourceCatalog.ts`.** The editor's paged read of the project's
  sources for citation numbering. A failed page is an error state with Try again.
  `server/services/clinical-regulatory-evidence/source-read-access.ts` `requireSourceReadScopeStillCurrent` answers
  503 `SOURCE_READ_ACCESS_CHANGED` when source access changed while the read ran.
- **`styles/app-v2.css`.** D0's one rule: at 640 px and below a `.reg-tbl` scrolls inside its card or section.
  `styles/journey-v2.css` carried CMC's own copy for every width. `__tests__/d0PhoneWidth.test.ts` refuses a second
  copy outside `app-v2.css`.
- **`server/routes/__tests__/csr-jobs-narratives.pglite.test.ts`.** Replaced the whole `csr-builder` module with one
  function.

Nothing new is added: no route, table, screen or tool.

## The changes

1. **Search.** A project whose code or title is exactly the search comes first, then one whose code or title starts
   with it, then the rest, each group in the list's order. `paletteProjectResults` returns `{ hits, more }`, and the
   palette adds "N more projects match. Keep typing to narrow." when it cut the list. The stray doc comment my
   `59dc4f9f58` left above `shellProjectOfPalette` is back on `openPaletteProject`.
2. **Place into filing.** `filingNodeOf` reads a working heading as the node it prepares. `documentFilingCode` and
   `ownSectionRefusal` use it, and the dialog's fallback offers the open heading's node, never its key.
3. **The citation catalogue.** A page refused with 503 `SOURCE_READ_ACCESS_CHANGED` is read once more before
   anything is said. A second refusal is shown, with Try again. No other refusal is retried.
4. **D0's guard.** CMC's rule moves, unchanged, into `app-v2.css` beside D0's, as the one named exception at every
   width. The guard now requires exactly those two rules there and still refuses any copy in another sheet. D0's
   rule is not widened to every work area: `display: block` changes how a table that fits fills its card.
5. **The CSR suite.** The mock keeps the real module and replaces only `launchCSRBuildAsync`.

## Red, then green

- **Red at HEAD** (`red-at-head.txt`), 7 cases: 4 for Place into filing ("expected '1.20:work:1' to be '1.20'",
  "expected '1.20 is one section of this document.…' to be null"), 1 for search, 2 for the catalogue.
- **Red** (`red-d0-guard.txt`): the guard's two cases, before the rule moved.
- **The CSR suite at HEAD:** "No "flattenICHE3Sections" export is defined on the … mock". After: 18 of 18.
- **Green.** Every client suite that touches the palette, Place into filing, the source catalogue or these two
  stylesheets: 105 files, 1,377 of 1,377. `ci:check-css-selector-shadowing`, `ci:undefined-css-classes` and
  `ci:surface-text-ramp` pass.
- **Lint.** ESLint warnings per file equal trunk's (`Shell.tsx` 5 and 5, `AuthoringPlaceIntoFiling.tsx` 2 and 2,
  its test 1 and 1, the others 0).

## In the running app

`batch2.cjs`, trunk `8e341b99d3` plus this tree, 1440 px. "Before" ran the same stack with trunk's copies of the six
client files.

| | Before (`batch2-before.json`) | After (`batch2-after.json`) |
|---|---|---|
| **Place into filing** on LMN-201's "1.20 · Introductory Statement…" (sections `1.20`, `1.20:work:1` … `:9`), opened on `1.20:work:1` | Section code prefilled `1.20:work:1`, and "is not a CTD section code" (`before-place-into-filing.png`) | Prefilled `1.20`: "Files the whole saved document (10 sections) as one leaf, at the document's own code 1.20", "Files as 1.20 in the regional Module 1 folder (1-20/)" (`after-place-into-filing.png`) |
| **The source catalogue**, with the first reply to each of the editor's two readers of that page forced to 503 `SOURCE_READ_ACCESS_CHANGED` | 2 requests: neither reader reads again | 3 requests: the catalogue read again, once |
| **CMC / Module 3** on C2C-101 | The register is `display: block; overflow-x: auto`; the page does not scroll sideways | The same, now from `app-v2.css` (`after-cmc-register.png`) |
| **Search** | "lmn" lists the four Lumen projects; "BX-401" lists BX-401 | The same |

**What the running app does not show.** This database has seven projects, so no search is cut at eight and the new
ordering has nothing to reorder. The sweep's case (nine newer projects whose codes contain "C2C-101", then C2C-101)
is the unit test, on the palette as rendered.

**Seen, not changed here:**
- **The Data room panel reads the same sources page through `useLiveData` and has no such retry.** In the "after" run
  it is the reader whose forced refusal stood. `useLiveData` is D0's shared read (`dataConnect.tsx`); a retry there
  reaches every screen, so it is taken as its own change.
- **A save inside the read can also answer 409** (`NATIVE_SOURCE_CHANGED`, seen once on 2026-11-12 while a new SOP's
  first save landed). The data room lane has the Quality evidence reader; the code is not retried here.
- **The palette reads one page of 200 projects** and never reads whether there are more. An organisation with more
  than 200 is cut without a word. Sweep finding 84 names it; it needs the list route's `hasMore`.
