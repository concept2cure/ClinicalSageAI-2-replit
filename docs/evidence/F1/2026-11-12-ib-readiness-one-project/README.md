# The Investigator's Brochure readiness belongs to one project (S12 sweep finding 92)

Package F1. Found by S12's biotech sweep (`docs/evidence/SPINE/S12/2026-11-09-biotech-sweep/defects.json`, "The
Investigator's Brochure page reached from search shows a readiness figure that belongs to no project") and handed to
this lane by the coordinating session on 2026-11-12. Re-checked that day on `f529f1d54`: nothing had changed since
2026-10-26.

## What was wrong

The page reads which sections of a brochure have the data they need. Three things were untrue:

1. **The figure was the organisation's, so it belonged to no project.** A kind of data counted as present when any
   project of the organisation held a row. With no project open the page said "36% required sections ready". With
   C2C-101 open it said the same 36%, on the strength of C2C-201's 21 Module 3 sections (`01-red-live-at-a9b5af187.txt`:
   the route ignored the project it was given).
2. **The route answered with no project at all**, 200 and a percentage.
3. **A project with nothing recorded read above zero.** The title page, the confidentiality statement and the table
   of contents need no project data, were always "Ready", and were counted.

Under RULE 2 a figure with no record behind it is a defect.

## What already exists (RULE 3)

| Path | What it does today | What it did not do |
|---|---|---|
| `server/services/authoring/ib-builder.ts` | The IB section registry (ICH E6(R3) Appendix A) and the deterministic gap engine: `flattenSections`, `detectSectionGaps`, `sectionStatus` | Say which sections need project data; share one row projection between the route and the assembler (each had its own copy) |
| `server/services/authoring/investigator-brochure-view-assembler.ts` | Reads which kinds of data exist, from the registers, with the tenant column's type taken from the catalog | Read for a project: `assembleOrgIBSections(orgId)` |
| `server/routes/investigator-brochure.routes.ts` | `GET /api/investigator-brochure`; fails closed to the outline on a missing store, 500 on any other error | Ask for a project, or admit the reader to one. It resolved the organisation with a resolver of its own |
| `server/routes/c2c/project-route-access.ts` `requireProjectRouteAccess`, `sendProjectAccessFailure` | The Projects routes' admission of a reader to a project | Not used by this route |
| `client/src/concept2cure/v2/surfaces/InvestigatorBrochure.tsx` | The page (`investigator-brochure`), reached from Search | Read the open project (`useShellProject`), though it is registered as a project page |
| `client/src/concept2cure/v2/shellProject.ts` | The open project: `useShellProject`, `shellProgramId`, `shellProgramName` | — |
| `docs/evidence/DESIGN/P-122/reach-map/README.md` row 7 and §4 rank 3 | The plan for this check: shown in the one editor for an IB document, after "ready" is made true | Not done here; see "Not in this change" |

Nothing is added: no screen, route file, service, table or AnA tool. `assembleOrgIBSections` is replaced by
`assembleProjectIBSections`; its one caller was the route.

## What changed

- **The route needs a project.** `GET /api/investigator-brochure?programId=…`. With none it answers 400
  `PROJECT_REQUIRED`, no rows and no figure, and reads nothing. The reader is admitted to the project by
  `requireProjectRouteAccess` before anything is read; a project of another organisation, or one the reader cannot
  open, is answered 404 as the Projects routes answer it. The route's own organisation resolver is gone
  (`scripts/ci/tenant-resolvers-baseline.json` shrinks by one).
- **Every register is read for that project only.** How a row names its project, checked against the catalog before
  the read, as the tenant column already was:

  | Kind of data | Register | Project link |
  |---|---|---|
  | Nonclinical | `nonclinical_studies` | its submission's `program_id` (a study with no submission belongs to no project) |
  | Clinical | `clinical_studies` | `program_id` |
  | Clinical | `clinical_ops.studies` | none: **not read for a project**, and the answer names it (`storesWithoutProject`) |
  | Safety | `adverse_events`, `risk_management_plans` | `project_id` |
  | Product | `cmc_module3_sections` | `project_id` |

- **The figure counts only the sections that need project data.** `ib-builder.ts` gains `sectionNeedsData`, and one
  row projection and one figure (`ibSectionRows`, `ibCompleteness`) that the route's fail-closed outline and the
  assembler now share. Each row carries `needsData`.
- **The page reads the open project.** With none open it says "Open a project to see its Investigator's Brochure
  readiness", offers "Open Projects", shows no figure and makes no request. With one open it names the project. A
  section that needs no project data is labelled "No project data needed", not "Ready". The note under the list
  says what is counted, and that documents in the Vault are not.

## Red, then green

| File | What |
|---|---|
| `01-red-live-at-a9b5af187.txt` | The running app before the change: 200 and 36% with no project, and 36% for C2C-101 |
| `02-red-screen-at-head.txt` | The new screen test against the unchanged screen: 6 of 6 fail |
| `03-green-live.txt` | The running app after: 400 with no project; C2C-101 reads 0; C2C-201 reads 18 (sections 2 and 3); an unknown project 404; no session 401 |
| `04-walk.json`, `04-no-project-1440.png`, `05-c2c201-1440.png`, `06-c2c101-1440.png`, `07-c2c101-390.png` | The page used as a person uses it (below) |
| `05-mutations.txt` | Six parts of the fix removed in turn; each time the named tests fail |

Tests, 47 of 47:
- `server/services/authoring/__tests__/investigator-brochure-view-assembler.pglite.integration.test.ts`, 13, on
  PGlite: one project only; a sibling project's rows do not count; a study through its submission; a register with
  no project link is not read and is named; another organisation's submission of the same project id does not
  count; a project with nothing recorded reads 0.
- `server/routes/__tests__/investigator-brochure-read.test.ts`, 8: 400 with no project and nothing read; admission
  before the read; 404 and 503 from the admission; the project passed to the assembler.
- `server/services/authoring/__tests__/ib-builder.test.ts`, 20 (3 new).
- `client/src/concept2cure/v2/__tests__/investigatorBrochureOneProject.test.tsx`, 6, new.

Gates run on the working tree: `ci:sql-interpolation`, `ci:unauthenticated-fetch`, `ci:fixture-fallback`,
`ci:server-error-leaks`, `ci:undefined-css-classes`, `ci:one-product`, `ci:drizzle-tenant-scope`,
`ci:session-scoped-rls-bypass`, `ci:tenant-resolvers`: all pass. ESLint on the seven files: 4 warnings, all in
`ib-builder.ts` before this change; the page had 1 and has none.

## Walked in the running app (RULE 4)

Chromium, signed in as an administrator, on the local stack with the demo projects (`04-walk.json`):

1. With no project open: Search → "Investigator" → the page. It says "Open a project to see its Investigator's
   Brochure readiness". No request to `/api/investigator-brochure` was made.
2. "Open Projects" goes to Projects.
3. C2C-201 opened, then the page the same way: "18%", "2 of 11 sections that need project data have it"; sections 2
   and 3 Ready; the four front-matter and reference rows say "No project data needed".
4. C2C-101 opened, then the page: "0%", "0 of 11". Before the change it read 36%.
5. At 390 wide: no sideways scroll.

No console error and no API response of 400 or above on the walk.

## Not in this change

- **The check is still a page.** The reach map (row 7; §4 rank 3) puts it inside the IB document in the one editor,
  as `editor/StudyDataBuild.tsx` serves a CSR (RULE 4). That removes the page and its `UI_SURFACES` entry, which
  P-122 item 2 makes a founder decision. It is put to the founder; nothing is removed here.
- **Only the registers count.** A toxicology report filed in the project's Vault does not make §4 "ready". The page
  now says so. Reading the Vault's placements as inputs is the reach map's "ready must mean the section's inputs
  exist", and is the next step of this item.
- **One row still marks several sections.** A single Module 3 section marks sections 2 and 3 ready, whichever
  section of Module 3 it is. Same next step.
- **`clinical_ops.studies` has no project link**, so a study recorded only there counts for no project. The page says
  one register is not counted. Giving it a project link is a schema change (RULE 1) and is not made here.
- **Production.** `/api/investigator-brochure` is outside the launch catalog's routes, so production refuses it
  today (reach map row 7). This change is seen where launch scope is off, such as the demo Codespace.
