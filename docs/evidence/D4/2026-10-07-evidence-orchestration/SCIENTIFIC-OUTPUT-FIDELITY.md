# D4 scientific-output fidelity: existing Biostat → Authoring handoff

Date: 2026-10-07. Base: `16bbf5b070ecfc186d7addaa1b6b96e384d6fe87`.
Approved contract: `PLAN.md`, scientific result fidelity. Work is confined to
the existing helper, existing workbench, focused tests, and this evidence.
No new calculation engine, model, route, dependency, or approval was added.

## Defect and bounded correction

BiostatWorkbench rendered object-array result tables, but its Authoring handoff
passed only scalar rows to `engineResultToHtml`. Thus the saved draft omitted
the OC/decision/grid table the person saw. The first row's keys also determined
the table's columns, hiding fields introduced by a later row; a table-only
result could not be filed at all.

The canonical helper now accepts optional structured tables. Existing scalar-only
callers, including PvCockpit, retain their markup and full provenance stamp.
The workbench passes its actual extracted tables to that same helper. Screen
and saved table cells use the shared text conversion in `engineResultHtml`:
numbers retain their JavaScript numeric value without new rounding, booleans
remain yes/no, missing/null cells are an em dash (not a measured zero), and
nested JSON values remain readable text. All dynamic HTML text is escaped.

Columns are a stable union over every row, with supplied display labels retained
and previously unlisted keys appended rather than dropped. Nullable rows are
kept in position. Fieldless/null-only records have an explicit Record column.
The screen still discloses its 60-row preview limit; filing carries every row.
The insertion control now also accepts table-only results.

Implementation anchors:

- `client/src/concept2cure/v2/engineResultHtml.ts`: `EngineResultTable`,
  `engineResultTableColumns`, `engineResultCellText`, and optional tables in
  `engineResultToHtml` (lines 31–112).
- `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx`: `objectTables`
  (161 onward), handoff (240), table-only control (315), and shared table
  columns/cells in the preview (349 onward).

## Existing export/draft contract retained

Only existing export-understood tags are emitted: `p`, `b`, `i`, `table`,
`thead`, `tbody`, `tr`, `th`, `td`. The Authoring sanitizer permits the table
tags (`server/services/authoring/authoring-html-sanitizer.ts:60–68`). The real
export parser reads `thead`/`tbody`, header flags and table cells into typed
blocks (`server/export/authoring-section-content.ts:489–536`), then the existing
HTML and DOCX renderers handle those blocks.

`saveToAuthoring` is unchanged: it requires an open UUID program and writes
through the existing document/section endpoints. Document creation still
inserts status `draft` (`server/services/authoring/authoring-documents.ts:329–344`).
The sealed-record export restriction is unchanged
(`server/routes/authoring.router.ts:5803–5825`); a working draft is not an
approved filing artifact merely because it contains a reproducibility stamp.

## Falsifiable validation receipts

Before production edits, the new regressions were run:

```sh
npx vitest run --config vitest.config.ts tests/concept2cure/engine-result-filing.test.ts client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx -t 'structured|truncate|displayed result table|table-only'
```

RED: exit 1; 5 failed, 61 skipped; 2 files failed; 13.54 s. The saved component
content lacked its displayed table label, the table-only result lacked an
insertion button, and the helper ignored the structured table argument.

After the correction:

```sh
npx vitest run --config vitest.config.ts tests/concept2cure/engine-result-filing.test.ts client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx client/src/concept2cure/v2/__tests__/pvCockpit.test.tsx
```

GREEN: exit 0; 70 passed; 3 files passed; 11.51 s. The added tests cover exact
small/long-decimal values, later-row columns, nested values, null/missing cells,
table-only results, all 65 rows despite a 60-row screen preview, HTML injection
as inert text, open-project/M5 handoff, and the complete 64-character input hash.

`engine-result-filing.test.ts` uses the real section-to-block parser, real HTML
renderer, and real DOCX renderer/Packer, and reads `word/document.xml` from the
generated in-memory ZIP. It confirms real table blocks and Word tables with the
precise values/labels/hash, not merely the formatter's HTML string.

```sh
npx vitest run --config vitest.config.ts server/routes/__tests__/authoringSignFreezeAndExportGate.test.ts server/export/__tests__/authoring-table-export.test.ts
```

GREEN: exit 0; 21 passed; 2 files passed; 9.45 s, including draft-export refusal
(409), approved export behavior and existing table-shape/escaping coverage.
The route suite uses mocked persistence/signing dependencies and emits its
existing mocked-audit warnings; it is not durable-database audit evidence.

```sh
npx eslint client/src/concept2cure/v2/engineResultHtml.ts client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx tests/concept2cure/engine-result-filing.test.ts --quiet
git diff --check
```

Both exited 0. Shared tree validation and publication belong to the control
tower; this worker did not commit or push.

## Limits of this evidence

The component responses are controlled fixtures testing serialization/handoff,
not calculations performed by a live statistical service. The HTML branch
used for PDF export is tested; an actual PDF/browser print run was not performed.
No live provider, staging database, tenancy deployment, operational PQ, agency
acceptance, or complete scientific/regulatory qualification is established.

This contract covers the structured tables the existing workbench extracts
from top-level object/null arrays. Other nested/non-tabular output remains in
the explicit raw-response view; it is not claimed to be fully captured in the
saved draft. Existing scalar display formatting/rounding is unchanged. The full
input hash records calculation provenance, not source-data correctness,
statistical suitability, expert review, or final document approval.
