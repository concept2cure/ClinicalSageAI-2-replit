# P-114 item 4 (MDX M7): De Novo gets its doors, and its screen stops calling it a 510(k)

Plan: F1, a repair of shipped behaviour: no screen, mount or table. Decision: P-114 item 4
(`docs/LAUNCH_DEFINITION_OF_DONE.md`, 2026-11-09, decided under the founder's delegation). Study: M7 in
`.design/client-journey/MDX_JOURNEY_2026-11-01.md`.

## What the running app showed (2026-11-12, a database rebuilt from empty)

A De Novo project was created through New project (Medical Devices → De Novo Classification Request, 201,
`program_type: de_novo`).

- **No doors.** Its project page offered "Prepare a Pre-Sub for FDA" and nothing for its pathway: no strategy door,
  and no assembly door on Plan or on Submit (`runs/before-no-doors-and-510k-wording.json`).
- **Its screen called it a 510(k).** The De Novo eSTAR is produced on the 510(k) screen (`device-510k`), whose
  Official eSTAR panel already read "Official eSTAR · De Novo · nIVD eSTAR". Everything else read as a 510(k)
  (`shots/01-…`):
  - "510(k) pathway · Lumina retinal scanner" and "Export 510(k) package";
  - "Predicate search · K-numbers" and "Substantial equivalence matrix";
  - the stages "Predicate search" and "Substantial equivalence";
  - "Open §11 in editor".
- **Its section link asked for the wrong filing.** Found on the re-walk: the editor button sent the kit's pathway
  spelling `de_novo` as the document class, and the editor answered "No DE_NOVO filing is recorded for this project.
  Nothing was opened." The project's filing exists, under the class `denovo`.

A De Novo claims no predicate (FD&C Act 513(f)(2)). Its request shows the search that found none, says how the device
differs from similar ones, and proposes the class and special controls (21 CFR 860.220).

## What already exists (RULE 3)

- **The De Novo eSTAR.** `OfficialEstarPanel.tsx` (`officialEstarTypeFor`, `ESTAR_PATHWAY_WORDS`), the draft package
  route's `denovo` family (`server/routes/510k-estar-routes.ts`), and the governed outline `denovo:fda`
  (`fda-estar-denovo-v1.1`, 33 nodes). Its group C is "Reason De Novo is appropriate (no legally marketed
  predicate)", the proposed classification, the proposed special controls and benefit-risk.
- **The doors' one table.** `PATHWAY_FEATURES` (`v2/surfaces/ProjectMdxWorkflow.tsx`) with its names in
  `DEVICE_DOORS.pathway` (`v2/projectDoors.ts`). Plan's work rows and Submit's assembly door
  (`ProjectMarkets.tsx` `pathwayAssembly`) both read it. De Novo had no entry.
- **The screen**, `mdx/surfaces/K510Surface.tsx`, with its stages in `mdx/data/k510.ts`.
- **The document classes' table of record**, `server/services/c2c/document-class.ts` `PROGRAM_TO_DOC_TYPE`
  (`de_novo: 'denovo'`), and the editor's filing lookup, `v2/editor/filingSectionTarget.ts`, which asks
  `/api/c2c/documents?docType=`.

Nothing was built. De Novo joins the existing door table, and the existing screen takes its words from the pathway.

## The change

- **Doors.** `DEVICE_DOORS.pathway.de_novo` and `PATHWAY_FEATURES.de_novo`:
  - strategy: "Show no predicate exists and propose the classification";
  - assembly: "Assemble the De Novo eSTAR".

  Both open `device-510k`. Plan and Submit read the same table, so both offer them.
- **The screen's words** (`k510PathwayWords` in `mdx/data/k510.ts`, read by `K510Surface.tsx`). For a De Novo project:

  | Part | Reads |
  |---|---|
  | Header | "De Novo pathway" |
  | Export button | "Export De Novo package" |
  | Search panel | "Similar devices · K-numbers" |
  | Comparison panel | "Comparison with similar devices" |
  | Stages | "Similar-device search"; "Classification and special controls" |
  | Editor button | "Open §C1 in editor" |
  | Empty and not-configured states | "similar-device comparison rows"; "the comparison with similar devices" |

  Each panel says which part of the De Novo classification summary it serves. A 510(k) project reads exactly as
  before. Nothing is removed (P-122): the panels are the same panels.
- **The section link.** `docClassForPathway` (`shared/constants/mdx.ts`) gives the governed class for a pathway, and
  `MdxSurfaceHost.openEditor` sends it. `pathway-doc-class.test.ts` holds it to the server's table.

## Verified

| Check | Before | After |
|---|---|---|
| The three door suites (`ProjectMdxWorkflow`, `projectMarketsDeviceAssembly`, `projectSubmitDeviceFiling`): De Novo's row in each pathway table, and Plan's De Novo case | 6 failed (`red/doors-before.txt`) | 48 passed |
| `mdx/surfaces/__tests__/K510Surface.deNovo.test.tsx` (6 cases, through the real host; one holds a 510(k) project to what it said, one covers predicate intelligence not configured) | 4 of the first 5 failed (`red/screen-before.txt`) | 6 passed |
| The same file's editor-target case, once it named the class `denovo` | failed, "expected { docType: 'de_novo' …" (`red/editor-target-before.txt`) | passed, with `pathway-doc-class.test.ts` (`green/screen-and-doc-class-after.txt`) |
| Every `client/src/concept2cure/mdx` suite and every suite naming the door tables | — | 123 files, 1,286 tests (`green/doors-and-screen-after.txt`) |
| The running app, the same De Novo project | no doors; a 510(k) screen | Plan offers both doors; "Assemble the De Novo eSTAR" opens the screen, which reads "De Novo pathway · Lumina retinal scanner" with the De Novo panels and stages; Submit offers the same door (`runs/after-…json`, `shots/02-…` to `04-…`) |

Two expectations in the screen test were corrected after its first red run, and neither was loosened. The regulation
lines are now awaited, because they render once the panels' reads answer. The editor target is checked on its real
fields (`sectionCode`, `sectionLabel`).

## Found, and left with its owner

- **The editor does not open a section that has not been started.** After the fix the editor finds the De Novo
  filing. With no editing copy it says "No accessible working document is bound to the requested filing. Open its
  working copy from the project and retry." With a copy whose C1 was never started it says "The requested section is
  not in the accessible working copies bound to this filing" (`runs/editor-button-after.json`). Both are true, and the
  same holds for a 510(k). A link to an unstarted outline node could offer to start it; that is the editor's
  (`v2/editor/filingSectionTarget.ts`, D4).
- **A 510(k)'s "Open §11 in editor" names a section the governed outline does not have.** The substantial-equivalence
  discussion is C2 there. Left as it was, recorded as M23.
- **The screen offers "predicate of record" on a De Novo.** A De Novo claims none, and nothing refuses the claim.
  Recorded as M24. Removing an action needs a decision (P-122).
- **The surface's own name** stays "510(k) and eSTAR" in the breadcrumb (`UI_SURFACES`, not this lane's to rename).
- **A miss names the class in capitals** ("No DENOVO filing"), from the editor's label table (`v2/editorTarget.ts`).
