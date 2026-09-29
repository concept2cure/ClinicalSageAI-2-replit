# PF-07 (D2): no project, no record: an Authoring document and a Data Room source belong to a project; one audited adopt; identity per project

**Founder decision, 2026-09-26:** every governed record belongs to a project. See
`docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §6.

## The defect

`POST /api/authoring/docs` accepted a document with no project. It was then
created org-wide, where no project ever listed it. The Authoring surface did the
same whenever no project was open. The launch-demo packs even fell back to an
org-wide create on a refusal. Separately, `POST /api/authoring/docs/from-draft`
checked only that its `programId` looked like a UUID, so a draft could be filed in
another organization's project. That was an LX-20 copy.

## The fix

- **Server, `createDocument`.** A create with no project is refused with 400
  `PROJECT_REQUIRED` ("Open a project first: a document belongs to a project.").
  The route carries the code in the body. A named project must still be a live one
  of the organization (LX-20).
- **Server, `createDocumentFromDraft`.** The project must be a live one of the
  organization, or the draft is refused 404 and nothing is written.
- **The AnA canvas tool.** It already refused with no project open; unchanged.
- **Client, `AuthoringCreateExport`.** With no project open, New document is
  disabled, and a visible hint says why. A create is refused before any request.
  A document is always created in the open project, read through
  `readShellProject`, the one reader of the shell's project.
- **Client, `saveToAuthoring` (`authoringHandoff.ts`).** This is the one handoff
  that eight buttons use to send work to Authoring: Biostatistics (twice), the
  Biostat workbench, CMC Quality, the CMC module (twice), the Report Engine and
  the PV cockpit. It too created org-wide whenever no project was open, and it
  read `window.C2C_PROJECT` directly. It now refuses before any request, and its
  message keeps its contract: "Nothing was saved; … is still here". It creates in
  the open project only.
- **One reader of "which project is open".** `shellProgramId()` in
  `shellProject.ts` returns the open project's `regulatory_programs` UUID, or
  null. A legacy numeric workspace id is not a project. Both client create paths
  use it; neither keeps its own copy. The create control reads it through
  `useShellProject`, so the control follows a project switch.
- **`scripts/seed-authoring.mjs`.** It requires `PROGRAM_ID` and exits 2 with the
  reason when it is missing. Without it, the first create would be a 400.
- **Demo packs (`mdx.mjs`, `biotech-authoring.mjs`).** They create documents in
  the program only. The org-wide retry is gone: a second document in a program is
  created in it, unbound, with the reason stated. So the 409 it routed around no
  longer arises, and it is reported as a finding if it does.

## Tests

- **`client/.../authoringCreateExport.test.tsx`.** Two new cases:
  - with no project, the control is disabled and says why, and nothing is posted;
  - a create names the open project.

  The existing cases now open a project. Result: 11 of 11.
- **`authoringHandoff.test.ts`.** Every case opens a project. New cases:
  - a create names the open project;
  - with no project open, or a numeric workspace id, nothing is posted and the
    work stays.
- **`biostatAttachHonesty.test.tsx`.** Every case opens a project. Without that,
  the filing write is never attempted, and the refusal and transport cases would
  pass for that reason alone. New case: with no project open, nothing is filed,
  no filing is reported, and the surface says why.
- **`server/routes/__tests__/authoringFromDraft.pglite.integration.test.ts`.**
  Another organization's project is refused 404 with nothing written. It answered
  201 before the fix.
- **Nine suites that created documents with no project.** They failed once the
  refusal landed, which is the refusal working. Each now seeds a live project of
  its organization and names it. No assertion was weakened; this was checked
  adversarially per file by a verifier agent. The suites:
  - `authoringBindingColumnGuard` and `authoringBindingColumnStates`;
  - `authoringFileToVault` and `authoringTemplateStartFrom`;
  - `authoring-program-scope`;
  - the IND authoring journey;
  - the authoring review-audit, section-commits-to-filing and section-permissions
    contracts.

- **Verifier findings, taken.** The adversarial check of the nine suites raised
  three points:
  - **The route dropped the refusal's code.** `POST /docs` answered
    `{ success: false, error }` without it. It now forwards `code`
    (`PROJECT_REQUIRED`) beside the message, and three suites assert it.
  - **One exclusion was no longer tested.** Legacy rows with no project still
    exist in deployed databases (PF-07 refuses new ones; it does not backfill).
    `authoring-program-scope` no longer proved that no project's list shows them.
    It now writes one directly, and asserts that neither project's list shows it
    while the organization's unfiltered list does.
  - **A failing count could read as a block.** The IND journey's
    `create-doc-without-project` counted rows inside `expectBlocked`, which files
    any thrown error as the block. The counts now run outside it.

  Each new assertion was shown failing on its mutant:
  - with the router's `code` forwarding removed, 3 suites fail;
  - with the list filter widened to `= $n OR client_program_id IS NULL`,
    `authoring-program-scope` fails on "Legacy org-wide doc".

- **Three more client suites** (`openInEditorHandoff`, `biostatWorkbench`,
  `cmcCorrCrossLinks`). They drove `saveToAuthoring` with no project open, and
  the full run found them.
  - Each now opens a live project and asserts the create names it. Each adds
    no-project cases: nothing posted, no success claimed, the refusal said. For
    CmPathway, the question also stays OPEN.
  - An adversarial verifier checked each file: no assertion weakened, and each
    file fails with a numeric workspace id or with the handoff's refusal
    removed. Results: 20/20, 56/56, 23/23.
  - Known gap: the CMC change screen's own "Open in editor" button (CmChange,
    `CmcModule.tsx:2083`) has no no-project case. `openInEditorHandoff`
    covers the CmcModule change simulator.
- **The empty states' "New document"** raises an event, not a click. The
  listener opened the form with no project, only for the submit to be refused.
  Found by the review of this change. It now says why and opens nothing.
  `authoringCreateExport` covers both event paths, and the no-project one fails
  with the guard removed.
- **Real database.** `tests/db/authoring-section-concurrency` and
  `authoring-stability-table` created documents with no project. Each now
  upserts a live program for its organization, names it, and deletes it after.
  - `01c-red-dbtests.txt`: trunk's versions against this change on real
    PostgreSQL, 7 failures.
  - The whole `tests/db` tier passes on a deploy-shaped PostgreSQL 16: 70/70
    files, 755/755 tests (PF-04 evidence, `03-real-postgres.txt`).
- **The MDX demo pack** restated a finding that its SE Discussion and
  Cybersecurity Summary were "created org-wide, unbound". Nothing is created
  org-wide now, so the stale finding is removed.

# Slices B, C and D: the Data Room

## The defects

- **A chat file with no project open became an org-wide source.** It got an
  org-wide `cre_evidence_sources` row that no project listed. The upload route's
  own comment defended this: "a file attached in chat without a project still
  deserves an identity".
- **A failed source write still reported success.** A project-scoped upload whose
  source could not be written answered 200 "ready" with `sourceId: null`.
- **Identity was resolved across the whole organization.** The checksum lookup was
  not scoped to the project, so the same file dropped into project B resolved to
  project A's source and was listed only in A. This is PF-07 (2) and VR-10: the
  plan's proposal, two source rows sharing the bytes, is taken with the founder's
  PF-07 decision.
- **There was no way to bring a conversation file into a project.**

## The fix

- **B, `server/routes/chat/upload.ts`.**
  - The identity block runs for project-scoped uploads only. With no project open,
    the bytes and the `file_uploads` row are kept as a conversation file, and the
    response says so: `dataRoom: { recorded: false, reason }`.
  - A project-scoped source that cannot be written answers 503
    `SOURCE_NOT_RECORDED` with the `fileId`. It never answers 200 "ready".
- **C, `POST /api/c2c/projects/:id/adopt { fileUploadId }` (`projects.ts`).** It
  runs as one transaction:
  - the live project is locked, and the program mutation rule applies;
  - the file must be the caller's organization's, and it must carry its checksum;
  - the same bytes already in the project are that source (200, nothing written);
  - otherwise the project's source is created (`origin: 'adopt'`), together with
    a `c2c.project.adopt` audit row, and the route answers 201.
- **D, `findSourceByChecksum`.** It takes the project scope (`clientProgramId`,
  `clientWorkspaceId`), and the upload passes it. The same bytes in two projects
  are two sources.

## Tests

- **`tests/routes/chat-upload-source-identity.test.ts`.**
  - No project open: no source is looked up or created, and the response says why.
  - The lookup is scoped to the project, for the workspace and the UUID id-spaces.
  - A failed scoped write answers 503 `SOURCE_NOT_RECORDED`.
- **`canonical-source-identity.pglite.integration.test.ts`** (real SQL): the same
  checksum in project A is found for A and not for B.
- **The LX-00 walk's new `adopt` hop:**
  - an unscoped upload records no source;
  - one adopt gives one source keyed to the project, plus one audit row;
  - adopting again gives 200, with no second source and no second audit row.
- **Upload suites.** `chat-upload-wiring`'s three checksum cases now upload into a
  project, since their subject is content identity. `chat-upload-to-memory` stubs
  the source service, since its subject is the memory atom. With the real service
  on its stub pool, the write fails and the route now, correctly, answers 503.
- **`01-red.txt`**: every new case above, plus slice A's, against the source
  before the change: 7 failures across 5 files.
