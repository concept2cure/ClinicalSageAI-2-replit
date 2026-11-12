# P-114 item 3 (MDX M3): the EU technical file is assembled per project, and an EU project is not offered the FDA eSTAR

Plan: F1, a reach of shipped behaviour: no screen, route, mount or table. Decision: P-114 item 3
(`docs/LAUNCH_DEFINITION_OF_DONE.md`, 2026-11-09, decided under the founder's delegation). Study: M3 in
`.design/client-journey/MDX_JOURNEY_2026-11-01.md`.

## What the running app showed before

Seen live on 2026-11-02 (`../2026-11-02-slice-5b-pma-ivdr-walked/`). An EU IVDR project's door "Assemble the technical
documentation" opened the IVD screen. There:

- "Assemble technical file" only put an ask to AnA. It reached no assembler.
- The one output the screen could produce was "Official eSTAR · 510(k) · IVD eSTAR", an FDA form, for a project whose
  filing goes to a Notified Body.

An EU MDR technical documentation project's assembly door opened the CER screen, which exports the clinical evaluation
report and nothing of the rest of Annex II and III.

## What already exists (RULE 3)

- **The assembler, per project.** `assembleTechnicalFileFromProgram`
  (`server/services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core.ts`) packages the project's own governed
  `mdr` or `ivdr` document into the Annex II/III tree, with `manifest.json` and checksums. It refuses with
  `NO_AUTHORED_CONTENT` when nothing is written, and with `FILING_DIVERGED` when a filed copy is not the text its
  document holds (P-29.3; that server half landed on 2026-11-02).
- **Its route**, `POST /api/submissions/programs/:programId/technical-file/export` (`server/routes/submissions.ts`). It
  delivers through the governed-export consequence the eSTAR and CER exports use. **No client called it.** Its tests:
  `tests/routes/technical-file-export-governance.test.ts` and three suites beside the assembler.
- **The per-sequence route**, `POST /api/submissions/sequences/:seqId/technical-file/assemble`. A device project has no
  sequence, so the screens could not use it. It is unchanged.
- **The screens.** `mdx/surfaces/IvdSurface.tsx` (its header's "Assemble technical file", an ask to AnA; its
  `OfficialEstarPanel` and `EstarFilingPanel`) and `mdx/surfaces/CerSurface.tsx`.
- **The CER export's hook**, `mdx/hooks/useCerExport.ts`: the reader for a governed export's answer
  (`downloadable_output_ref`, `governed`, `audited`), with the shared download and error readers.
- **The document classes' table of record**, `server/services/c2c/document-class.ts` `PROGRAM_TO_DOC_TYPE`: a project's
  governed document class is named by its `program_type` alone (`mdr: 'mdr'`, `ivdr: 'ivdr'`, `cer: 'cer'`).
- **The doors**, `PATHWAY_FEATURES` (`v2/surfaces/ProjectMdxWorkflow.tsx`): `ivdr` opens `device-diagnostics`, `mdr`
  opens `device-cer`.

Nothing was built. The screens now call the route that existed.

## The decision's test: which project is an EU project

A device or diagnostic project files on one pathway (its project page says "Device and diagnostic projects file on their
own pathways"). So a project whose recorded filing is EU technical documentation has no FDA filing.

`euTechnicalFileRegulation(programType)` (`shared/constants/mdx.ts`) answers `mdr` or `ivdr` for exactly the program
types whose document class is that technical file, and null for every other. A CER project is null: its filing is the
report. A test holds the function to the server's table (`server/services/c2c/__tests__/pathway-doc-class.test.ts`).

The kit's `Program` did not carry the recorded filing: it folds an MDR project into the pathway `cer`. It now carries
`programType`, as the programs route sends it (`mdx/data/programs.ts`, `mdx/hooks/useMdxPrograms.ts`).

## The change

- **The hook** (`useTechnicalFileExport` and `technicalFileStatusLine`, in `mdx/hooks/useCerExport.ts`): posts
  `{ regulation }` to the per-project route and reads the answer with the CER export's reader. The outcome is kept with
  the project it was asked for.
- **The IVD screen, for an EU project:**
  - "Assemble technical file" assembles the project's own technical file.
  - The ask to AnA that button used to be stays beside it, as "Ask AnA about the technical file" (P-122).
  - The Official eSTAR panel and the eSTAR filing panel are not drawn.
- **The CER screen, for an EU MDR technical documentation project:** "Assemble technical file" is added beside
  "Generate draft". A CER project is offered none.
- **A project on an FDA route is unchanged**: the IVD screen keeps its eSTAR panels, and its "Assemble technical file"
  is still the ask to AnA.

What the status line says, in each case:

| The server answered | The screen says |
|---|---|
| 200, `ready: true`, placed in the registry | "Downloaded <file>" |
| 200, `ready: false` | "… · not yet a complete technical file: the manifest in the ZIP lists each required Annex II and III section and whether it is present" |
| 200, `unfinalized: n` | "… · n of its sections are still in draft or review" |
| 200, no `ready` or no `unfinalized` | that the server did not say; neither is read as complete or approved |
| 200, audited without a registry placement | "… · audit-logged; artifact registry placement pending" |
| 200, the browser refused the file | "<file> was produced but the browser blocked the download" |
| 422 `NO_AUTHORED_CONTENT` | "Nothing to assemble yet. No section of this project's IVDR technical documentation has been written and saved." |
| 409 `FILING_DIVERGED` | the server's sentence, whole |
| any other refusal | "The technical file was not assembled — " and the server's sentence |

A file is assembled when it is not complete, as the route always did: the ZIP is a working package and is sent nowhere.
The line says it is incomplete, because a Notified Body's completeness check holds a file with a required section
missing (P-114 item 1's rule, applied here).

## Verified

| Check | Before | After |
|---|---|---|
| `mdx/surfaces/__tests__/euTechnicalFilePerProject.test.tsx`, through the real host and the real `useMdxPrograms` (10 screen cases) | 8 failed; the 2 that passed pin what must not change, a US IVD 510(k) and a CER project (`red/screens-before.txt`) | 15 passed, with 5 added for the status line (`green/screens-after.txt`) |
| `server/services/c2c/__tests__/pathway-doc-class.test.ts` (3 cases added: the EU test against the server's table) | the function did not exist | 5 passed (`green/screens-after.txt`) |
| Every `client/src/concept2cure/mdx` suite | — | 115 files, 1,134 tests passed (`green/neighbours.txt`) |
| ESLint warning ratchet, against trunk | — | no file changed its warning count |
| `ci:internals-in-copy` | the first push was refused: the incomplete-file line named the manifest by its file name, which the gate reads as an internal identifier in user copy | the line says "the manifest in the ZIP"; the gate passes, and both walks were repeated on the new wording |

## Walked in the running app (2026-11-12)

The install: PostgreSQL 16 built from empty by `scripts/db/provision-test-db.sh`, `server/index.ts` in development with
`RLS_ENFORCE=on`, the seeded login, Playwright at 1440 px. Every non-GET request to a conversation endpoint was aborted,
so no model was called.

**EU IVDR.** New project → Diagnostics & IVD → IVDR Technical Documentation: 201, `program_type: ivdr`
(`runs/ivdr-wizard.json`).

1. The IVD screen's header offers "Ask AnA about the technical file" and "Assemble technical file". No eSTAR appears
   anywhere on the screen: its panels end at "Companion diagnostics" and "CLIA categorization" (`shots/03-…`, the end
   of the screen; `runs/ivdr-nothing-written.json` `saysEstar: []`).
2. With nothing written, "Assemble technical file" posted `{ "regulation": "ivdr" }` to the per-project route, which
   answered 422 `NO_AUTHORED_CONTENT`. The screen said "Nothing to assemble yet…" and downloaded nothing
   (`runs/ivdr-nothing-written.json`, `shots/01-…`).
3. In the editor, the editing copy was created, and II.1.a was written and saved with a reason (PATCH 200; the
   section had been started on an earlier attempt of the same walk, whose script then missed the Save control). The
   IVDR filing's II.1.a then held the text, `drafted` (`runs/ivdr-ii1a-write.json`).
4. "Assemble technical file" answered 200, `governed: true`, the audit row persisted and chained. The browser took
   `PROG-F8AF5607-technical-file-ivdr.zip`. It holds the section's PDF under `01-annex-ii-1/device-description/`,
   `manifest.json` and `checksums.md5.txt`. The manifest reads `ready: false`, 1 required section present and 9
   missing, each named. The screen said the file was downloaded, is not yet complete, and that 1 of its sections is
   still in draft or review (`runs/ivdr-one-section-written.json`, `shots/02-…`).

**EU MDR.** New project → Medical Devices → EU MDR Technical Documentation: 201, `program_type: mdr`, kit pathway `cer`
(`runs/mdr-wizard.json`). The CER screen's header offers "Generate draft" and "Assemble technical file". The same four
steps gave 422 and "Nothing to assemble yet…" (`runs/mdr-nothing-written.json`, `shots/04-…`), then II.1.a started,
written and saved (201, 200; `runs/mdr-ii1a-write.json`), then `PROG-871D7801-technical-file-mdr.zip`,
`governed: true`, 1 required section present and 7 missing (`runs/mdr-one-section-written.json`, `shots/05-…`).

**A US 510(k) project on the IVD screen** is unchanged: "Official eSTAR · 510(k) · nIVD eSTAR" and "eSTAR filing
readiness" are there, and its "Assemble technical file" posted nothing to the technical-file route
(`runs/us-510k-unchanged.json`, `shots/06-…`).

## Found on the walk, and left with their owners

| # | Finding | Whose |
|---|---|---|
| M26 | The technical file's ZIP is named by the project's id (`PROG-F8AF5607-technical-file-ivdr.zip`), not by the project. The per-project route takes no application identifier and the assembler makes one from the id. M21 fixed the same on the eSTAR packages. | The filing lane's route (`server/routes/submissions.ts`). |
| M27 | An EU MDR technical documentation project's assembly door reads "Export the CER". The doors table keys a CER project and an MDR project as one filing. The door opens the screen where the technical file is now assembled. | The project page lane (`v2/projectDoors.ts`, `ProjectMdxWorkflow.tsx`). |
| M28 | The CER screen titles itself "Clinical Evaluation Report" and "EU MDR Article 61" for a project whose filing is the whole technical documentation. | D8 (the device screens' design, P-128). |
| M29 | On an FDA-route project, the IVD screen's "Assemble technical file" still asks AnA to assemble an IVDR technical file. It was left as it was: removing a control needs a founder decision (P-122), and P-114 item 3 decides only for EU projects. | The founder. |
| M30 | The IVD screen shows "CLIA categorization", a US laboratory requirement, on an EU IVDR project. Left as it was, for the same reason as M29. | The founder. |

## Not walked here

- A complete technical file (`ready: true`). It needs every required Annex II and III section written; the assembler's
  own readiness suite covers it (`mdr-ivdr/__tests__/assemble-technical-file-ready.pglite.test.ts`).
- `FILING_DIVERGED`. It needs a filed copy rewritten outside its document; the screen test covers the screen's side,
  and `technical-file-asks-the-filing.pglite.test.ts` the server's.
