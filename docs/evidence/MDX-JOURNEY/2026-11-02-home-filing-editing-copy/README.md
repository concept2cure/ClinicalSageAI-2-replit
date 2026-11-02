# The home filing's editing copy can be created again

Found walking the MDX client journey in the running app (slice 5, 2026-11-02), on a new 510(k) project created
through the real wizard. Plan: F1. It affects every client type, not only devices.

## What already exists (RULE 3)

- **The binding.** `server/services/authoring/authoring-documents.ts` (`resolveBinding`). Since `31a5453861`
  (2026-11-01), a document is bound to a filing only when its create names it (`POST /api/authoring/docs` with
  `c2c_document_id`). Every other create is a working document of the project (`WORKING_DOCUMENT_REASON`). That fixed
  a real defect: a protocol took an IND filing's slot.
- **The one create that names a filing.** The editor's filing list (`client/src/concept2cure/v2/editor/FilingMarkets.tsx`,
  F22b) offers "Create editing copy" through `useCreateMarketCopy`, for a market added to the project.
- **The section start.** `startOutlineSection.ts` creates a section from the filing outline, only inside the
  filing's editing copy.
- **The remedy.** The editor's "Re-file saved text" (`AuthoringRefileSavedText.tsx`).

## The defect

After `31a5453861`, nothing in the product could create the editing copy of a project's home filing:

- `FilingMarkets` returned nothing when a project had no added market, which is the normal case.
- Where it did render, the home filing's row said "Shown in the outline" when no document was open. It said
  "No editing copy yet" otherwise, and offered no create.
- The list was not rendered at all while a working document was open, which is where a new project lands after
  "New document".
- The rail's advice for a working document, "place the document into a filing", leads to the eCTD placement dialog.
  On a device project that dialog has no submission to place into, and refuses "B1" as "not a CTD section code"
  (`live/before-1-…png`).

So no section could reach a new project's filing: no draft package, no eSTAR attachment, no readiness from authored
content. In the running app the project's filing had 38 nodes and no bound document (`live/before-facts.json`:
`createEditingCopyButtons: 0`).

## The change

`FilingMarkets.tsx` (and the one call site in `DocumentWorkbench.tsx`):

- The home filing with no editing copy offers **Create editing copy**, the existing control. Its create names the home
  filing and no CTD module, since the home filing holds the whole filing. A market's copy is unchanged (Module 1).
- The list renders for a project with no market when the home filing lacks a copy. While a working or pinned document
  is open (`quiet`), it lists only that home filing, so the create is always reachable. Once the copy exists, nothing
  changes from before.
- "Shown in the outline" is said only of a filing whose copy exists.
- A home filing read with no agency or class recorded is named by its title. The toasts no longer read
  `agency.toUpperCase()` unguarded; the editor suite found that crash (`documentAuthoringEditor`, null/null basis).

## Proof

- **Tests.** `client/src/concept2cure/v2/__tests__/editingCopy.test.tsx`. Red before on the two defect cases
  (`red.txt`); green after, with the existing outline-per-market suite (`green.txt`). One existing assertion was
  scoped to the market row it is about. Its fixture's home filing has no copy, so it now rightly offers one.
- **The editor's 74 suites** (883 cases): 3 fail, and the same 3 fail with HEAD's editor sources
  (`specialistRecoveryInteraction`, `specialistHandoffInteraction`, `draftClaimsLine`). They are not this change's.
- **In the running app** (PostgreSQL 16 provisioned by `scripts/db/provision-test-db.sh`, the dev server, Playwright):
  1. The editor, with a working document open, lists "FDA · K510 — home filing" with **Create editing copy**
     (`live/after-1-…png`).
  2. Clicking it: `POST /api/authoring/docs` naming `c2c_document_id` and `module: null`, answered 201
     (`live/after-requests.json`). The outline's B1 then starts a section in that copy (201).
  3. B1 written and saved with a reason for change: `PATCH /api/authoring/sections/:id` 200, and the filing's B1 holds
     the text (`live/after-save-request.json`, `live/db-rows.txt`).
  4. The device exits then work end to end (slice 5's evidence): the draft package builds, refuses a rewritten filed
     copy, and builds again after Re-file saved text.

## Not done here

- The rail is narrow, so "FDA · K510 — home filing" wraps beside its button. That's layout polish for the editor's
  design lane.
- The data repair that `31a5453861` left unrun is outside this change.
