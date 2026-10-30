# Report scope honesty under an open project (D2, 2026-10-29)

The session that added the project's Reporting door found this defect
(`docs/evidence/D2-ONE-ANA/2026-10-29/reporting-from-project/README.md`, "Honest-state defect"). With a project
open, the domain report types run at `project` scope, because their registry rows allow it
(`migrations/20260930_report_type_registry_seed.sql`). Their engines still count the whole organization's records,
and every run records that as `computedScope: 'organization'`. The canvas put the project's name above those
counts and nothing said they were the organization's.

This change states it, reading the carried `computedScope` only. It does not change what the engines compute
(that is a separate decision), and it hides no report.

## What already exists

Searches run: `computedScope`, `domainScope`, `scopeLabel`, `ro-scope`, `Organization-wide`, `not narrowed`,
`not limited to one program`, `Data scope` across `server/`, `client/src/concept2cure/v2/` and their tests;
`csv`, `text/html` in `server/services/report-os`, `server/routes/report-os.ts` and the Insights surfaces;
`git log -S"A selected project is context"`.

**Where `computedScope` is set.**

- `server/services/report-os/report-engine.ts:85-101`, `reportAvailability`: `organization` for every domain type
  except `grants.portfolio_register` at project scope; `document` for the lineage trace; `project` for readiness
  and regional.
- `research-compliance-report-providers.ts:87`: the providers' own value. It is `project` only for the grants
  register with a project id. `lifecycle-calendar.ts:98,102-103` and `label-currency-matrix.ts:143` return
  `organization`.
- `report-engine.ts:161`, `computeDomainRun`: writes the provider's value into the run summary as `domainScope`
  and `computedScope`.
- `server/routes/report-os.ts:1785`: `computed.summary.computedScope ??= availability.computedScope`. It is stored
  with the run (`dependencySummary.summary`) and in each dependency's payload (`:1833`). Scheduled runs do the same
  (`scheduling/generate-deliver.ts:81`).

**How it reaches the client.**

- The catalog: `insights-canvas-routes.ts:494` returns each type's `computedScope` for the scope it would run at.
  `Insights.tsx` `catalogFrom` keeps it on every `ReportType`.
- The rendered run: `render/render.ts` `computationMetadata` puts it on the `RenderedReport`
  (`render/types.ts:85`), and `GET /runs/:id/rendered` (`report-os.ts:2092`) returns it. The client's
  `RenderedReport` (`Insights.tsx` ~590) had no such field, so `reportFromRenderedRow` dropped it.
- Run history: `run-history.ts:64-66,185` reads it from the stored summary into each row.

**Every place the scope is shown, at head (ceea6843).**

| Place | What it showed | Organization statement |
| --- | --- | --- |
| Catalog card, `InsightsCatalogPanel.tsx:91-92` | "Runs over: …" | "Organization-wide records" / "Counts are not narrowed to the selected project.", when `computedScope === 'organization'` |
| Run history row, `InsightsRunsPanel.tsx:124` | the stored scope label | "Organization-wide records" |
| Report scope line, `Insights.tsx` ~1051 (`ro-scope`) | the project's name for a project-scope run | none |
| Pack tile, `Insights.tsx` ~1205 (`RODashboard`) | "Run report" | none |
| "Where to start", `Insights.tsx` ~2123 | the segment's first pack, built from the same tiles | none |
| Result after a run, `Insights.tsx:1764` | "The {type} for {project} ran against the governed record …" | none |
| Run PDF header, `pdf/run-pdf.ts:116-117` | "Scope: {scope label}" | "Data scope: organization" |
| Bundle PDF, `pdf/bundle-pdf.ts` | each report through `writeRunPdfContent`, with the same header | "Data scope: organization" |
| Register body, `render/render.ts:298` | the counts | "Counts are the organisation's records of this kind; they are not limited to one program." |
| Label matrix body, `render/label-currency-matrix.ts:19` | the matrix | "Organization-wide recorded labeling facts …" |
| Lifecycle calendar body, `render/lifecycle-calendar.ts:17-21` | every admitted project's obligations, with a Project ID column | none in its sections; its last section, "Method and limits", prints the engine's limit (`lifecycle-calendar.ts:78`): "… submission-linked obligations in the current actor's admitted projects. A selected project is context, not an organization-completeness claim." |
| Schedule notice, `generate-deliver.ts:111` | — | "The data covers the organization." |

There is no HTML or CSV export of a run. The canvas is the HTML rendering and the PDF is the only export. The PDF
body is the rendered sections (`run-pdf.ts:218-220`), so a sentence in a section reaches it.

**Existing wording.** Two sentences already say this, one in each layer: the catalog card's two lines on the
client, and the register's sentence in the rendered body. This change reuses each in its own layer and adds no
third.

One correction to the finding: the lifecycle calendar does carry a statement, but only in its last section, after
every table, and in different words. The rows from other projects come first, under the project's name.

## The defect, per place

1. **Scope line.** A project-scope run of an organization-scope type showed the project's name and nothing else
   (`ro-scope`).
2. **Pack tile.** "Standard pack" tiles offered "Run report" for these types with no note. The "Portfolio oversight
   pack" holds `inspection.readiness_pack`. The catalog card for the same type did have the note. "Where to start"
   builds the same tiles.
3. **Result after a run.** "The Inspection Readiness & 483 Response Pack for ABC-101 ran against the governed
   record …". This one was found here, not in the original finding. It names the project the same way the scope
   line does.
4. **Lifecycle calendar body.** No statement near its rows.

## What changed

- `client/src/concept2cure/v2/surfaces/InsightsCatalogPanel.tsx`: the card's two lines are now exported as
  `ORGANIZATION_WIDE_RECORDS`, `COUNTS_NOT_NARROWED` and `OrganizationCountsNote`. The card draws the same two
  elements as before.
- `client/src/concept2cure/v2/surfaces/Insights.tsx`:
  - `RenderedReport.computedScope` is carried from the rendered document, or from the run row when the document
    has none (`storedComputedScope`).
  - `countsAreOrganizationWide(report)` holds when `computedScope === 'organization'` and the run's scope is not
    `account`. It reads the run's own scope, because the scope line names the run's scope. So a project run opened
    from history or a link gets the note too. An account run is already headed as the organization.
  - The scope line draws `OrganizationCountsNote` under `.ro-rep-meta` when that holds
    (`data-testid="ro-scope-org"`, `role="note"`).
  - The run tile is now `RunPackTile`, the same markup moved out of `RODashboard`. It draws the note when the
    catalog type's `computedScope === 'organization'`. It is its own component because one more line put
    `RODashboard` over the function-length limit.
  - The result after a run (`ranReportText`) adds the same two sentences when `countsAreOrganizationWide` holds.
    It is a helper so `ReportingCanvasForSession` does not grow.
- `server/services/report-os/render/render.ts`: the register's sentence is now the constant `ORGANIZATION_COUNTS`.
  The register uses it, and it is passed to the lifecycle calendar when the run's `computedScope === 'organization'`.
- `server/services/report-os/render/lifecycle-calendar.ts`: `renderLifecycleCalendar` takes that statement and
  puts it first in "Recorded obligation calendar".
- New tests:
  - `client/src/concept2cure/v2/__tests__/insightsOrganizationScopeNote.test.tsx`, 7 cases. The canvas is mounted
    with only the transport and the user replaced. The rendered documents come from the server's `renderReport`.
  - `server/services/report-os/render/__tests__/render-organization-scope.test.ts`, 4 cases. The PDF case is
    skipped when the Noto fonts are not installed.

Not changed:

- What any engine computes, and `report-engine.ts`.
- The run history row (`InsightsRunsPanel.tsx`, outside this change's files). It already says "Organization-wide
  records".
- The PDF header, which already says "Data scope: organization".
- The transient "Running the … for {project} …" line. The result replaces it when the run ends.
- Sealed runs. A sealed run is shown as sealed, so a run finalized before this change keeps its body without the
  calendar sentence. Its scope line still gets the note, from its carried `computedScope`.

## Red, green, mutations

The client file runs with `npx vitest run --config vitest.config.ts <file>`. The server file runs the same way with
`REPORT_PDF_NOTO_CORE_DIR` set to a scratch folder where `NotoSans-{Regular,Bold}.ttf` link to Liberation Sans.
This container has no Noto fonts, and without them the PDF writer refuses (`REPORT_PDF_FONTS_UNAVAILABLE`).

| File | State | Result |
| --- | --- | --- |
| `red-client.txt` | head | 4 failed, 3 passed. Tile: no "Organization-wide records". Scope line: no note (run from tile, calendar run, run opened from a link). The 3 that pass are the negative cases: project-computed tile, project-computed run, account run. |
| `red-server.txt` | head | 2 failed, 2 passed. The calendar body and its PDF lack the register's sentence. The PDF already prints "Scope: ABC-101" and "Data scope: organization". |
| `green-client.txt` | fix | 7 passed |
| `green-server.txt` | fix | 4 passed |
| `mutation-m1-no-scope-line-note.txt` | scope line note removed | 3 failed: run from tile, calendar run, run from a link |
| `mutation-m2-no-tile-note.txt` | tile note removed | 1 failed: the tile |
| `mutation-m3-no-result-note.txt` | result text adds nothing | 1 failed: the result |
| `mutation-m4-scope-not-carried.txt` | `computedScope` not carried into the client report | 3 failed: every scope line case |
| `mutation-m5-account-guard-dropped.txt` | the account exception removed | 1 failed: the account run now reads "not narrowed" |
| `mutation-m6-calendar-sentence-dropped.txt` | the calendar gets no sentence (server test) | 2 failed: body, PDF |
| `mutation-m6b-calendar-sentence-dropped-client.txt` | same mutation (client test) | 1 failed: the calendar's body on the mounted canvas |
| `mutation-m7-calendar-sentence-unconditional.txt` | sentence passed whatever the computed scope | 1 failed: a project-computed calendar now says it |

Each mutation was a single exact replacement. After it, the file was restored from a copy, and
`sha256sum -c` matched both files. `git diff` for the four files shows only the change described above.

## Checks

- **ESLint** (`eslint.txt`, plain `npx eslint`, head read with `git show HEAD:<file> | npx eslint --stdin`):
  - `Insights.tsx`: 7 warnings at head and after, the same seven rules. File length went from 1661 to 1681.
    `ReportingCanvasForSession` stays at 503 lines and complexity 107. `ROReport` complexity went from 13 to 14,
    under the limit.
  - `InsightsCatalogPanel.tsx`, `render.ts`, `lifecycle-calendar.ts` and both new tests: no problems.
    `TypeCard` complexity went from 15 to 14.
- **Types**: `tsc -p` with a config limited to the four files, the two tests and the repo's `.d.ts` files. No
  errors in them. The same 15 errors appear before and after, in files this change does not touch
  (`components/ana/*Panel.tsx`, `GovernedActionSignoff.tsx`, `server/middleware/*`, `authoring-permissions.ts`,
  `governedDocumentContractService.ts`).
- **Related suites** (`suites-head.txt`, `suites-after.txt`), one file at a time under `timeout 240`. These are
  every `__tests__` file named for Insights, insights, reporting, reportCatalog, report-os, render and the lifecycle
  calendar, minus unrelated name matches (PV, post-market, markdown), so 123 files.
  - Head: 113 green and 10 red. All 10 reds are the PDF writer's 503 `REPORT_PDF_FONTS_UNAVAILABLE` (no Noto
    fonts here). `insightsLabelCurrencyMatrix` and `insightsLifecycleCalendar` are green in the working tree,
    which carries the other session's persona-header fix.
  - After, with the core font staged: 125 files (the 123 plus the two new ones), 121 green and 4 red. Six of the
    ten font reds go green, among them `lifecycle-calendar.pglite` (its PDF case now carries the sentence) and
    `report-os-audit-recording`. Four stay red because the PDF writer refuses glyphs that only the missing Noto
    script fonts carry: CJK, Arabic and a check mark (`report-os-report-pack-export`, `company-branding`,
    `report-pack-pdf`, `run-pdf`). Run without fonts, as at head, those four match head test for test
    (`fonts-like-for-like.txt`).
  - No suite is red at head for a reason other than fonts.
