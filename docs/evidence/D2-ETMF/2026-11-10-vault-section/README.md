# The trial master file: one client of `/api/etmf`, hosted by the eTMF page until it is admitted to the Vault

2026-11-10. Row D2 (the launch catalog). Decisions P-74 and P-75. Design:
`docs/design/ETMF_CONVERGENCE_2026-10-30.md`. Client only; the server half is `64e4bcca0a`
(`docs/evidence/D2-ETMF/2026-11-10/`). Built by an agent of session `…01KnUGoX3g`; reviewed, re-run, opened in the
running app and committed by the session.

## Where it stands

**On trunk with this change.** The trial master file section (`surfaces/VaultTrialMasterFile.tsx`) is the one client
of `/api/etmf`. The `etmf` surface hosts it: `surfaces/Etmf.tsx` is now a thin page (the way back to the project,
the title, the section for the open project, an empty state when no project is open, what AnA can see). The Vault's
header button is named "Trial master file" and opens that page, where it can be opened. The screen `Etmf.tsx` used to
be is retired, with its styles and its three test files.

**What the retired screen showed is carried in the section (third change, P-122).** The second change retired the
screen and listed five things as "not carried". The founder's decision P-122 (2026-11-10) says "Where §2's
minimalism and a customer seeing their own work conflict, the work wins" and "No session removes, hides, moves below
the fold, or puts behind a closed disclosure a metric, workflow, verdict, action or record a screen showed, without
a founder decision." So the section now carries them: the scope (essential records or all records), the three
figures, each record's code and zone, upload and file in one step, the inspection package shown as a document, and
the question to AnA. What "filed" rests on, which the second change put behind a closed disclosure, is a visible
line. They are in the section and its sibling files, not in the page, so they go into the Vault with it at
admission. Two things are not restored, each a decision the session records: the report built in the browser when
the ZIP failed, and "Open in Project management". The table below says where each thing is now and the test that
holds it.

**Applied at admission, 2026-11-12** (`docs/evidence/D2-ETMF/2026-11-12-admission/`). The hook-in is in
`client/src/concept2cure/v2/surfaces/Vault.tsx`, shown only where the organisation can use the eTMF, and the held suite
is `client/src/concept2cure/v2/__tests__/vaultTrialMasterFile.inVault.test.tsx` with three more cases (the release
lock, the plan lock, and the Vault opened by the eTMF's page). The two files under `held/` were deleted in that
change, so that no later session applies them a second time. What follows describes them as they were.

**Held until the eTMF is admitted to the Vault app.** The hook-in that puts the section in the Vault's Required
documents view (in `Vault.tsx`: one import, one element after `VaultCoverage`, the header button's handler), and the
cases that need it (five since the third change). Both are kept in this folder, out of the build:
`held/vault-hook-in.patch` (checked with `git apply --check` against `Vault.tsx` at HEAD `673f0d9fff`) and
`held/vaultTrialMasterFile.inVault.test.tsx.held`. **The third change updated both**: the section gained two
optional props a host passes, so the hook-in now passes the Vault's `onAsk` (the question to AnA is asked in the
Vault's own conversation) and `onVaultChanged={() => setVaultEpoch((n) => n + 1)}` (a file the section's filing form
adds to the Vault is read back into the Vault's own lists), and the held test has a case for each.

**Rebuilt 2026-11-12** (`26-hook-in-rebuilt-2026-11-12.txt`). `Vault.tsx` had moved on: the Required documents view
gained `sectionName`, and the header's actions are shown only with a project open. So the patch no longer applied.
It is rebuilt against `Vault.tsx` at `c3e5808c45`, with the same three changes, and `git apply --check` passes. With
it applied, the held suite's 5 cases pass, and 838 of the 840 Vault and eTMF client tests pass. The 2 that fail are
`etmfHostsTrialMasterFile.test.tsx`'s Vault-button cases. They pin the button opening the hosting page, and they
exist to catch the Vault hosting the section before admission. **At admission they retire, replaced by the held
suite.**

**Why the Vault does not host it yet.** In the Vault the section makes a launch screen call `/api/etmf`. Only the
`etmf` surface claims that prefix and `etmf` is outside the launch scope, so `ci:launch-scope-api` fails
(`05-gates.txt`) and a release would refuse every read. P-75 admits the eTMF by the Vault app gaining the `etmf`
surface, and P-74 allows that only with one TMF store, a URS and an OQ. Until then the server's contract has
changed (a filing belongs to a study of the project and needs a reason), and the old screen could no longer file;
keeping it beside the section would be two clients of one store.

## The decision

The founder, 2026-11-10: "I don't see the TMF on the vault UI anywhere. The vault UI seems to be lacking in a lot of
ways." The founder did not recognise the Vault's "Inspection readiness" button as the trial master file.

P-75 puts the eTMF inside the Vault and files it against the project's protocol-design study. The section is built
for the Vault's Required documents view: a section of that view, not a tab, a screen, a card or a surface id (RULE
4). `ci:one-product` reports "101 surfaces, 11 rail entries, none new".

## What already exists

Searches run, in `client/src`, `server/routes`, `server/services`, `shared/` and `migrations/`: `etmf`, `tmf`,
`trial master file`, `inspection readiness`, `inspection-package`, `completeness`, `tmf_artifact`, `study-design`,
`program_id`, `VaultVersionPicker`, `GOVERNED_REASON_MIN`, `readFailureFor`, `useVaultCanWrite`, `scrollIntoView`,
`ProjectBack`, `usePublishSurfaceContext`, `etmf-` (class names). Deleted history:
`git log --all --diff-filter=D -- '*tmf*' '*Tmf*' '*TMF*' '*etmf*' '*Etmf*'` (the clone is shallow).

For the third change, also: `/api/vault/ingest`, `useVaultUpload`, `sendIngest`, `VAULT_INGEST_DOCUMENT_TYPES`,
`tmfCodeToIngestType`, `ingestType`, `documentType` (a shared mapping from a record to an ingest type: none exists),
`VAULT_UPLOAD_ACCEPT`, `ana-hidden-input`, `cm-doc`, `className="seg"`, `vd-dr-stages`, `.mono`, `scope=all`,
`onAsk`, `I.sparkles`, and the old screen itself (`git show bb17f97b77:client/src/concept2cure/v2/surfaces/Etmf.tsx`)
with its test `etmfFilingPayload.test.ts`. The rows from `useVaultUpload.ts` down are what the third change found.

| Piece, by path | What it does | What it does not |
|---|---|---|
| `client/src/concept2cure/v2/surfaces/Etmf.tsx` (surface `etmf`, `surfaceViews.ts:310,460`) | Until this change, a screen of its own: completeness for a trial id typed by hand, a punch-list, attach and file, the inspection package. | It bound to no study of the project and sent no reason, so it could no longer file. Retired here; itemised below. |
| `server/routes/etmf.routes.ts` on `/api/etmf` | Completeness, filings list, file, remove, inspection package, per study of a project, with a reason on each write (`64e4bcca0a`). | — |
| `server/services/etmf/tmf-completeness.ts` | `assessTmfCompleteness`, `TmfCompletenessResult` (`ready: boolean \| null`, zones, `unverified`). | — |
| `shared/constants/domain/tmf-reference-model.ts` | The one catalog: 11 zones, 41 records, 26 essential; `tmfArtifactName`. | — |
| `GET /api/study-design?program_id=` (`server/routes/study-design.ts:565`) | Lists the project's protocol-design studies. Client readers: `mdx/hooks/useStudyDesign.ts` (its `StudyDesignRow` type is reused), `ProtocolDevDesign.tsx:80`. | `useStudyDesign` reads with a bare `fetch`, drops the read's status and code, and takes a 200 with no `designs` as "idle", not as a failed read. So it is not used; the read is `useLiveData` with a guard. |
| `surfaces/VaultCoverage.tsx` | The Required documents view's one section, and the section, row and note classes reused. | Nothing about a study's records. |
| `surfaces/VaultLibraryResults.tsx:512` `VaultVersionPicker` | Picks one Vault version by search; with `programId`, from one project's Vault. | — |
| `surfaces/VaultViewOnly.tsx` | `useVaultCanWrite`, and the "View only" line. | — |
| `surfaces/VaultVersionRestore.tsx`, `shared/constants/governed-reason.ts` | The Vault's inline reason form and the 8-character floor. | — |
| `mdx/hooks/useFetchJson.ts:214,253`, `v2/dataConnect.tsx:570` | `readFailureFor`, `describeReadFailure`, `readRefusalWords`: the one read classifier. | — |
| `v2/assessmentState.ts` | `assessmentStateFor`, `mayReassure`: only an assessment that ran and found nothing open may read clear. | — |
| `v2/dataConnect.tsx:841`, `:702`; `v2/shellProject.ts:379,409`; `v2/surfaceContext.ts:188` | `ProjectBack`, `EmptyState`; `useShellProject`, `shellProgramId`; `usePublishSurfaceContext`. The page is made of these. | — |
| `surfaces/vaultArchiveDownload.ts`, `v2/download.ts` | `sha256Hex`, `downloadBlob`. | `saveVerifiedArchive` reads `X-Content-SHA256`; the package states `X-TMF-SHA256`, so the check is made in the section with `sha256Hex`. |
| `shared/constants/domain/vault-taxonomy.ts:270` | TMF zone folders for the Vault's CRO/service view. | A folder structure, not what is filed or missing. Not touched. |
| `client/src/concept2cure/v2/fixtures/etmf.ts` | Deleted by `3fa2b6febc` (E1): the client's copy of the catalog. | Not brought back. Nothing else only the old screen used remains but its styles (below). |
| `client/src/concept2cure/v2/useVaultUpload.ts` (`vaultIngestTransport.ts`, `vaultIngestReceipt.ts`, `vaultUploadVisit.ts`) | The one upload path: `upload(files, { documentType, onFileStatus })` posts each file to `POST /api/vault/ingest` for a project, checks the receipt, and returns per file the document id recorded, or the refusal, or that the outcome is not known. Used by the Vault, the MDX Document vault and the MDX pathway attach. | The old screen had its own copy of this request (`Etmf.tsx:364-375` at `bb17f97b77`). The section calls the hook; no second uploader is written. |
| `shared/constants/domain/vault-taxonomy.ts:72` `VAULT_INGEST_DOCUMENT_TYPES` | The types the ingest accepts. | No function maps a TMF record to one. The old screen's `tmfCodeToIngestType` (`Etmf.tsx:325-331`) was the only mapping and went with the screen; it is `tmfIngestType` in `surfaces/vaultTmf.ts`, the same rule. |
| `server/routes/etmf.routes.ts:150,262` | `?scope=all` on completeness and on the inspection package: all 41 records. The answer states its `scope`. | Served since before this folder; no client asked for it after the second change. |
| `server/services/etmf/tmf-inspection-package.ts` | What the ZIP holds (`manifest.json`, `completeness.json`, `inspection-index.csv`, `README.txt`) and its file name, `tmf-inspection-<studyId>.zip`. | Its completeness is as of the download. The document on screen is the section's read, and says so. |
| `styles/coverage-v2.css:406-422,859-872` `cm-doc`, `cm-doc-bar`, `cm-doc-kind`, `cm-doc-bar-r`, `cm-doc-body`, `cm-doc-render` | The document frame, also used by `SafetyNarrative.tsx`, `CmcQuality.tsx` and `IndLifecycle.tsx`: a bar, a page, tables. | `cm-doc-render` styles `h1` and `h2`; under the section's `h2` the package's headings are `h3` and `h4`, so two rules give them their size (`.vd-tmf-pkg`). |
| `styles/app-v2.css:349` `.seg`, `.seg-b` | The segmented control (`Review.tsx:143`, `Projects.tsx:1654`). | — |
| `styles/misc-surfaces-v2.css:488` `vd-dr-stages`, `vd-dr-stage`; `app-v2.css:864` `.mono`; `app-v2.css:650` `.ana-hidden-input` | The Vault's plain figures (Data room: "Captured **n** › …"), its monospace for codes, and the hidden file input other composers use. | — |
| `v2/surfaceViews.ts:79` `onAsk` | The shell's conversation, given to every surface. The old screen used it as `const ask = onAsk` (`Etmf.tsx:114,467`). | — |

## What changed

| File | Change |
|---|---|
| `client/src/concept2cure/v2/surfaces/VaultTrialMasterFile.tsx` (new on trunk; split out of the Vault, in its folder) | The section. Since the first build: a filed record's document is named by the server's `document`; `documents` is optional; an optional `heading` and `onState` for its host; the study chooser stays one control (it keeps focus); the package button sits under the verdict. |
| `client/src/concept2cure/v2/surfaces/Etmf.tsx` | The old screen's 686 lines are gone. A page of about 100 code lines hosts the section for the open project and publishes its state to AnA. |
| `client/src/concept2cure/v2/surfaces/Vault.tsx` | The header button's visible text, "Trial master file", and its title. Nothing else: it still calls `onNav('etmf')` and is still shown only where `available('etmf')`. |
| `client/src/concept2cure/v2/styles/coverage-v2.css` | 74 lines are deleted: the `.etmf-*` rules, which only the old screen used, and their two comments. One other comment is reworded. |
| `client/src/concept2cure/v2/styles/surface-text-ramp.css` | Regenerated by `scripts/design/generate-surface-text-ramp.mjs` (it listed six of those classes). |
| `client/src/concept2cure/v2/__tests__/vaultTrialMasterFile.test.tsx` (new) | The section's 36 cases. |
| `client/src/concept2cure/v2/__tests__/etmfHostsTrialMasterFile.test.tsx` (new) | The page's 6 cases and the Vault button's 2. |
| `client/src/concept2cure/v2/__tests__/_vault-tmf-fixtures.ts` (new) | A small in-memory eTMF both suites and the held suite use. |
| `client/src/concept2cure/v2/__tests__/filingPathNoDeadEnds.test.tsx` | One case: it looked for "Inspection readiness" to show the door absent where `etmf` is locked, and would have passed for any reason once the button was renamed. It now looks for both names. |
| `etmfFilingPayload.test.ts`, `etmfHonesty.test.tsx`, `etmfReadinessNotDeterminedIsNotNotReady.test.tsx` | Deleted with the screen they pinned; see the table below. |

The third change (what the retired screen showed, carried in the section):

| File | Change |
|---|---|
| `client/src/concept2cure/v2/surfaces/VaultTrialMasterFile.tsx` | The section: the scope control in its heading row, the figures and the two plain lines under the verdict, each record's zone and code on its row, the question to AnA beside the package download, the package document beneath the records. Two optional props for its host, `onAsk` and `onVaultChanged`. A read asked for again is held as in flight from the commit that asks for it. Its reads, requests and words, and its two forms, moved out to the three files below; the file is 355 lines (it was 614). |
| `client/src/concept2cure/v2/surfaces/vaultTmf.ts` (new; split out of the section, in its folder) | The section's reads, requests and words, with no markup: the guards (an answer must name the scope asked for and state how many zones are complete), the one verdict and its sentence, the figures, the scope's words, the package download, the ingest type of an uploaded file, the question to AnA. |
| `client/src/concept2cure/v2/surfaces/VaultTmfFiling.tsx` (new; split out of the section, in its folder) | The two forms. Filing now takes either a version from the Vault or a file from disk, which goes through `useVaultUpload` into this project's Vault and is then filed. |
| `client/src/concept2cure/v2/surfaces/VaultTmfPackage.tsx` (new; split out of the section, in its folder) | The inspection package shown as a document, with the download in its bar; the download's one state, its button and its outcome, used under the verdict and in the bar; the figures line the section and the document both show. |
| `client/src/concept2cure/v2/surfaces/Etmf.tsx` | Passes the shell's `onAsk` to the section; the section's heading there is "Records" (it was "Essential records"); AnA is told the scope and the figures, and the acts restored. |
| `client/src/concept2cure/v2/styles/misc-surfaces-v2.css` | Seven rules under `.vd-tmf-*`, with tokens: the column the read's lines sit in, the code on a row staying on one line, the package's margin, its bar wrapping on a narrow screen, its `h3` and `h4`, and a code wrapping inside a table cell. Everything else is existing classes. |
| `client/src/concept2cure/v2/__tests__/vaultTmfRestored.test.tsx` (new) | 25 cases: the scope, the figures, the code and zone, the package document, the question to AnA. |
| `client/src/concept2cure/v2/__tests__/vaultTmfUploadAndFile.test.tsx` (new) | 12 cases: upload and file, with the real upload hook and its XHR boundary. |
| `client/src/concept2cure/v2/__tests__/vaultTmfModel.test.ts` (new) | 12 cases on `vaultTmf.ts`: the ingest-type mapping the deleted `etmfFilingPayload.test.ts` pinned, the figures, the scope's words, the one verdict. |
| `client/src/concept2cure/v2/__tests__/vaultTrialMasterFile.test.tsx` | 38 cases (36): the download's outcome is read beside the button that asked for it, under the verdict or in the document; what "filed" rests on is asserted to be outside any `details`; a download the server could not record is a case; "Try again" is asserted only where another try can change the outcome. |
| `client/src/concept2cure/v2/__tests__/etmfHostsTrialMasterFile.test.tsx` | 11 cases (8): the section asks AnA in the page's conversation; the scope AnA is told; a read that checked nothing has no figures. |
| `client/src/concept2cure/v2/__tests__/_vault-tmf-fixtures.ts` | The in-memory eTMF answers both scopes, refuses a filing against a document that is not in the project's Vault as the server does (`DOCUMENT_NOT_IN_PROJECT`), names the package as the server names it, and answers the Vault's ingest. |
| `held/vault-hook-in.patch`, `held/vaultTrialMasterFile.inVault.test.tsx.held` | The hook-in passes `onAsk` and `onVaultChanged`; two more held cases. |

What the section does:

- **Reads nothing until the view that holds it is first opened**, then keeps what it read.
- **Which study.** `GET /api/study-design?program_id=<project>`. One study is used and named. Several: a chooser,
  and nothing is read for a study until one is chosen; a study chosen next never shows the last one's verdict or
  failed read. None: "This project has no study yet, so it has no trial master file. A study is created in
  Protocol design, on the Study design tab of the project's protocol." A body that is not a list is a failed read.
- **Which records are checked.** "Essential records" or "All records", two options in the heading row, once a
  study is on screen; essential first. The scope is part of the read, so choosing the other shows "Reading the trial
  master file…" at once, never the previous scope's figures under the new label. It stays as chosen when another
  study is chosen.
- **The verdict in a sentence**, from `GET /api/etmf/trials/:studyId/completeness?scope=essential|all`: every
  (essential) record is filed; N of M are filed and K are missing; or not determined (the server's `ready: null`),
  which is never said as complete or incomplete. A read that listed nothing to check states no verdict, even where
  it calls itself ready. An answer with no stated verdict, one that names another study or another scope, or one
  that does not state how many zones are complete, is a failed read.
- **The three figures**, under the verdict, as plain words and numbers: "Zones complete 0 of 11 · Essential records
  filed 1 of 26 · Open records 25, 1 filed with no verified document". A count the server did not report is said as
  not reported. No figures where the answer has none to state. Then two plain lines: which records the scope
  checks and what "filed" rests on; and "Timeliness and quality control are not assessed: no filing lag and no QC
  state is recorded for trial master file records."
- **Ask AnA which gaps an inspector would raise**, for the study on screen, in the host's conversation: "Which trial
  master file gaps would an inspector raise for <study>, and how do I close them?"
- **The zones**, each with "n of m filed", then each record of the scope by its catalog name, followed by its zone
  and artifact code in the Vault's monospace ("Zone 1 · monitoring_plan"). A filed record names its
  document from `GET /api/etmf/trials/:studyId/artifacts`: the title and version the server found, "an earlier
  version" when a later one has replaced it, and the start of the reference's id only when the server names no
  document. Otherwise: filed with no document, against a document that no longer exists, against a reference
  outside the Vault, or not filed. If only the filings read fails, the verdict stands and the section says the
  documents are not shown and nothing can be removed.
- **File a document**, for a record that is not filed: `VaultVersionPicker` with `programId`, a reason of at least 8
  characters, then `POST /api/etmf/trials/:studyId/artifacts` with
  `{ artifactCode, documentRef: "vault://<the picked version's id>", reason }`. No reference is made up.
- **Or upload and file in one step**, in the same form: "Upload a file from your computer". With the reason given,
  the file goes to this project's Vault through `useVaultUpload` (`POST /api/vault/ingest`, typed by the record
  chosen, titled by its own file name), then the record is filed against the id the Vault returned. The two halves
  are said apart: "was not added to this project's Vault: <reason>. Nothing was filed."; "It is not known whether …
  was added" (and the same file is not offered for a second send); "is in this project's Vault and is not filed as
  <record>. <the refusal> It can be filed from here without uploading it again.", after which the form's button
  files that document and uploads nothing.
- **Remove**, for a record with a filing: a reason, then `DELETE /api/etmf/artifacts/:id` with `{ reason }`.
- After either, both reads are made again; what is shown is what the server holds. A refusal stays in the form with
  its reason. No answer (a dropped connection, a 5xx) is said as not known, never as refused. What was done stays
  on screen if the read after it fails.
- **Only for a role that may write the Vault** (`useVaultCanWrite`); other roles read it and see "View only".
- **The inspection package, shown as a document**, beneath the records and open: a cover (the verdict's label, the
  study, the reference model, the scope, the day it was read), the figures, then "1 Readiness verdict", "2 Zone
  index", "3 Open records" (each with its zone, name, code and whether it has a filing that does not count) and "4
  What this package is" (the index and the readiness picture, not the documents). Its label and part 1 are read from
  the section's one verdict value. While a read after a write is in flight its pages wait.
- **Download the inspection package**, under the verdict (where the section has had it) and in that document's
  bar; one download, whichever button asks: `GET …/inspection-package?scope=<the scope on screen>`, saved under the
  server's file name, with what it says and its SHA-256, checked on receipt against `X-TMF-SHA256`. A file that
  does not match is not saved. The outcome is said beside the button that asked. A failure is said with its reason
  and nothing is saved; "Try again" is offered unless the failure was a refusal.
- **Refusals are said as themselves**: not in this release (403 `LAUNCH_SCOPE`), not enabled for the organization
  (403 `MODULE_NOT_LICENSED`), the person's role (403), the study not found (404 `STUDY_NOT_FOUND`), an expired
  session (401). Only a failure to answer offers "Try again", and it says it is not an empty trial master file.

What the page adds: `ProjectBack`; an h1, "Trial master file" (the section's own heading reads "Records" there, so
the page is titled once); the section for the open project, with the shell's conversation for its question to AnA;
with no project open, "Open a project to see its trial master file" and a button to Projects, and nothing is read.
It publishes to AnA what the section read and nothing else: no project open; the studies being read, not read, none
or several; a study's read in flight, refused or failed ("not because the trial master file is empty"), with the
scope; or the study, the scope, the verdict sentence, the figures as the screen shows them, that timeliness and QC
are not assessed, the server's own `ready` (`null` stays `null`), the counts, the zones and up to 20 missing
records by zone, code and name. The page makes no read of its own.

ESLint: `Vault.tsx` 0 errors and 4 warnings before and after. `Etmf.tsx` 3 warnings before, 0 after. Every other
file of this change: 0. `check-eslint-warning-ratchet.mjs --since HEAD`: "net -3 warning(s)". The third change: 0
errors and 0 warnings in every file it touches or adds; each file is under 500 code lines and each function under
100 lines and complexity 15 (`20-gates.txt`).

## What the retired screen showed, and where it is now

Line numbers are `Etmf.tsx` as it was at `bb17f97b77`. The second change's version of this table listed items 1 to 5
as "not carried"; under P-122 that was a removal no session may make. Tests: `S` `vaultTrialMasterFile.test.tsx`,
`P` `etmfHostsTrialMasterFile.test.tsx`, `R` `vaultTmfRestored.test.tsx`, `U` `vaultTmfUploadAndFile.test.tsx`,
`M` `vaultTmfModel.test.ts`.

| # | The retired screen | Now | Held by |
|---|---|---|---|
| 1 | **The scope**: a switch between the essential records and all 41 (`:116`, `:462-465`). It held the previous read as superseded so that a scope just chosen never showed the last scope's figures (`:141-176`). | **Carried.** "Essential records / All records", two options in the section's heading row. The read, the verdict, the figures, the records, the package document, the download, its note and what AnA is told follow it. The scope is part of the read's path and `useLiveData` now answers a changed path as in flight in the same render, so the window the old file closed by hand is closed by the read; an answer that names another scope is a failed read. | `R` "which records are checked: the essential ones, or all" (6 cases) and "the scope and the study" (2); `P` "the scope on screen is the scope AnA is told, with that scope's figures and never the other's"; `M` "names essential records for the essential scope and records for all". |
| 2 | **The three figures** (lenses `:533-557`, the package's `:642-646`): zones complete, records filed, open gaps with "n filed, no verified document". Two more lenses, timeliness and quality, each a tile reading "Not yet available". | **Carried.** One line of plain figures under the verdict (`vd-dr-stages`, the Vault's Data room figures), and the same line in the package document. The two lenses are one visible sentence: timeliness and quality control are not assessed, because no filing lag and no QC state is recorded. No tile. | `R` "the three figures beside the verdict" (6 cases); `M` "the three figures" (4 cases); `P` "the study, the verdict as the server gave it, and the counts". |
| 3 | **Each record's artifact code and zone** on its punch-list row (`:589`). | **Carried**, after the record's name, in the Vault's monospace: "Zone 1 · monitoring_plan". | `R` "quiet and monospaced, after the record's name, for every record of the scope". |
| 4 | **Upload and file in one step**: "Attach & file" sent a file from disk to `POST /api/vault/ingest` with its own copy of the request, then filed it, with no reason (`:317-411`). | **Carried**, in the filing form beside the Vault search, with the person's reason, through the Vault's own upload (`useVaultUpload`). The upload goes to the project the section is of, which is the study's, as the server now requires. A refused upload, an upload not confirmed, and an upload that succeeded with a refused filing are each said as that; the last is filed from the same form without a second upload. Offered only where the filing form is: a role that may write the Vault. | `U`, all 12 cases; `M` "the Vault ingest type of a file uploaded against a record" (3 cases). |
| 5 | **The inspection package shown as a document** (`:620-677`): cover (verdict badge, trial, reference model, scope, date), three figures, "1 Readiness verdict", "2 Zone index", "3 Open essential documents", "4 What this package is". Its badge, lens and headline read one verdict variable so they could not disagree (`:534-536`). | **Carried**, as an open part of the section beneath the records (`cm-doc`), with the download in its bar and, as the old screen also had it in its lead, under the verdict. The cover's label and part 1 are read from the one `verdict` value the verdict line shows; part 1 opens with the verdict line's own sentence. Part 3 also says which open records have a filing that does not count. Part 4 says it is the index and the readiness picture, not the documents. | `R` "the inspection package, shown as a document" (5 cases) and "the inspection package, after a write and for a view-only role" (2); `M` "the package cover and its first part state the one verdict" (2 cases); the download: `S` "the inspection package" (8 cases, "is also offered under the verdict, above the records, and its outcome is said where it was asked for" among them), `R` "the download is of the scope on screen, and says which". |
| 6 | **Ask AnA** (`:467`): a button asking which TMF gaps an inspector would flag for the trial and how to close them, through `const ask = onAsk`. | **Carried.** "Ask AnA which gaps an inspector would raise", for the study on screen whatever its read came to. The section takes an optional `onAsk`; the page passes the shell's. | `R` "asking AnA which gaps an inspector would raise" (3 cases); `P` "the section asks AnA in the page's conversation"; `M` "the question names the study by its title, or by its id when it has none". |
| 7 | What "filed" rests on, in the verdict lead (`:509-530`). | Carried as a visible line under the figures. The second change had it behind a closed disclosure ("What counts as filed"); the disclosure is gone, and the section has no `details`. | `S` "says what is filed and what is missing in a sentence…" (the line is outside any `details`); `R` "says in one visible line that timeliness and quality control are not assessed, and why" (no `details` in the document). |
| 8 | **The report built in the browser when the ZIP failed** (`:422-425`, `:437-440`). | **Not restored: a decision, recorded by the session.** That report was an export with no record. The server's download is recorded before it is sent and refused when its record cannot be written (503 `UNAUDITED_EXPORT_REFUSED`). The failure is said beside the button with the server's reason, and "Try again" is offered. | `S` "a failure (a download the server could not record) is said with its reason, and nothing is saved". |
| 9 | **"Open in Project management"** (`:466`). | **Not restored: a decision, recorded by the session.** The page's `ProjectBack` goes to the project. | `P` "with a project open: the way back, one title, and the section for that project's study". |
| 10 | Named the trial by an identifier typed by hand (`:115`, `:454-461`). | Replaced: the project's study, from the study list. | `S` "which study the trial master file is of" (6 cases). |
| 11 | Loading, could not load, no assessment (`:471-502`). | Carried. A refusal is also told apart from a failure. | `S` "a refusal is said as itself, and a failed read is never an empty trial master file" (6 cases). |
| 12 | The punch-list: each missing record by name (`:573-603`); zone completeness (`:604-616`). | Carried, under each zone; and as parts 2 and 3 of the package document. | `S` "says what is filed and what is missing in a sentence, then each zone by the record's name". |
| 13 | Generated the package: the ZIP, its readiness and SHA in a toast (`:417-441`). | Carried, and the SHA-256 is checked on receipt. | `S` "downloads it for the study and says what it is, and its SHA-256 checked on receipt". |
| 14 | Published the screen's state to AnA (`usePublishSurfaceContext('etmf')`, `:232-294`). | Carried by the page, from what the section read, with the scope and the figures. | `P` "what AnA can see of the page is what the section read" (6 cases). |
| 15 | Did not show what a filed record is filed against, and could not remove a filing. | Added by the first two changes. | `S` "names the document a record is filed against as the server names it"; "removing a filing" (2 cases). |

Three differences from the retired screen in what is carried, each for a stated reason:

- **Item 4, the uploaded document's code and title.** The old screen recorded the upload under the record's code
  and name ("Protocol and amendments"). The Vault's upload path records a file under its own file name, and the
  section does not send a title over it: two studies' insurance certificates would otherwise both be titled
  "Insurance / indemnity". The record it is filed as is in the filing.
- **Item 6, with no study on screen.** The old button asked a general question when no trial id was typed. The
  section offers the question once a study is on screen; with no study there is no trial master file to ask about.
- **Item 2, the open figure.** The old tile read "Open gaps — n filed, no verified document". The line reads "Open
  records n, m filed with no verified document", and when the server does not report m it says so.

## The retired screen's three test files

Each is deleted. What it pinned, and the case that pins the same now (letters as in the table above). Cases marked
*new* were added for this by the second change.

| Deleted file, case | What it pinned | Pinned now by |
|---|---|---|
| `etmfHonesty` 1, 2, 5 | A trial named next never showed the last trial's "complete", or its failed read; the screen spoke only from the read for the trial named. | `S` "a study chosen next carries neither the last study's verdict nor its failed read" (*new*), and "an answer about another study is not shown as this study's". |
| `etmfHonesty` 3 | A read that evaluated no zones is never called complete. | `S` "states no verdict over a read that checked nothing, even one the server called ready". |
| `etmfHonesty` 4 | A file that has earned it reads complete. | `S` "says complete only when every essential record is filed against a document". |
| `etmfHonesty` 6 | The real gap counts are stated, with no reassurance over them. | `S` "says what is filed and what is missing in a sentence, then each zone by the record's name". |
| `etmfReadiness…` 1 | `ready: null` is said as not determined, with what "filed" rests on, and published to AnA as `null`. | `S` "says not determined when the server could not determine it…"; the basis in `S` "says what is filed…" (*assertion added*); `P` "not determined is published as not determined, with the server's null…" (*new*). |
| `etmfReadiness…` 2 | The offline markdown report said READINESS NOT DETERMINED. | Nothing: the report is not produced (item 8 above, a decision). The package document on screen says "Readiness not determined": `R` "states the verdict the verdict line states (undetermined), and no other". |
| `etmfReadiness…` 3 | A package marked `X-TMF-Ready: undetermined` is not said to have gaps. | `S` "says a package the server marked not determined as not determined, never as missing records" (*new*). |
| `etmfReadiness…` 4 | `ready: false` reads not ready, and a filing with no document is counted as missing. | `S` "says what is filed and what is missing…" (the `no_document` record and "filed, but not against a Vault document that exists now"). |
| `etmfFilingPayload`, the ingest-type mapping (4 groups) | The upload sent a document type the Vault's ingest accepts: a code that is a type maps to it, the investigator's brochure to IB, anything else to OTHER; `tmf_essential` is not a type. | `M` "the Vault ingest type of a file uploaded against a record" (3 cases, the same expectations, against `tmfIngestType` and the real vocabulary); `U` "the upload is typed by the record it is filed as" (3 cases, on the request as sent). Since the third change. |
| `etmfFilingPayload`, "appends a programId resolved from the shell project" | The upload named the open project. | `U` "adds the file to this project's Vault through the Vault's upload…" (the request's `programId` is the section's project). Since the third change. |
| `etmfFilingPayload`, "refuses rather than posting a request that cannot succeed" | With no project open nothing was posted. | `P` "with no project open: … reads nothing" (*new*). |
| `etmfFilingPayload`, "carries the eleven DIA zones" | The zone list is the catalog's eleven. | `S` "says what is filed…" (*assertion added*: eleven zone rows). |

## Evidence

The first build, the section inside the Vault (held):

| File | What it shows |
|---|---|
| `01-red.txt` | Its tests on the unchanged code: the suite cannot be collected; with HEAD's `Vault.tsx` and the new file present, 3 failed and 34 passed. |
| `02-green.txt` | 37 passed of 37. |
| `03-suites.txt` | 99 suites, 1127 of 1128. The one failure was not that change's and has since been fixed (`303d019f09`). |
| `04-mutations.txt` | 18 defects put back one at a time; 18 caught. |
| `05-gates.txt` | The client-facing gates pass, and **`ci:launch-scope-api` fails** with the Vault calling `/api/etmf`: the reason the hook-in is held. |

This change, the page hosting the section:

| File | What it shows |
|---|---|
| `06-red.txt` | This change's tests on the unchanged code (`Vault.tsx` and `Etmf.tsx` as at HEAD, the section absent): the section's suite cannot be collected; of the page's 8 cases, 7 fail against the old screen and the old button, and 1 passes (the Vault reads nothing of the trial master file, true before and after). |
| `07-green.txt` | 44 passed of 44: the section's 36, the page's 6, the button's 2. |
| `08-suites.txt` | 125 suites that cover the changed files, 1339 of 1339: the Vault and eTMF client suites (67 files, 744), the other suites that render the Vault or read `Vault.tsx` (6 files, 80), and the suites that scan the v2 source tree or read its stylesheets (52 files, 515). |
| `09-mutations.txt` | 27 defects put back one at a time, 27 caught: 13 of the first build's against the section as it now stands, and 14 of this change's (a document named from its reference, the page publishing "not determined" as not ready, the page reading with no project open, the button's old name, the Vault hosting the section before admission, and the rest). |
| `10-gates.txt` | `ci:launch-scope-api` **passes** ("639 API paths … none refused"). `ci:unreferenced-modules` (72, baseline 72), `ci:one-product`, `ci:ana-surface-context`, `ci:undefined-css-classes`, `ci:check-orphaned-stylesheets`, `ci:surface-text-ramp`, `ci:check-css-selector-shadowing`, `ci:class-vocabulary`, `ci:design-system`, `ci:launch-scope`, `ci:surface-discoverability`, `ci:unauthenticated-fetch`, `ci:fixture-fallback`, `ci:fabricated-identity` and the ESLint warning ratchet pass. |

The held in-Vault cases (3) were run once against `Vault.tsx` with the hook-in applied: 3 passed. They are not in the
tree, where they would fail without it.

The third change, what the retired screen showed carried in the section:

| File | What it shows |
|---|---|
| `16-red.txt` | Its tests on the unchanged code (the section and the page as at HEAD `673f0d9fff`, the three new source files absent): 48 cases fail and 38 pass, and `vaultTmfModel.test.ts` (12 cases) cannot be collected because the module it checks does not exist. The 38 are the cases this change did not alter and the ones that pin an absence. |
| `17-green.txt` | 98 passed of 98: `S` 38, `P` 11, `R` 25, `U` 12, `M` 12. |
| `18-suites.txt` | 128 suites that cover the changed files, 1394 of 1394: the Vault and eTMF client suites, the Vault upload suites among them (70 files, 798), the other suites that render the Vault or read `Vault.tsx` (6 files, 81), and the suites that scan the v2 source tree or read its stylesheets (52 files, 515). |
| `19-mutations.txt` | 83 defects put back one at a time: 24 of the first two changes' against the section as it is now split, and 59 of this change's (the read ignoring the scope, an answer for another scope taken, figures over an answer that checked nothing, a count not reported shown as none, the code dropped from a row, the upload sent to another project or typed OTHER, a refused filing after an upload said as "Nothing was filed", a second upload on retry, an unconfirmed upload said as refused, the cover's label read from the server's flag, the package or what "filed" rests on behind a closed disclosure, the download gone from above the records, the question not naming the study, and the rest). 82 were caught on the first run. One was not: R07, the answer of before a write staying on screen for the commit after the read is asked for again. Its case asserted one commit late and passed. The case now looks at every commit from the write on, and R07 is caught, four runs of four. 83 of 83 are caught by the suites as they stand. |
| `20-gates.txt` | `ci:launch-scope-api` passes with the `etmf` surface now also calling `/api/vault/ingest` ("639 API paths … none refused"). `ci:unreferenced-modules` (72, baseline 72), `ci:one-product` ("101 surfaces, 11 rail entries, none new"), `ci:ana-surface-context`, `ci:undefined-css-classes`, `ci:check-orphaned-stylesheets`, `ci:surface-text-ramp` (nothing to regenerate), `ci:check-css-selector-shadowing` (0 new), `ci:class-vocabulary`, `ci:design-system`, `ci:launch-scope`, `ci:surface-discoverability`, `ci:unauthenticated-fetch`, `ci:fixture-fallback` and `ci:fabricated-identity` pass. The ESLint ratchet: "no file changed its warning count since HEAD" for the five tracked files; the six files this change adds are not tracked yet, so they are linted directly: 0 errors, 0 warnings. `git apply --check` of the held hook-in passes. No baseline was raised or regenerated. `tsc` was not run by the agent. |

The held in-Vault cases (5 since the third change) were run against a copy of `Vault.tsx` with the updated hook-in
applied (a temporary file beside it, removed afterwards; `Vault.tsx` itself was not touched), on the final section:
5 passed. Against the
second change's hook-in, which passes neither `onAsk` nor `onVaultChanged`, the two new cases fail and the three
others pass. `git apply --check held/vault-hook-in.patch` passes against `Vault.tsx` at `673f0d9fff`.

## Opened and used in the running app

This walk is of the second change. **The third change has not been opened in the running app**: the agent that built
it may not start the server. See "Not done here", item 1.

`11-running-app.txt`, with `12-vault-header-button.png`, `13-filing-form.png`, `14-phone-filing-form.png` and
`15-dark.png`. The local server on PostgreSQL, the demo's biotech project C2C-101 (one study), signed in through the
real form.

- The Vault's header button reads "Trial master file" and opens the page for the open project's study: 11 zones,
  26 essential records, "0 of 26 essential records are filed. 26 are missing."
- A record was filed against a document of the project's Vault with a reason. The page said which document and
  version, and the count moved to 1 of 26. The filing was removed with a reason and the count moved back. It was
  filed again, and the removal cleared on the same row.
- The inspection package downloaded as `tmf-inspection-<studyId>.zip`, and the page gave its SHA-256, checked on
  receipt.
- The database afterwards: `TMF_ARTIFACT_FILED`, `TMF_ARTIFACT_REMOVED` and `TMF_ARTIFACT_FILED` in the chained audit
  trail with the reasons typed, one `EXPORT_GENERATED` for each package, and one filing row bound to the study.
- A project with no study says so, and says where a study is created. No console error and no response of 400 or
  above in any walk.

**The third change, opened and used the same way** (`21-running-app-restored.txt`, `22-page-restored.png`,
`23-package-document.png`, `24-ask-ana.png`, `25-phone-restored.png`).

- Essential records is the default: 26 records, the three figures, what "filed" rests on, and the line that
  timeliness and QC are not assessed. Each record shows its zone and code.
- All records: 41 records, and every sentence and figure follows ("1 of 41 records are filed").
- The package is shown as a document beneath the records, with the same verdict, its 11 zone rows and its open
  records, and it downloads in the chosen scope.
- A PDF was uploaded from the filing form with a reason. It was added to the project's Vault and filed in one
  step; the page named the document and its version. The database holds `vault.document.ingest`, then
  `TMF_ARTIFACT_FILED` with the reason typed.
- Ask AnA opens the conversation with the question in the composer, marked "From Trial master file", with the way
  back. No model key is set on this machine, so the question was not sent.
- 1440px, 768px and 390px: no name cut, no row overflowing, no horizontal scroll, no console error, no response of
  400 or above. Not seen: the dark theme after the third change.

**Two defects the running app showed, fixed in this change** (`styles/misc-surfaces-v2.css`). Neither could be seen
in a simulated DOM.

1. The reason field was about 200px tall. Its class carries `flex:1 1 200px`, written for a field beside its button;
   inside the column form that basis became a height. `.vd-confirm-form textarea` now takes its rows (53px). The same
   rule repairs the reason fields of Restore a version and Confirm suggested filings, which had the same height.
2. On a phone a record's name was cut to an ellipsis ("Trial Master File …"). Names in the trial master file now
   wrap, and on a narrow screen the rest of the row wraps under the name. Measured after: no name cut at 390px or
   1440px, no horizontal scroll.

## Not done here

1. **In a release the page is still locked**, as the old screen was, and the Vault's button is not offered there.
   That is admission, and P-74 allows it only with one TMF store, a URS and an OQ. The founder's "I don't see the TMF
   on the vault UI" is answered in a release only when those are done and the hook-in is applied. Until then it is
   answered where the eTMF can be opened: the demo and a development or professional-tier installation.
2. **Two things the retired screen had are not restored** (items 8 and 9 of the table above): the report built in
   the browser when the ZIP failed, and "Open in Project management". Both are recorded in P-124 item 3
   (`docs/LAUNCH_DEFINITION_OF_DONE.md`): the report was an export with no record, and the page's way back goes to
   the project.
3. **The download is in two places.** The brief put it in the package document's bar, beneath the records. It is
   there, and it also stays under the verdict, where the second change had it and the retired screen had it in its
   lead: P-122 forbids moving below the fold an action a screen showed, and beneath 26 or 41 records the bar is
   below it. It is one download with one state. The session keeps both.
4. **What an upload from the filing form records.** The document's title is the file's own name and its type is
   the record's where the record's code is an ingest type, otherwise OTHER (three differences are listed under the
   table above). No folder is named, so the Vault places it as it places any upload with none: the classifier's
   suggestion, or the review queue.
5. With several studies none is preselected, so the person chooses before anything shows. Preselecting the most
   recently updated would show a file at once, and could file against the wrong study on a later visit.
6. The page also calls `/api/study-design`, `/api/c2c/project-vault/:id/search` (the picker) and, since the third
   change, `/api/vault/ingest` (the upload, as the old screen did), which the `etmf` entry's `apiPrefixes` do not
   list. `ci:launch-scope-api` passes (`20-gates.txt`): no gate checks a surface outside the launch scope. At
   admission the section sits in the Vault, which claims all three.
7. The filing form does not check that the chosen document is of the record's kind: the walk filed a protocol as
   the Trial Master File Plan. A person decides what a document is; a suggestion from the Vault's own classifier
   (`etmf-logic.ts`, already used by the Vault's filing) is a later slice.

Done by the session with this change, outside the agent's files: the `etmf` entry of
`shared/constants/ui-surface-registry.ui-v2.ts` is now labelled "Trial master file" and describes this page; the
stale `.etmf-doc-body` line is removed from `scripts/ci/css-selector-shadowing-baseline.json`, as that gate asked.
`tsc` runs in the pre-push gates.
