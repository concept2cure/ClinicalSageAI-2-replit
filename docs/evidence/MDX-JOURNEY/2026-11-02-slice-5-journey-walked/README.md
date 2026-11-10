# MDX journey slice 5: the device journey, walked in the running app

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md`, slice 5 (L1). RULE 4: a screen is not done until it was
opened in the running app and used. Plan: F1 for the fixes this walk made.

## The install, and how it was walked

- **Database.** PostgreSQL 16 with pgvector (`apt-get install postgresql-16-pgvector`), built from empty by
  `scripts/db/provision-test-db.sh` (`install-fresh`, then `deploy-migrate`): 1,281 tables, and the `app_service` role
  checked.
- **Server.** `server/index.ts` in development on `:5000`, against that database, with `RLS_ENFORCE=on`. At boot it
  seeded the regulatory templates, including the corrected `fda_510k_se` (M5).
- **Account.** `scripts/seed-admin.mjs` (JM Smith, the built-in local development login).
- **Browser.** Playwright, through the real sign-in page and the real screens. Every non-GET request to a
  conversation endpoint was aborted and recorded, so no model was called and no key was spent. The one change to the
  data outside the product is the direct database edit in step 6, which is the case P-29 guards.

## What already exists (RULE 3)

The study's inventory (`.design/client-journey/MDX_JOURNEY_2026-11-01.md` §1–6) and the slices before this one:
slice 1 (M1, M2, M10), slice 2 (M5, M6(c)), slice 3 (the eSTAR exits ask the filing), M3's server half, M11, and M8.

## The walk, at 1440 px

1. **New project** (`shots/01-…`). Medical Devices → 510(k) Premarket Notification → the device's details (product
   code FRN, 21 CFR 880.5725, predicate K192345, Class II, indications) → Create project. `POST /api/c2c/projects`
   answered 201.
2. **Project home** (`shots/02-…`, `03-…`). Plan reads "What this 510(k) needs" (M10). The work rows (design controls,
   risk, labeling, submission assembly, registration & UDI, …) each open with their doors.
3. **The doors** (`runs/doors-1440.json`). Each opens its screen on this project:
   - "Write the label and IFU" opens Labeling, whose empty state renders its action (M8, `shots/04-…`). "Ask AnA to
     start it" opens the project's conversation, marked "From Labeling" with "Back to Labeling", and puts the ask in
     the composer for the user to send. Nothing is sent on their behalf (`runs/labeling-ask-composer.json`).
   - "Assemble the eSTAR" opens the 510(k) screen, whose eSTAR list is the 38-node v1.1 outline (`shots/05-…`).
   - "Build the risk file and design-control trace" opens Engineering (`shots/06-…`).
   - "Check each label's UDI" opens UDI (`shots/07-…`).
4. **A document from the template** (`shots/08-…`). New document → "FDA 510(k) — Substantial Equivalence package".
   Its sections are B1, C1, C2, E5, E1, E2, D2, E7, the outline's own keys (M5).
5. **Into the filing.** It could not be filed, until this walk's fix (below). With the fix, the editor offers the home
   filing's "Create editing copy". The copy is created bound to the filing (201), B1 is started from the outline, and
   it is written and saved with a reason for change. The filing's B1 then holds the text
   (`../2026-11-02-home-filing-editing-copy/`).
6. **The eSTAR exits ask the filing (slice 3), end to end:**
   - Export 510(k) package while the filing agrees: **200**, `filingAgreement: { compared: true, unfiled: [] }`, and
     the ZIP is downloaded (`runs/export-1-…`).
   - The filed B1 is rewritten directly in the database, attributed and with a reason as the section-version trigger
     demands. Export: **409 `FILING_DIVERGED`**. The screen says "Export failed — Nothing was built. The filed copy of
     section B1 is not the document's text. … Open that section and choose Re-file saved text, which restores the saved
     text to its filing." (`runs/export-2-…`, `shots/10-…`).
   - The remedy as written: B1 → **Re-file saved text**, a governed action with a reason and a typed confirmation
     (`shots/11-…`). Answered 200, `refiled: true, revision_created: false` (`runs/refile.json`).
   - Export again: **200** (`runs/export-3-…`).

## At 390 px

Labeling, Engineering and UDI hold (`shots/14-…`). The project home and the 510(k) screen clip content at the right
edge, with no horizontal scroll (`runs/clipping-390.json`, `shots/12-…`, `13-…`). On the project home that's the
composer, the indication line and the step tabs; on the 510(k) screen, the tab row and the seven-stage strip.

## What only the running app showed, and what was done

| # | Finding | Done |
|---|---|---|
| 1 | **A new project's home filing could not get its editing copy from any screen** (since `31a5453861`), so no section reached any new project's filing, for every client type. | **Fixed**: `../2026-11-02-home-filing-editing-copy/` (`bda1d5aed1`). |
| 2 | The seeded 510(k) template's stored order was its old reading order, not its codes', so every new document warned that it "assembles and exports in the stored order" (`shots/08-…`). | **Fixed** here: the seed is in the outline's order, pinned by `template-510k-files-under-its-own-heading.test.ts` (red `template-order-red.txt`, green `template-order-green.txt`). After a restart the seed re-applied to the existing database, and a new document has no warning (`shots/09-…`, `runs/template-order-after.json`). |
| 3 | A working document's advice, "place the document into a filing", leads to the eCTD placement dialog, which on a device project has no submission and refuses "B1" as "not a CTD section code". | Handed to the editor's design lane (COORDINATION.md). With finding 1 fixed, the right path, the home filing's copy, is offered beside it. |
| 4 | 390 px: the project home and the 510(k) screen clip content. | Handed to the coordinator (`styles/app-v2.css` is held there); the device screens' design is the study's founder question 1. |
| 5 | A device 510(k) project's Author tab offers "Write the protocol in the protocol workspace", and its work areas list Biostatistics. | Recorded for the study, next. |
| 6 | Engineering's "What's blocking your documents" tags every eSTAR node "DHF", the cover letter included, and its zero "Open risks" card is red. | Recorded for the study, next. |
| 7 | UDI's empty state is the passive instruction M8 fixed on Labeling ("appear here once labeling documents are created", with only "Check again"). | Recorded for the study, next (M8's pattern applies). |
| 8 | The wizard and the editor name the outline "eSTAR (nIVD/IVD v7.0)". The version-currency check holds 7.1 as FDA's current nIVD version. | Recorded. The vendored template's currency is already a blocker the readiness verdict states. |

Environment, not defects: predicate intelligence (`/api/predicate-intelligence/*`) is not deployed locally and
answers 503, and openFDA is not reachable from this container. The 510(k) screen says so in both places
(`shots/05-…`). The dev server's per-boot secret ends sessions on restart.

## Not walked here

M1's document rows on Engineering and UDI need engineering artifacts and labeling records, and a new project has
neither. Their behaviour is pinned by `deviceDocumentRowsOpen.test.tsx`. The official eSTAR's section attachments need
the vendored template's field map; their refusal is pinned by `estar-exits-ask-the-filing.pglite.test.ts`.
