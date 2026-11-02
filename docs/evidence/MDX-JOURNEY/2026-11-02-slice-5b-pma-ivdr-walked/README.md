# MDX journey slice 5b: the PMA and EU IVDR journeys, walked in the running app

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md`, slice 5 (L1), after the 510(k) walk
(`../2026-11-02-slice-5-journey-walked/`). RULE 4: a screen is not done until it was opened in the running app and used.
Plan: F1 for the fixes this walk made.

## The install, and how it was walked

The walk used the same install as slice 5:
- PostgreSQL 16 with pgvector, built from empty by `scripts/db/provision-test-db.sh`;
- `server/index.ts` in development on `:5000`, with `RLS_ENFORCE=on`;
- the `scripts/seed-admin.mjs` login;
- Playwright, through the real sign-in page and screens, at 1440 px.

Every non-GET request to a conversation endpoint was aborted, so no model was called. The server was restarted on
each fix, and the walk was repeated after it.

## What already exists (RULE 3)

The study's inventory (§1–6), and the slices before this one:
- slice 1 (M1, M2, M10);
- slice 2 (M5, M6(c));
- slice 3 (the eSTAR exits ask the filing);
- M3's server half (the EU technical file asks the filing);
- M8, M11 and M17;
- slice 5 (the 510(k) journey walked, and the home filing's editing copy restored).

The pieces this walk reached:
- the PMA screen (`mdx/surfaces/PmaSurface.tsx`);
- the IVD screen (`mdx/surfaces/IvdSurface.tsx`);
- the PMA mapper (`server/services/pathway-engines/pma/pma-mapper.ts`);
- the governed `pma:fda` (21 CFR 814.20, A–M) and IVDR (Annex II, `II.1…`) outlines;
- the draft package route (`POST /api/510k/estar/build`);
- the technical-file assembler (`POST /api/submissions/sequences/:seqId/technical-file/assemble`).

## The PMA journey

1. **New project.** Medical Devices → Premarket Approval Application → Create. `POST /api/c2c/projects` answered
   **201**, `program_type: pma` (`runs/pma-wizard.json`, `shots/01-…`, `02-…`). Plan reads "What this PMA needs" (M10).
2. **The doors** (`runs/pma-journey.json`). "See which PMA modules are written" and "Export the PMA package" open the
   PMA screen on this project. Its two outputs are "Export PMA package (draft)" and "Generate official eSTAR (PDF)"
   (`shots/03-…`).
3. **The editor.** It offered the home filing's "Create editing copy", which created the copy (**201**) "bound to the
   FDA filing", with the 67-node 21 CFR 814.20 outline and its stated basis (`shots/04-…`). B.2 "Device description
   summary" was started from the outline (**201**), written, and saved with a reason for change (**200**). The filing's
   B.2 then held the text, `drafted` (`runs/pma-b2-write.json`, `shots/05-…`).
4. **The export.** "Export PMA package (draft)" answered **200**, with:
   - `packageFamily: pma` and `deviceContentSource: governed_program`;
   - `filingAgreement: { compared: true, unfiled: [] }`, the P-29.3 check (slice 3).

   The ZIP was downloaded (`runs/pma-export.json`, `shots/06-…`).
5. **The PMA modules.** The same screen read "0 documents total", six "draft" cards (M18), then listed B.2 under a
   module that is not its own (M19). Both were fixed in this walk, below.

## The EU IVDR journey

1. **New project.** Diagnostics & IVD → IVDR Technical Documentation → Create. The create answered **201**,
   `program_type: ivdr` (`runs/ivdr-wizard.json`, `shots/07-…`, `08-…`). Plan reads "What this EU IVDR technical
   documentation needs" (M10).
2. **The doors** (`runs/ivdr-journey.json`). "Assemble the technical documentation" opens the IVD screen
   (`device-diagnostics`, "Assess, save and review IVD evidence") on this project (`shots/09-…`). There:
   - **"Assemble technical file" puts an ask to AnA.** It does not reach the technical-file assembler.
   - **The one producible output is "Official eSTAR · 510(k) · IVD eSTAR"**, an FDA filing, on an EU IVDR project
     (`runs/ivd-screen.txt`).

   This is M3 as the study recorded it, now seen live. M3's server half landed this morning. Its UI half reaches an
   assembler that runs per sequence (`/sequences/:seqId/technical-file/assemble`), and a device project has no
   sequence. It is the coordinator's (R1) and the founder's (question 1, the device screens' design), and it is not
   done here.
3. **The editor.** The home filing's editing copy was created (**201**) with the Annex II outline (II.1, II.1.a …;
   `shots/10-…`). II.1.a, "Product name, general description, intended purpose and intended user", was started
   (**201**), written and saved with a reason (**200**), and the IVDR filing's II.1.a then held the text, `drafted`
   (`runs/ivdr-ii1a-write.json`, `shots/11-…`). So the editor-to-filing path that slice 5 restored holds for an EU
   client too.

## At 390 px

The PMA and IVD screens clip their tab rows and stage strips at the right edge, with no horizontal scroll. The IVDR
project home clips its composer heading and step tabs (`runs/clipping-390.json`, `shots/12-…`, `13-…`). Slice 5
recorded the same on the 510(k) screen and handed it to the coordinator (`styles/app-v2.css`).

## What only the running app showed, and what was done

| # | Finding | Done |
|---|---|---|
| 1 | **M18.** The PMA screen's modules grouped the organization's legacy 510(k) sections (`cerv2_510k_sections`, no project link) by a kit taxonomy. A project whose B.2 was written and exported read "0 documents total". A project with no PMA document showed every module "complete". | **Fixed**: the cards read the PMA mapper over the project's own PMA document. A malformed answer is a failed read, not a crash (`../2026-11-02-m18-pma-modules-own-document/`). |
| 2 | **M19.** The PMA mapper's title matchers also fired on the governed pack's lettered leaves. An approved SSED (B.1, B.2, B.5, B.6) counted modules 2, 4 and 5 present with C, F and G empty, in every verdict that reads it. | **Fixed**: a lettered leaf is placed by its letter (`../2026-11-02-m19-pma-mapper-places-by-key/`). |
| 3 | **M20.** The PMA trial cards bind a study by product-name `ILIKE` across the organization when the project names none, and do not say which. This walk had no study, and the cards read "No study linked". | Recorded in the study. |
| 4 | **M21.** The draft package is named after the class and type the kit derives (`deriveCode`): `pma_pma-content-package-draft.zip` here, `Class_II_510k_content-package-draft.zip` in slice 5. It is not named after the project, so two projects' packages download under one name. | Recorded in the study. |
| 5 | **M22.** An EU IVDR project's facts panel lists Product code, Regulation, Review panel and Predicate, the FDA 510(k) facts, as "not recorded" (`shots/08-…`). | Recorded for the coordinator (the project home is theirs, beside M15). |
| 6 | M3, live: the IVDR door's screen asks AnA to assemble, and offers only an FDA 510(k) eSTAR. | Recorded above. The UI half waits on R1 and the founder. |
| 7 | 390 px clipping on the PMA and IVD screens and the IVDR project home. | Already handed to the coordinator (slice 5). |

## Not walked here

- The official eSTAR's PDF for the PMA needs the vendored template's field map. The screen reads "3 of 8 fields have
  a governed source", and its refusal is pinned by slice 3's tests.
- The EU technical file's ZIP needs a sequence, which a device project has none of (M3).
- De Novo has no pathway door (M7).
