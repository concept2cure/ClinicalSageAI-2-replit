# The MDX client journey, 2026-11-01: what already exists, what breaks, and the order of work

**Owner:** session `01P6GWSv` ("own the MDX client journey", the founder, 2026-11-01). This is a study and a work
order under `docs/design/ONE_DESIGN_PLAN.md`. It adds nothing to the plan. Read at `8b8c6bc157`.

The journey is a device or diagnostics company's path, in the order a person meets it:
1. create the project;
2. plan the filing;
3. author its documents in the one editor;
4. review and sign;
5. file with the agency (US 510(k), De Novo and PMA through eSTAR; EU MDR and IVDR technical documentation; Japan,
   Canada and Australia);
6. the agency's answers come back.

## What already exists (RULE 3)

Found by three read-only searches (client, server, record) and checked by hand where this file says so.

### 1. Project and plan

**The New project wizard** (`v2/surfaces/Projects.tsx`).
- Filings come from `shared/regulatory/global-document-registry.ts`. It lists the device and IVD pathways of the US,
  EU, UK, Canada, Japan, China, Australia, Switzerland and Brazil, plus CDx. The server's market-support answer
  decides whether each is offered.
- `programTypeFor` maps them to 510k, de_novo, pma, cer, ide, mdr and ivdr. The regional classes go through
  `shared/regulatory/filing-catalog.ts:86-95`.
- Bare `device` and `ivd` filings fail closed: Q-Sub, 513(g), AU, UK, CN, CH, BR and most IVD rows.
- The wizard asks for the device fields: the class, product code, regulation, panel, predicate, intended use and
  flags.

**The project page.**
- `ProjectHome.tsx:1780-1783` uses device wording. `:2106-2119` shows the device facts, and the Review step holds the
  Client Review Room (`ProjectClientReview.tsx` → `mdx/ClientReviewRoom.tsx`).
- The Plan step is `ProjectMdxWorkflow.tsx`: the workstreams from `shared/regulatory/work-packages.ts` (P-47), with a
  door for each of the 12 device features (`projectDoors.ts:54-90`).
- The Submit step offers one assembly door, for 510k, pma, mdr and ivdr only (`ProjectMarkets.tsx:421-437`).

**What is planned and decided.**
- Design records: `docs/design/MDX_PROJECT_WORKFLOW_2026-10-23.md`, `DEVICE_FOLDS_2026-10-29.md` (P-61),
  `DEVICE_CLIENT_READINESS_2026-10-23.md`, `DEVICE_PROJECT_INITIALIZATION_2026-10-20.md` and
  `DEVICE_DOCUMENT_AUTHORING_2026-10-20.md`.
- `.design/client-journey/A2_8_MDX_PROJECT_DESTINATION.md` makes the `mdx` alias open Projects filtered to MDX.
- Founder decisions: P-47, P-48, P-60 and P-61.

### 2. The device screens

Ten `device-*` ids, `human-factors` and `labeling` are all in the launch catalog (`shared/constants/launch-scope.ts:91-94`).
- The `device-*` ids are mounted through `v2/surfaces/DeviceSurfaces.tsx`, which loads `mdx/MdxSurfaceHost.tsx`.
- None is on the rail. They are reached from Plan's doors, ⌘K and deep links.
- The screens are `mdx/surfaces/` `K510Surface`, `PmaSurface`, `CerSurface` (six tabs), `IvdSurface`,
  `EngineeringSurface` (risk, design controls, design history), `SoftwareSurface`, `UdiSurface` and
  `PostmarketSurface`, with `ClinicalStudiesSurface` and `presub/PreSubManager.tsx`.
- `v2/surfaces/HumanFactors.tsx` and `Labeling.tsx` sit beside them.

**These are per-document-type screens, which RULE 4 says are converged into the project and the one editor.**
- No design package's `paths` names `client/src/concept2cure/mdx/**`, `v2/surfaces/DeviceSurfaces.tsx`,
  `HumanFactors.tsx` or `Labeling.tsx` (checked against the ledger).
- So they can be repaired (F1) and reached (R1), but not redesigned or converged without a founder decision. See
  "For the founder" below.

### 3. Documents and the one editor

- Each device project gets one governed filing outline, scaffolded by `shared/regulatory/project-bootstrap.ts` and
  `device-authoring-sections.ts:106-177`. The outlines cover 510(k), CER, MDR and IVDR technical documentation, IVD
  performance, device clinical, the risk file, software and cybersecurity, post-market, Pre-Sub, PMA, De Novo, HDE,
  EUA, Canada, Japan and DHF.
- The outline shows in `editor/DocumentWorkbench.tsx:4223-4320`.
- Device screens open the editor through `editorTarget.ts`. `MdxSurfaceHost.openEditor` knows only k510, pma, cer
  and ivdr.

### 4. Filing

- **The official eSTAR.** `server/services/pathway-engines/estar/*` fills the vendored FDA templates
  (`assets/estar-templates/`: nIVD and IVD v7.1, PreSTAR v3.1) by XFA path. 20 fields are verified for nIVD 510(k)
  and 19 for IVD. De Novo, PMA and PreSTAR get administrative fields only. The filler refuses to report a filled PDF
  without a verified map.
- **Its routes and screens.** `/api/510k/estar` (`server/routes/510k-estar-routes.ts`) has 20 endpoints, all
  called. The screens are `mdx/surfaces/OfficialEstarPanel.tsx`, `OfficialEstarAttachments.tsx`,
  `EstarFilingPanel.tsx` and the Submission Center list `DeviceFilings.tsx`.
- **Filing is a record, not a transmission.** "Sign and file" binds a Part 11 signature to the retained eSTAR's
  hash. FDA's answers (under review, additional information, decision, tracking number) are entered by hand.
- **No device filing is transmitted.** There is no CDRH Portal adapter, and `market-support.ts:472-490` says so.
  FDA ESG (`fda-esg.ts`) is unproven, EUDAMED (`ema-cesp.ts:495`) is wired but unproven, PMDA refuses, and Health
  Canada and TGA have no transport.
- **The MDR/IVDR technical file** is built by `pathway-engines/mdr-ivdr/*`
  (`POST /api/submissions/sequences/:id/technical-file/assemble`). No client calls it. The P-27 follow-up says it
  still writes placeholder identity.

### 5. Proof

- **Golden journeys, HTTP level.** `tests/golden-journeys/device-510k-estar.journey.test.ts` runs intake →
  sections → assemble → official eSTAR fill. `cer-eu-mdr.journey.test.ts` runs the CER to export. Their reports are
  local files, not committed evidence.
- **Other tests.** 12 route suites under `tests/routes/` (`510k-device-routes`, `estar-*`, `device-*`), about 30
  eSTAR engine suites, and about 100 client suites under `client/src/concept2cure/mdx/**/__tests__`.
- **Not proven:**
  - any device transmission;
  - the Japan, Canada or Australia device paths;
  - a device journey walked in the browser through Submit;
  - an OQ protocol for devices (`tests/validation/oq/` has none).
- **Demo.** `scripts/demo/launch-demo/packs/mdx*.mjs` seeds "[Demo · MDX] NeuroPanel-Dx 510(k)". It was repaired on
  2026-10-31, and readiness stays at 0% without a second signer.

### 6. Server capability that no screen reaches

Grep found no client caller for any of these; R1 reaches or retires them.
- `/api/fda-forms`: FDA 3514, 3654, 3881 and 3601.
- The MDR/IVDR technical-file assemble.
- `/api/ivdr` classify, submission-package and eudamed-export.
- The IVDR binder routes.
- `/api/cer` and `/api/cerv2/ai`, which call a model.
- 18 of the 20 `/api/predicate-intelligence` endpoints, which proxy to the Python shadow service (last commit
  2026-04-05).
- `/api/device-classification`, `substantial-equivalence`, `cybersecurity-524b`, `postmarket-surveillance`,
  `udi-ivdr`, `companion-diagnostics`, `pccp`, `pma-workflow`, `device-projects` and `device-cockpit`.
- `/api/mdx/ivd/*`, `/ldt`, `/cdx/concordance` and `/udi/:id/submit-gudid`. The last only sets a status; nothing
  is sent.

No launch surface claims many of these prefixes, so production refuses them by default
(`moduleEntitlementGate.ts:103-137`; a grep result, not a proof).

## What breaks, verified at HEAD

Each is a repair of shipped behaviour (F1): no screen, mount or table.

| # | Defect | Where | Checked |
|---|---|---|---|
| M1 | "Tap any row to open in the editor" does nothing on Engineering, UDI and Postmarket, and Postmarket's urgent-MDR click does nothing. The host passes no `onOpenEditor` to any of them. | `mdx/MdxSurfaceHost.tsx:399-407`; `EngineeringSurface.tsx:402`, `UdiSurface.tsx:260`, `PostmarketSurface.tsx:219,267`; `components/DocumentsPanel.tsx:183` | by hand |
| M2 | AnA is told the device screens have no controls for signatures, uploads or profile changes. `EstarFilingPanel`, the dossier attachments and `DeviceProfilePanel` have all three. | `MdxSurfaceHost.tsx:145-148` | by hand |
| M3 | An EU IVDR project's "Assemble the technical documentation" opens `IvdSurface`, whose only assembly is the FDA eSTAR, defaulting to 510(k). | `IvdSurface.tsx:627-636` | search |
| M4 | Every device filing row in Submission Center says "Open 510(k) surface", PMA and IVD included, and its empty hint says filings are tracked from 510(k) only. | `DeviceFilings.tsx:250-260` | search |
| M5 | The seeded 510(k) template files sections B1, B2, C1 and D1 under other sections' headings, and SE1 and SE2 reach no node. Its codes were never corrected. | `server/services/intelligence/template-seeds.ts:189`; evidence `docs/evidence/ANA-REASONING/2026-10-05/r16/template-outline-code-collision/` | search |
| M6 | **Corrected 2026-11-01 by a trace of the creation path; the first wording here was wrong.** An IVD 510(k) gets the generic 510(k) governed outline (`k510:fda` `fda-estar-510k-v1.1`, A–G), and it does keep its cover letter, SE and labeling. What breaks: (a) the outline has no node for IVD analytical performance, so the IVD eSTAR's always-required `ivd-analytical-performance` slot (`estar-mapper.ts:375-420`) never reads present from governed content and an IVD 510(k) cannot reach "ready"; the nIVD-only E1 biocompatibility and E5 bench nodes stay mandatory; (b) the built-in template "US · 510(k) for IVD" is the `us_510k_ivd_sections` blueprint (`project-bootstrap.ts:906`, IVD_PERFORMANCE_SECTIONS, codes 1–6), whose sections reach no outline node, and which shows EU IVDR citations (Annex XIII, Article 56) to a US client through the template, AnA's briefs and the readiness digest; (c) the eSTAR variant is chosen two ways: `K510Surface` takes IVD from the product type, `EstarFilingPanel.tsx:605` and `510k-estar-routes.ts:1336,1402` default to the nIVD form. | `shared/regulatory/project-bootstrap.ts:906`, `server/services/pathway-engines/estar/estar-mapper.ts`, `migrations/20261005c_k510_denovo_estar_outline_v1_1.sql`, `mdx/surfaces/EstarFilingPanel.tsx` | trace |
| M7 | De Novo has no pathway door and no Submit assembly door. Its eSTAR exists only on `device-510k`. | `ProjectMdxWorkflow.tsx:31-36`, `ProjectMarkets.tsx:421-437` | search |
| M8 | **Fixed 2026-11-02** (`docs/evidence/MDX-JOURNEY/2026-11-02-m8-labeling-empty-state-action/`): the action is Ask AnA to start it, for writers. Labeling's empty state ("Create a device IFU…") has no create action, and no client code creates a labeling document. | `v2/surfaces/Labeling.tsx:482,545` | search |
| M9 | Respond tells a device project its markets are on Submit, which refuses device markets. | `ProjectRespond.tsx:209` vs `ProjectMarkets.tsx:517` | search |
| M10 | Plan titles a technical documentation project "EU MDR CER" or "EU IVDR PER". | `ProjectMdxWorkflow.tsx:28` | search |
| M11 | **Fixed 2026-11-02** (`docs/evidence/MDX-JOURNEY/2026-11-02-m11-device-screens-describe-themselves/`). Registry notes were stale: device-cer says "Dashboard only today", and `CerSurface.tsx:13` still describes sample mode, which was removed. | `shared/constants/ui-surface-registry.ts:540`; `ui-surface-registry.ui-v2.ts:443` | search |
| M12 | ~~`device-clinical-studies` lists every study in the organization, not the project's.~~ **Corrected 2026-11-02: not a defect.** With a project open the list is the project's (`programForContext` → `useClinicalStudies(program.id)` → `?program_id=`, filtered by the server); with none it is the documented portfolio. `docs/evidence/MDX-JOURNEY/2026-11-02-m11-device-screens-describe-themselves/` | `ClinicalStudiesSurface.tsx:116-117`, `server/routes/mdx-clinical-studies.ts:119-122` | read |
| M13 | The AnA k510 transmit is in launch scope, while the HTTP package transmit is refused 403 in production. | `ana-launch-scope.inventory.json`; `ui-surface-registry.ts:418-422` | search |

## The order of work

Each slice is red first and goes through the gate (`Plan:` and `Completes:`, RULES 5 and 6). Before each slice, its
files are checked against `.design/claude-convergence/COORDINATION.md`, and a file another session holds is handed
on, not raced.

1. **The device screens keep their promises** (F1): M1, M2, M4, M10 and M11. Files: `mdx/MdxSurfaceHost.tsx`,
   `mdx/surfaces/{Engineering,Udi,Postmarket}Surface.tsx`, `mdx/components/DocumentsPanel.tsx`,
   `mdx/surfaces/DeviceFilings.tsx`, `v2/surfaces/ProjectMdxWorkflow.tsx` (title only, which also matches D3's
   `Project*.tsx`, so the coordinator is told first), and the two registry note strings. No other session holds
   any of these today.
2. **The 510(k) outline is the eSTAR's** (F1): M5 (the seeded template's codes) now. M6(b) and (c) next. M6(a) needs an IVD
   510(k) outline version: a new rule-pack row, seeded by migration (RULE 1), checked against the vendored IVD
   eSTAR v7.1 sections. It is data, not a table, but it is new content, so it is put to the founder before it is built.
   - **2026-11-02, the step M5 unblocked: the eSTAR exits ask whether the filing holds the document's text** (F1,
     P-29.3). `/build`, the official eSTAR's section attachments, and the filing-readiness and assembly verdicts now
     ask `governedDeviceFilingAgreement`. The filing-exit gate also learned the two device section loaders it could
     not see. Evidence: `docs/evidence/MDX-JOURNEY/2026-11-02-slice-3-estar-exits-ask-the-filing/`.
3. **Each pathway's door opens its own filing** (F1 and R1): M3 (the IVDR door reaches the existing MDR/IVDR
   technical-file assembler, after its placeholder identity is fixed) and M7 (De Novo). This is done with the R1
   lane (`01QoxbL`) because it reaches an endpoint no client calls. M3's server half landed on 2026-11-02: the
   technical file asks whether the filing holds the document's text, and refuses 409 `FILING_DIVERGED`
   (`docs/evidence/MDX-JOURNEY/2026-11-02-m3-technical-file-asks-the-filing/`). The door is what remains.
4. **Dead ends** (F1): M8 (Labeling create, through the existing labeling route) and M9 (Respond's device wording,
   in `ProjectRespond.tsx`, which is under D3 and S10. RIM holds S10, so this goes through the coordinator).
5. **The journey walked in the running app** (L1 and RULE 4: "a screen is not done until it was opened in the
   running app and used"). The seeded NeuroPanel-Dx 510(k), from New project to a signed eSTAR filing record, at
   1440 px and 390 px. Evidence under `docs/evidence/MDX-JOURNEY/`.
6. **Reach or retire the unreached device capability** (R1, with `01QoxbL`): the list in §6, each reached in the
   device journey's existing screen or put to the founder for retirement.

## For the founder

These decide what this lane may do. The lane does not decide them.

1. **The device screens' design and RULE 4 convergence have no package.** `mdx/**`, `DeviceSurfaces.tsx`,
   `HumanFactors.tsx` and `Labeling.tsx` are in no D package, so they can be repaired but not given Claude's
   design. RULE 4 also says their per-type screens (the 510(k), PMA, CER, IVD, Labeling, Pre-Sub, Human factors
   and Software workbenches) belong in the project's document start and the one editor. Those are D3's and D4's
   files. Which package takes them: D3 and D4 with these paths added, or a device design package?
2. **F-10: is the device bundle the official eSTAR?** MR-10 stages 2 and 13 wait on it. Today `submission-ops`
   labels a 510(k) package `estar` but builds an eCTD-style ZIP.
3. **Sending a device filing.** No CDRH Portal adapter exists. Under RULE 6 building one is new. Until you decide,
   the platform records a signed filing against the retained eSTAR, and the agency's answers are entered by hand.
4. **The unreached device capability** (§6): which of it to reach in the journey, and which to retire.
