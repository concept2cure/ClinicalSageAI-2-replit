# MDX M18: the PMA screen's modules are the project's PMA document

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md`, found walking the PMA journey in the running app (slice 5b).
Plan: F1, a repair of shipped behaviour: no screen, mount or table.

## What the running app showed

The PMA project "Corvant valve — PMA" was created through New project. Its section B.2 ("Device description summary")
was written in the editor and saved with a reason for change. The filing's B.2 then held the text (`drafted`), and
"Export PMA package (draft)" answered **200**, `deviceContentSource: governed_program`,
`filingAgreement: { compared: true, unfiled: [] }` (`runs/b2-written-and-saved.json`, `runs/pma-export-200.json`).

On the same screen, "PMA modules" read **"Section-by-section assembly · 0 documents total"**, six cards each "draft" and
"0 documents" (`shots/01-before-0-documents.png`). The Plan door that opens this screen is "See which PMA modules are
written".

## Why

`getPmaModules` (`server/services/regulatory-programs.service.ts`) grouped `cerv2_510k_sections` by a six-card kit
taxonomy (Preclinical, Clinical, Manufacturing, Labeling, Statistical, Financial) with its own keyword rules. That
table is the legacy 510(k) store. It has no project link, so:

- every PMA project in an organization showed the organization's 510(k) sections;
- none showed its own PMA document, which is where the editor files and what the export reads;
- **a project with no PMA document showed every module "complete"** when the organization had validated 510(k)
  sections (`red/pma-modules-before.txt`, case "are none for a project with no PMA document");
- a module with nothing in it read "draft".

## What already exists (RULE 3)

- **`server/services/pathway-engines/pma/pma-mapper.ts`** (`mapToPma`). The deterministic 21 CFR 814 PMA module
  scorer: ten slots (administrative, device description, manufacturing, nonclinical, clinical, labeling, SSED,
  statistics, post-approval, references), with required-ness per submission type. It places the governed
  `pma:fda` pack's leaves by their 814.20 letter keys. It is behind the assembly verdict
  (`device-assembly/assemble-device-submission.ts`), the screen's own "Assess a submission → Original PMA" check,
  and AnA's `assemble_device_submission`.
- **`server/services/pathway-engines/estar/estar-content-leaves.ts`**:
  - `loadGovernedDeviceDocument`, the one tenant-scoped lookup of a project's governed device document, and
    `loadGovernedSectionRows`;
  - `governedSectionsToDeviceSections` and `sectionsToLeaves`, including `isSubstantive`, the one written-and-finished
    rule.
- **The same defect, fixed before for milestones.** `getMilestones` in the same service took the organization's
  eSTAR sections as the program's (`server/services/__tests__/program-milestones-own-records.pglite.test.ts`). This
  repair follows that test's pattern.
- **The screen.** `client/src/concept2cure/mdx/surfaces/PmaSurface.tsx`, through `useProgramExtras`, behind a
  `DataGate`.

Nothing was built. The cards now read the existing mapper over the existing document lookup, and the kit taxonomy
and its keyword rules are deleted.

## The change

- **The service.** `getPmaModules` reads the project's own `pma` document and scores it with `mapToPma`, as an
  original PMA. The mapper is asked twice over the same leaves:
  - as the verdict asks it, which gives the finished sections;
  - with every written leaf counted, which gives the written ones.

  So a card tells written from finished without a second matcher. Each module carries its slot id, module number,
  label, `required`, `finished` and `written` section codes, and a status: `present`, `written` or `not_started`.
  The service returns `[]` when the project has no PMA document and `null` when the project is outside the
  organization. A failed read throws, and the route reports it.
- **The screen.**
  - The header reads "Original PMA (21 CFR 814.20) · N of 8 required modules present, as the assembly check counts
    them".
  - Each card names its module number and whether it is required or conditional. It lists its finished and written
    sections by code, or "Nothing written".
  - The pill reads present, written or not started.
  - The empty state reads "This project has no PMA document, so it has no PMA modules to show."
  - The Ask AnA text carries the same facts.
- `PmaModule` (`useProgramExtras.ts`) takes the new shape. The dead copy in `mdx/data/pma.ts` (no importer) is
  deleted. The health check's role for `cerv2_510k_sections` no longer names PMA modules.

## Verified

| Check | Before | After |
|---|---|---|
| `server/services/__tests__/pma-modules-own-document.pglite.test.ts` (PGlite: two orgs; one project with B.2 drafted and G.1 approved, one blank, one with only a 510(k) document; the org's validated legacy 510(k) rows) | 5 failed (`red/pma-modules-before.txt`) | 5 passed |
| `client/src/concept2cure/mdx/surfaces/__tests__/PmaSurface.modules.test.tsx`, through the real host | 4 failed (`red/pma-cards-before.txt`) | 4 passed (`green/pma-modules-after.txt`); 5 with the malformed-answer case below |
| Neighbours: the routes test (its mock takes the new shape), every `client/src/concept2cure/mdx` suite, the PMA mapper, device assembly, the PMA package build, milestones, progress, safety signals | — | 1,112 passed. Nine failed, all in `useMdxPrograms.productType` and `OfficialEstarPanel.attachments`. They fail identically at HEAD without this change (`green/preexisting-at-head.txt`) |
| The running app, restarted on this change, with the same project | "0 documents total" | "0 of 8 required modules present". B.2 is listed "Written, not finished" under module 2 and module 7, and every other module reads "Nothing written" (`shots/02-after-own-document.png`, `runs/pma-screen-after.txt`) |

The second case of the pglite test pins agreement: for every slot, the card's `present` is the verdict's `present`
over the same document.

## Found after the first commit: a malformed answer threw

The wider run for M19 (`../2026-11-02-m19-pma-mapper-places-by-key/green/pma-scorers-after.txt`) caught two uncaught
exceptions from `PmaSurface.tsx`, "Cannot read properties of undefined (reading 'tone')", while
`k510IvdVariant.test.tsx` ran (`red/malformed-answer-throws.txt`). That test's fetch stub answers every
`/api/regulatory-programs*` URL with program rows, `/pma-modules` included. A row that is not a module threw inside
the cards, and in the app that would blank the whole PMA screen. Now `isPmaModule` checks every row, and a malformed
answer is a failed read, said as one: "The PMA modules could not be read: the answer was not a list of modules." It
neither throws nor passes for "no PMA document". This is pinned by a fifth case in `PmaSurface.modules.test.tsx`.
After the change, both files pass with no uncaught exception (`green/malformed-answer-after.txt`).

## Seen here, and left to the next slice

B.2, the SSED's "Device description summary", counts for module 2 ("Device description & indications for use") as
well as module 7. The cause is that the mapper's title matcher (`ti('device description')`) also applies to a leaf
the governed pack has already placed by its letter. Once B.2 is approved, the assembly verdict would count module 2
present with nothing written under C, the 814.20(b)(4)(i) complete device description. The cards report the verdict
faithfully, so the overcount is the verdict's. It is recorded as M19.

## Not here

- The trial cards bind a study by `metadata.clinicalStudyId`, or else by a product-name `ILIKE` over the
  organization's studies (`getPmaTrialMetrics`), and they do not say which study they bound. This walk had no
  study, and they read "No study linked". Recorded in the study.
- The submission type is an original PMA. The screen's "Assess a submission" scores the supplements.
