# Reporting from inside a project (D2, 2026-10-29)

Founder's direction today: most of what was an "app" becomes core functionality. Reporting & analytics
(`insights`, `compliance-reports`) is a launch-catalog work area. It could be reached from the rail only. A person
inside a project had no way to that project's reports. This change adds one door on the project header. Reporting &
analytics was already scoped to the open project. The door opens it there.

## What already exists

Searches run: `programId`, `shellProgramId`, `useShellProject`, `openProgram` in `Insights.tsx` and
`server/routes/insights-canvas-routes.ts`; `insights`, `Reporting`, `report` in
`.design/client-journey/INFORMATION_ARCHITECTURE.md` and `docs/design/FILING_SPINE.md`; `STEP_DOORS`,
`useSurfaceAvailable`, `pj-top` in `client/src/concept2cure/v2`; `onNav('insights')` across the client (no caller
inside a project); `git log -S pj-top-actions` (the class exists in CSS and no component has ever used it).

**How Insights reads the project.** Insights reads the project from the shell only, not from its own URL.
`ReportingCanvasForSession` (`client/src/concept2cure/v2/surfaces/Insights.tsx` ~1618) calls
`shellProgramId(useShellProject())`. That is the `regulatory_programs` UUID in `window.C2C_PROJECT`, written by
`publishShellProject` (`shellProject.ts`). Insights then sends it to the server as
`GET /api/insights-canvas/overview?programId=<uuid>`. The shell's own `?program=` URL parameter fills that channel
when a page loads (`restoreShellProject`). Insights' `useSearch()` reads only `?reportRunId=`. The server
(`insights-canvas-routes.ts`, `pickLead`) leads with that project's anchored project record, or answers
`openProgram.state` `unanchored` or `not-in-portfolio`. The canvas states either of those for the named project
(`insightsOpenProgram.test.tsx`). It never falls back to another project. A non-UUID id (a legacy number) is not
named, so Insights opens on its project picker.

**What it shows under a project, and what is org-wide.**

- Scoped to the project: the report builder header (`p.code`, filing, segment); the "Where to start" opener; the
  catalog (`reportTypes`, following the project's product type); the readiness and regional reports
  (`computedScope: 'project'`); runs requested as `programId` (`requestRun`); the market comparison (marked as a
  project-level figure).
- Org-wide, and labelled as such: the portfolio board ("Portfolio — board view", "This board covers projects you can
  access"; enterprise-gated); Run history, which opens on "All accessible reports" (`InsightsRunsPanel.tsx:154`,
  `currentScope` false), with the project as a choice in a labelled select; account-scope types (`runScopeType:
  'account'`), whose report is headed "Organization records"; the catalog's own cards, which say "Organization-wide
  records. Counts are not narrowed to the selected project." (`InsightsCatalogPanel.tsx:91-92`); "Audit &
  compliance reports", which is its own surface.

**Honest-state defect: org-wide figures under the project's name.** These are reported here and not fixed in this
change. The domain report types (`DOMAIN_REPORT_TYPE_IDS`, `server/services/report-os/report-engine.ts:48`; for
example `inspection.readiness_pack`, `lifecycle.obligation_calendar`, `ha.commitment_register`,
`etmf.completeness_pack`, `global.label_currency_matrix`) declare `project` in their allowed scopes
(`migrations/20260930_report_type_registry_seed.sql`). So with a project open, `catalogRunScope` runs them at
`project` scope. Their engine still computes the organisation's records: `reportAvailability` returns
`computedScope: 'organization'` for every domain type except `grants.portfolio_register`
(`report-engine.ts:87-88`). The lifecycle calendar and label matrix return it too (`lifecycle-calendar.ts:98`,
`label-currency-matrix.ts:143`). Three places show this under the project:

1. **The report header.** `ROReport`'s scope line (`data-testid="ro-scope"`, `Insights.tsx` ~1045) shows
   `reportTarget(...).label`, which is the project's name for a `project`-scope run. The server stores no
   `scopeLabel` for a run. The organisation's counts are therefore headed with the project's name. The body
   corrects this in two of the three shapes: the register section says "Counts are the organisation's records of
   this kind; they are not limited to one program" (`render/render.ts:298`), and the label matrix says
   "Organization-wide recorded labeling facts" (`render/label-currency-matrix.ts:19`). The lifecycle obligation
   calendar does not say so anywhere in its sections (`render/lifecycle-calendar.ts:18`, `LIFECYCLE_CALENDAR_LIMIT`).
   Its table lists every accessible project's obligations, with a Project ID column, under the open project's name.
2. **The pack tiles.** In "Standard pack" (`RODashboard`, `Insights.tsx` ~1166-1215), a pack started from "the
   standard packs for {project}" offers "Run report" for these types. No tile says the counts are not narrowed to the
   project. The catalog's card for the same type does say so. The "Portfolio oversight pack" ("For the projects you
   oversee") includes `inspection.readiness_pack`.
3. **"Where to start"** offers the segment's first pack under the project's name, with the same tiles.

Suggested fix, for a separate slice: show the org-wide note from the catalog card on the pack tile and in the
report header whenever `computedScope === 'organization'`; give the lifecycle calendar the register's sentence. The
fix touches `Insights.tsx` rendering and the report-os renderer, not the program read, so it is outside this
slice.

**Where reporting belongs in the project.** The map places it. INFORMATION_ARCHITECTURE.md section 7, Project home,
item 1: "Header: *All projects*; the project's name …; the status line. … To add: … *Reports for this project*,
opening Reporting & analytics scoped to the project (`insights`, wiring)". Section 5's `insights` row says the
same: "Left: *Reports for this project* on the project header, opening the canvas scoped to the project (wiring)."
FILING_SPINE.md describes the old state ("It reports on the organisation's lead program, not the open project …
A per-project report comes later", line 339). `insightsOpenProgram` has since fixed that. FILING_SPINE.md places
no door. So the door goes on the header, not on a step. That also fits the question it answers: "how is this
project doing" is about the whole project, not one of its six steps.

**How doors are drawn on Project home.** A ghost button, `className="btn ghost"`, with
`style={{ fontSize: 12, padding: '4px 12px' }}` and `{name} {I.right}`, gated by `useSurfaceAvailable()`. Examples:
`ProjectEvidence` (Vault), `ProjectDocuments` (protocol, editor, CMC), `ProjectWorkPanel` (Tasks). Step door names
come from `STEP_DOORS` (`client/src/concept2cure/v2/projectDoors.ts`). `.pj-top-actions` (`app-v2.css:1046`) exists
and is unused. It does not wrap, so a sentence-long door beside the title would squeeze the title at phone width.
The door therefore sits in the header's left column, under the facts, and its button wraps.

**The section 9 door-names table.** That table governs the doors on the six steps (Evidence, Author, Plan, Review,
Submit, device workstreams). Each row needs a constant in `STEP_DOORS` (`clientNamesSlice1.test.tsx`, "the door
names live in one module"). The header's doors (*All projects*) are not in it. No row is added here: a row without
its `STEP_DOORS` constant fails that test, and `projectDoors.ts` belongs to another session. If the founder wants
header doors governed by the table, the row and the constant go in together, in one change to both files.

**The name.** Section 9: "Doors are verb phrases naming the job. A door that leaves the step names the job and then
the place it is done in." The vocabulary already in the table is "See every sequence in Submission Center" and "See
all tasks in Tasks". The door reads **"See this project’s reports in Reporting & analytics"**. That is the map's
*Reports for this project*, written the way section 9 writes a door. It uses none of the "Not in client copy" words
(`clientNamesSlice1` stays green).

## What changed

- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`: `ProjectReportsDoor`, drawn at the end of the header's
  left column (`.pj-top-l`). It calls `onNav('insights')`, the shell's own navigation. The project travels on the
  shell's program channel, which Insights already reads. The door is offered only when that channel names a
  project (`shellProgramId`) and `useSurfaceAvailable()('insights')`. It is its own component, so `ProjectHome`'s
  complexity is unchanged.
- `client/src/concept2cure/v2/__tests__/projectHomeReportsDoor.test.tsx`: new tests.
  - The door is on the header, by name, and opens `insights` with the project still open.
  - Insights then mounted reads `/api/insights-canvas/overview?programId=<this project>` and leads with it.
  - The door is absent when `insights` is locked.
  - The door is absent with no project open.
- `Insights.tsx`: unchanged. Its program read needed nothing.

## Red, green, mutations

All from `npx vitest run --config vitest.config.ts client/src/concept2cure/v2/__tests__/projectHomeReportsDoor.test.tsx`.

| File | Change | Result |
| --- | --- | --- |
| `red.txt` | Head, no door | 2 failed: "Unable to find role=button … See this project’s reports in Reporting & analytics" |
| `green.txt` | The door | 4 passed |
| `mutation-1-no-door.txt` | The header does not draw the door | 2 failed (header, opens on project) |
| `mutation-2-no-availability-gate.txt` | `useSurfaceAvailable` check removed | 1 failed: the door is drawn with `insights` locked |
| `mutation-3a-door-drops-project.txt` | The door clears the shell project before `onNav` | 2 failed: no open project; overview read without `programId` |
| `mutation-3b-insights-drops-project.txt` | Insights' overview URL drops `?programId=` | 1 failed: overview read without `programId` |

Each mutation was restored from a copy. `sha256sum -c` matched both files afterwards, and
`git diff -- client/src/concept2cure/v2/surfaces/Insights.tsx` is empty.

## Checks

- ESLint `ProjectHome.tsx`: 6 warnings and 0 errors, at head and after. They are the same six warnings. The
  file-length and `ProjectHome` line counts went up (1464 to 1480, 369 to 370), and `ProjectHome`'s complexity is
  still 142. ESLint on the new test: clean.
- Types: `tsc -p` with a config limited to the two files plus the repo's `.d.ts` files: 0 errors.
- Existing suites, one file at a time under `timeout 240`: every suite that mounts or names Project home or
  Insights, every `insights*`, `projectHome*` and `reporting*` suite, and `clientNamesSlice1*`. That is 81 files.
  78 are green, including `clientNamesSlice1` and `projectHomeLaunchScope`. 3 are red at head, and this change does
  not cause them. None of them mounts the header, and every file involved is unmodified against HEAD.
  - `insightsLabelCurrencyMatrix.test.tsx:41` and `insightsLifecycleCalendar.test.tsx:49` expect
    `apiRequest('GET', '/api/users/me/persona')`. Since 182c4b0e (2026-10-26) `reportingPersona.ts` calls
    `apiRequest('GET', REPORT_PERSONA_PATH, undefined, headers)`. That commit updated `reportCatalogPersona.test.tsx`
    and not these two.
  - `projectDocumentDisposition.test.tsx:100`, "retained search-only Vault selection …", mounts `Vault` only and
    finds no "Review removal of Retained search record" button.
