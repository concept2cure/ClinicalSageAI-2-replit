# D2: the CSR document's build section opens on the build the document imports from (2026-11-12)

Launch row D2, ledger package L1. Found walking the Lumen LMN-201 report toward its filing
(`../2026-11-12-send-drafts-for-review/README.md`, "Found on the way").

## What a person met

A document takes its imported sections from one build (`IMPORT_TARGET_BOUND_TO_OTHER_BUILD`). The Lumen report holds
sections imported from build 16, and builds 17 and 18 were made after it. The build section opened on the newest,
build 18. A person who sent and approved build 18's headings was refused at the import, after the work, and nothing
on the screen said beforehand which build the document was bound to.

## What already exists (RULE 3)

Nothing new was built: no route, mount, service or table. The existing list read gained one optional parameter and
one field, read by a function split out of the query the import already ran.

| Path | What it does today | What it did not |
|---|---|---|
| `server/services/authoring/csr-import-into-document.ts` `earlierImports` | Reads the import's own audit rows and refuses a second build | Was private to the import |
| `GET /api/csr/jobs?programId&runId` (`server/routes/csr-jobs.ts`) | Lists the builds of one frozen study data, newest first | Knew nothing of the document asking |
| `client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx` | The build section in the CSR document; a picker when there are several builds; explains the refusal after it happens | Opened on the newest build |

Searches run: `csrBuildImport`, `BOUND_TO_OTHER_BUILD`, `earlierImports`, `csr/jobs?` across `server/` and
`client/src/concept2cure`.

## What changed

- `csr-import-into-document.ts`: the audit-row read is `buildImportRows`, used by the import as before and by the
  new `csrBuildOfDocument`, which answers the one build a document holds imported sections from, or none. A document
  in another organization or another project answers none.
- `GET /api/csr/jobs` takes an optional `documentId` and then answers `documentBuild` beside `jobs`. A `documentId`
  that is not a document id is refused 400 `CSR_DOCUMENT_INVALID`. Without the parameter the answer is as before.
- The build section asks with its document. It opens on the build a person chose; otherwise on the document's build;
  otherwise on the newest. The picker marks the document's build "this document's sections".
- On the document's build it says "This document's imported sections come from this build." On another it says, as
  a note: "This document holds sections imported from CSR build 16. A document takes its imported sections from one
  build, so sections approved in build 18 cannot be imported into it."
- A `documentBuild` that is not a build number refuses the whole read, as a malformed build row does.

## Tests: red first, then green

- **Server, red:** `csrBuildOfDocument is not a function`; the list answered no `documentBuild`.
  **Green:** `csr-jobs-build-and-review.pglite.test.ts` (the parameter, its absence, a malformed id, none) and
  `authoringCsrImportIntoDocument.pglite.integration.test.ts` (two documents each answer their own build after a
  real import; another organization, another project and a document with no import answer none): 37 of 37.
- **Screen, red:** 3 of 4 cases in `__tests__/csrDocumentBuild.test.tsx` failed (the section opened on build 18).
  **Green:** 4 of 4. Every test file that mounts the build section: 16 files, 143 tests. Four of them pinned the
  list's exact address and now name the document in it.
- No file gained a lint warning (`csr-jobs.ts` had 1 and has 1). A targeted `tsc` reports nothing.

## Opened in the running app

The stack as a Codespace builds it, in the Lumen account, as the Lumen lead, on the LMN-201 report.
`document-build.cjs` is the walk; `document-build.json` is what it read.

- The section opens on **build 16**, "69 of 119 ICH E3 headings drafted · 4 approved", with "This document's
  imported sections come from this build." (`opens-on.jpg`). Before this change it opened on build 18, "0 approved".
- Choosing build 18 shows the note above (`another-build.jpg`).
- No failed request and no console error.

## Limits, stated

- **The rule itself is unchanged**: a document still takes its imported sections from one build. A report whose
  build needs redrafting is corrected in the document, or a new report is started for a new data cut.
- **A newly queued build is still shown when a person starts one** (the section follows the build just started).
  The note then says its sections cannot be imported into this document.
- **During this work a push's typecheck read a half-written test in the working tree and refused.** Nothing reached
  the trunk. Recorded because the cause was this session editing while its own push ran.
