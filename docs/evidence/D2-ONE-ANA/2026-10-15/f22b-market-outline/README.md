# F22b — a market's own part of the filing, server side (2026-10-15)

Row: D2 (one AnA, one canvas; the filing outline the canvas navigates by).
Work order: docs/design/FILING_SPINE.md F22, part b.

A market added to a project (F22a) is a governed document holding that
market's Module 1 and 3.2.R. This slice makes every server path treat it as
that, by one shared rule (`shared/regulatory/filing-scope.ts`
`isRegionalSectionKey`, which the F22a scaffold now also uses):

| Path | Before | Now |
|---|---|---|
| `GET /api/c2c/documents/:id/outline` | the market pack's whole outline | the market's Module 1 and 3.2.R, plus `gaps`: the pack's mandatory common sections the home filing lacks (computed, never inserted) |
| commit to the filing (`commitSectionToFiling`) | a common code read "no such section", and `M3` (the container kept above 3.2.R) took the text | refused by name before any write |
| `POST /api/authoring/docs` with `c2c_document_id` | ignored | binds the new document to that market document; anything else named is 409 `MARKET_DOCUMENT_NOT_BOUND`, nothing created |
| `POST /api/authoring/sections` in a market copy | created any code | a common code is 409 `WRONG_FILING_SCOPE`, nothing created |

Scope is read through `to_jsonb(d)->>'filing_scope'`, so a database the
20261015e column has not reached reads every document as the home filing and
no statement fails inside the caller's transaction.

## Red, then green

- `red/outline-as-whole-pack.txt`: the outline test with the market branch
  turned off (the pre-F22b behaviour). 2 of 4 fail: scope reads `home`, the gap
  `2.1` is not named.
- `red/commit-without-scope-refusal.txt`: the commit test on the pre-change
  file. `M3` and `2.5` are not refused (2 of 5 fail).
- `red/market-binding-without-scope.txt`: the HTTP test on the pre-change
  binding and create files. 6 of 6 fail.
- `green/*.txt`: the same tests, plus the existing commit, binding, placement
  and program-scope suites they touch.

Typecheck clean; `ci:eslint-ratchet:since HEAD` no change; `ci:launch-scope`,
`ci:launch-scope-api`, `ci:canvas-path`, `ci:internals-in-copy`,
`ci:action-overclaim` pass. HawkScan not run: HAWK_API_KEY is not set here.

The editor side (the market's group in the outline, starting its sections in
its own copy) is the next slice.

## Security review of the server slice (same day)

A read-only security lens on 77ac97d85 found nothing high or medium. Two low items, applied:

- A market's copy could be seeded from an org template, whose sections are of any code. It is now refused: 400 `MARKET_DOCUMENT_TEMPLATE`, nothing created. The test failed first while the check sat after the template lookup, which refuses an unknown template; the check now runs before anything is read.
- The home binding chose the filing by agency alone. It now also reads the scope, `COALESCE(filing_scope, 'home') = 'home'`.

Left as is, with the reason:
- Two creates racing on one market document: `recordAliasesTx` demotes the loser to unbound with its stated reason. This is the home path's existing behaviour.
- A malformed id gets the store-unreachable reason. Nothing is written either way.

The `ci:sql-interpolation` baseline moves 2 counts from `server/routes/c2c/documents.ts` (6 → 4) to `server/services/c2c/document-outline.ts` (2). These are the same two fixed fragments (`rulePackProvenanceSelectSql('rp')` and `sectionHasContentSql('content')`), moved with the outline read. No value is interpolated.

## The editor (client slice)

`useFilingOutline(projectId, boundDocumentId)` reads the home filing (`scope=home`) and the markets (`scope=market`). When the open document is a market's editing copy, the outline is that market's own sections and `gaps`. `editor/FilingMarkets.tsx` adds three things to the outline pane:
- the project's filings, each with Open, "Shown in the outline", or "Create editing copy" (`POST /api/authoring/docs` with `c2c_document_id`, then opened);
- the gap note;
- a failed market read, said as such, with the home outline left in place.

- `red/editor-outline-home-only.txt`: `filingOutlinePerMarket.test.tsx` on the pre-change workbench and hook. 3 of 3 fail.
- `green/editor-outline.txt`: the same test with the outline, start-section and provenance suites and every editor test (52 files, 541 tests).

An accessibility lens (read-only) reviewed the pane before commit. Applied:
- each action's name is its visible text, with the filing as its description (2.5.3);
- busy is `aria-disabled`, so focus stays;
- state text uses the body-size class (the 10px label measures 4.43:1);
- the failed read is `role="status"`;
- the gap list is named by its sentence.

Not done: moving focus after the copy opens. The toast announces the create, and the workbench's document open owns focus.

Gates: typecheck clean; the ratchet shows no change. These pass: `ci:undefined-css-classes`, `ci:design-system`, `ci:class-vocabulary`, `check:microcopy`, `ci:internals-in-copy`, `ci:canvas-path`. HawkScan not run: HAWK_API_KEY is not set.
