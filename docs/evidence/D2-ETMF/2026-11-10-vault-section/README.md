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

**Held until the eTMF is admitted to the Vault app.** The hook-in that puts the section in the Vault's Required
documents view (in `Vault.tsx`: one import, one element after `VaultCoverage`, the header button's handler), and the
three cases that need it. Both are kept in this folder, out of the build: `held/vault-hook-in.patch` (checked with
`git apply --check` against this change's `Vault.tsx`) and `held/vaultTrialMasterFile.inVault.test.tsx.held`.

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

What the section does:

- **Reads nothing until the view that holds it is first opened**, then keeps what it read.
- **Which study.** `GET /api/study-design?program_id=<project>`. One study is used and named. Several: a chooser,
  and nothing is read for a study until one is chosen; a study chosen next never shows the last one's verdict or
  failed read. None: "This project has no study yet, so it has no trial master file. A study is created in
  Protocol design, on the Study design tab of the project's protocol." A body that is not a list is a failed read.
- **The verdict in a sentence**, from `GET /api/etmf/trials/:studyId/completeness?scope=essential`: every essential
  record is filed; N of M are filed and K are missing; or not determined (the server's `ready: null`), which is
  never said as complete or incomplete. A read that listed nothing to check states no verdict, even where it calls
  itself ready. An answer with no stated verdict, or one that names another study, is a failed read.
- **The zones**, each with "n of m filed", then each essential record by its catalog name. A filed record names its
  document from `GET /api/etmf/trials/:studyId/artifacts`: the title and version the server found, "an earlier
  version" when a later one has replaced it, and the start of the reference's id only when the server names no
  document. Otherwise: filed with no document, against a document that no longer exists, against a reference
  outside the Vault, or not filed. If only the filings read fails, the verdict stands and the section says the
  documents are not shown and nothing can be removed.
- **File a document**, for a record that is not filed: `VaultVersionPicker` with `programId`, a reason of at least 8
  characters, then `POST /api/etmf/trials/:studyId/artifacts` with
  `{ artifactCode, documentRef: "vault://<the picked version's id>", reason }`. No reference is made up.
- **Remove**, for a record with a filing: a reason, then `DELETE /api/etmf/artifacts/:id` with `{ reason }`.
- After either, both reads are made again; what is shown is what the server holds. A refusal stays in the form with
  its reason. No answer (a dropped connection, a 5xx) is said as not known, never as refused. What was done stays
  on screen if the read after it fails.
- **Only for a role that may write the Vault** (`useVaultCanWrite`); other roles read it and see "View only".
- **Download the inspection package**: `GET …/inspection-package?scope=essential`, saved under the server's file
  name, with what it records and its SHA-256, checked on receipt against `X-TMF-SHA256`. A file that does not match
  is not saved. A failure is said with its reason and nothing is saved.
- **Refusals are said as themselves**: not in this release (403 `LAUNCH_SCOPE`), not enabled for the organization
  (403 `MODULE_NOT_LICENSED`), the person's role (403), the study not found (404 `STUDY_NOT_FOUND`), an expired
  session (401). Only a failure to answer offers "Try again", and it says it is not an empty trial master file.

What the page adds: `ProjectBack`; an h1, "Trial master file" (the section's own heading reads "Essential records"
there, so the page is titled once); the section for the open project; with no project open, "Open a project to see
its trial master file" and a button to Projects, and nothing is read. It publishes to AnA what the section read and
nothing else: no project open; the studies being read, not read, none or several; a study's read in flight, refused
or failed ("not because the trial master file is empty"); or the study, the verdict sentence, the server's own
`ready` (`null` stays `null`), the counts, the zones and up to 20 missing records by name. The page makes no read
of its own.

ESLint: `Vault.tsx` 0 errors and 4 warnings before and after. `Etmf.tsx` 3 warnings before, 0 after. Every other
file of this change: 0. `check-eslint-warning-ratchet.mjs --since HEAD`: "net -3 warning(s)".

## What the retired screen did that the section does not yet

This is the record for the slice that decides each. Line numbers are `Etmf.tsx` as it was at `bb17f97b77`.

| # | The retired screen | Now |
|---|---|---|
| 1 | **All-artifacts scope**: a switch between essential records and all 41 artifacts (`:116`, `:462-465`). | **Not carried.** Essential records only. |
| 2 | **One-step upload**: "Attach & file" sent a file from disk to `POST /api/vault/ingest`, then filed it, with no reason (`:317-411`). | **Not carried.** A document is added in the Vault ("Add files"), then filed here from the picker, with a reason. |
| 3 | **Package preview**: the package shown as a document, with a verdict badge, three figures, a zone index, the open documents and what the package is (`:620-677`). | **Not carried.** The same facts are the verdict, the zones and "What counts as filed". |
| 4 | **Markdown fallback**: when the ZIP failed, a readiness report built in the browser was downloaded instead (`:422-425`, `:437-440`). | **Not carried.** The failure is said with its reason; nothing is saved. |
| 5 | **Ask AnA starter**: a button asking AnA which TMF gaps an inspector would flag (`:467`). | **Not carried.** AnA sees the page's state (below) and can be asked in the conversation. |
| 6 | Named the trial by an identifier typed by hand (`:115`, `:454-461`). | Replaced: the project's study, from the study list. |
| 7 | "Open in Project management" (`:466`). | The page's back link. |
| 8 | Loading, could not load, no assessment (`:471-502`). | Carried. A refusal is also told apart from a failure. |
| 9 | The verdict lead and what "filed" rests on (`:509-530`). | Carried: one sentence, and "What counts as filed". No "reassure" line. |
| 10 | Three lenses: completeness; timeliness and quality, both "Not yet available" (`:533-557`). | Completeness, in words. The two unavailable lenses are not shown; the disclosure says neither is assessed. |
| 11 | The punch-list: each missing record by name, zone and code (`:573-603`); zone completeness (`:604-616`). | Carried, under each zone. The code is not shown. |
| 12 | Generated the package: the ZIP, its readiness and SHA in a toast (`:417-441`). | Carried, and the SHA-256 is checked on receipt. |
| 13 | Published the screen's state to AnA (`usePublishSurfaceContext('etmf')`, `:232-294`). | Carried by the page, from what the section read. |
| 14 | Did not show what a filed record is filed against, and could not remove a filing. | Added. |

## The retired screen's three test files

Each is deleted. What it pinned, and the case that pins the same now (`S`: `vaultTrialMasterFile.test.tsx`; `P`:
`etmfHostsTrialMasterFile.test.tsx`). Cases marked *new* were added for this.

| Deleted file, case | What it pinned | Pinned now by |
|---|---|---|
| `etmfHonesty` 1, 2, 5 | A trial named next never showed the last trial's "complete", or its failed read; the screen spoke only from the read for the trial named. | `S` "a study chosen next carries neither the last study's verdict nor its failed read" (*new*), and "an answer about another study is not shown as this study's". |
| `etmfHonesty` 3 | A read that evaluated no zones is never called complete. | `S` "states no verdict over a read that checked nothing, even one the server called ready". |
| `etmfHonesty` 4 | A file that has earned it reads complete. | `S` "says complete only when every essential record is filed against a document". |
| `etmfHonesty` 6 | The real gap counts are stated, with no reassurance over them. | `S` "says what is filed and what is missing in a sentence, then each zone by the record's name". |
| `etmfReadiness…` 1 | `ready: null` is said as not determined, with what "filed" rests on, and published to AnA as `null`. | `S` "says not determined when the server could not determine it…"; the basis in `S` "says what is filed…" (*assertion added*); `P` "not determined is published as not determined, with the server's null…" (*new*). |
| `etmfReadiness…` 2 | The offline markdown report said READINESS NOT DETERMINED. | Nothing: the report is not produced (item 4 above). |
| `etmfReadiness…` 3 | A package marked `X-TMF-Ready: undetermined` is not said to have gaps. | `S` "says a package the server marked not determined as not determined, never as missing records" (*new*). |
| `etmfReadiness…` 4 | `ready: false` reads not ready, and a filing with no document is counted as missing. | `S` "says what is filed and what is missing…" (the `no_document` record and "filed, but not against a Vault document that exists now"). |
| `etmfFilingPayload`, the ingest-type mapping (4 groups) | The upload sent a document type the Vault's ingest accepts. | Nothing: the upload is not carried (item 2 above), so no ingest type is sent from here. That a filing names a real document is pinned by `S` "files the version picked from this project's Vault, with the reason, against the reference the Vault gave". |
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

## Opened and used in the running app

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
2. The five things in the table above marked not carried.
3. With several studies none is preselected, so the person chooses before anything shows. Preselecting the most
   recently updated would show a file at once, and could file against the wrong study on a later visit.
4. The page also calls `/api/study-design` and `/api/c2c/project-vault/:id/search` (the picker), which the `etmf`
   entry's `apiPrefixes` do not list. No gate checks a surface outside the launch scope; at admission the section
   sits in the Vault, which claims both.
5. The filing form does not check that the chosen document is of the record's kind: the walk filed a protocol as
   the Trial Master File Plan. A person decides what a document is; a suggestion from the Vault's own classifier
   (`etmf-logic.ts`, already used by the Vault's filing) is a later slice.

Done by the session with this change, outside the agent's files: the `etmf` entry of
`shared/constants/ui-surface-registry.ui-v2.ts` is now labelled "Trial master file" and describes this page; the
stale `.etmf-doc-body` line is removed from `scripts/ci/css-selector-shadowing-baseline.json`, as that gate asked.
`tsc` runs in the pre-push gates.
