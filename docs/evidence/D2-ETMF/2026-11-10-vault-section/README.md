# The trial master file inside the Vault's Required documents view

2026-11-10. Row D2 (the launch catalog). Decisions P-74 and P-75. Design:
`docs/design/ETMF_CONVERGENCE_2026-10-30.md`. Client only; nothing under `server/`. Not committed.

## Held: built and tested, not yet on trunk as code (the lead, 2026-11-10)

The section and its 37 cases are finished, and they are **not** in the tree as source yet. They are kept here as
`held-section.patch` (`Vault.tsx`'s two changes, the new `VaultTrialMasterFile.tsx`, and its test file), so the work
survives, and they go in with the eTMF's admission.

Why. The section makes the Vault call `/api/etmf`. Only the `etmf` surface claims that prefix, and `etmf` is outside
the launch scope, so `ci:launch-scope-api` (run in `ci.yml`) fails with the section in place, and a release would
answer every read with 403 `LAUNCH_SCOPE`. Making the `vault` surface claim the prefix would pass the gate and grant
the trial master file to every plan, which P-75 decided against (a professional-tier module). P-75's way is
`LAUNCH_APPS` vault gaining the `etmf` surface, and P-74 allows that only when its conditions are met: one TMF store
(slice E4, Store B retired), the migrations in the set (E2), and a URS and OQ for the function. The component cannot
go in alone either: `ci:unreferenced-modules` refuses a module nothing imports.

To apply it when admission lands: `git apply docs/evidence/D2-ETMF/2026-11-10-vault-section/held-section.patch`,
re-run `client/src/concept2cure/v2/__tests__/vaultTrialMasterFile.test.tsx`, and open it in the running app.

## The decision

The founder, 2026-11-10: "I don't see the TMF on the vault UI anywhere. The vault UI seems to be lacking in a lot of
ways."

P-75 puts the eTMF inside the Vault and files it against the project's protocol-design study. At HEAD the Vault's
only trace of it was a header button, "Inspection readiness", which called `onNav('etmf')` and opened a separate
top-level screen (`surfaces/Etmf.tsx`). The button is shown only where that screen can be opened
(`available('etmf')`), and a release locks the screen, so in a release the Vault showed a pharma or biotech project
nothing of its trial master file.

This change reaches the existing eTMF store from a **section of the Vault's Required documents view**. It is not a
tab, a screen, a card or a surface id (RULE 4): `ci:one-product` reports "101 surfaces, 11 rail entries, none new",
and the Vault still has its six views.

## What already exists

Searches run, in `client/src`, `server/routes`, `server/services`, `shared/` and `migrations/`: `etmf`, `tmf`,
`trial master file`, `inspection readiness`, `inspection-package`, `completeness`, `tmf_artifact`, `study-design`,
`program_id`, `VaultVersionPicker`, `GOVERNED_REASON_MIN`, `readFailureFor`, `useVaultCanWrite`, `scrollIntoView`.
Deleted history: `git log --all --diff-filter=D -- '*tmf*' '*Tmf*' '*TMF*' '*etmf*' '*Etmf*'` (the clone is shallow).

| Piece, by path | What it does today | What it does not |
|---|---|---|
| `client/src/concept2cure/v2/surfaces/Etmf.tsx` (surface `etmf`, `surfaceViews.ts:310,460`) | The separate screen: completeness for a trial id typed by hand, a punch-list, attach and file, the inspection package. | It is not in the Vault, is locked in a release, and binds to no study of the project. Itemised below. |
| `server/routes/etmf.routes.ts` on `/api/etmf` | Completeness, filings list, file, remove, inspection package, per study. Another agent is binding it to the study and adding the reason in this same tree. | Was reached by `Etmf.tsx` only. |
| `server/services/etmf/tmf-completeness.ts` | `assessTmfCompleteness`, `TmfCompletenessResult` (`ready: boolean \| null`, zones, `unverified`). | — |
| `shared/constants/domain/tmf-reference-model.ts` | The one catalog: 11 zones, 41 records, 26 essential; `tmfArtifactName`. | — |
| `GET /api/study-design?program_id=` (`server/routes/study-design.ts:565`) | Lists the project's protocol-design studies. Client readers: `mdx/hooks/useStudyDesign.ts` (its `StudyDesignRow` type is reused here), `ProtocolDevDesign.tsx:80`. | `useStudyDesign` reads with a bare `fetch`, drops the read's status and code, and takes a 200 with no `designs` as "idle", not as a failed read. So it is not used; the read here is `useLiveData` with a guard. |
| `surfaces/VaultCoverage.tsx` | The Required documents view's one section, and the section, row and note classes reused here. | Nothing about a study's records. |
| `surfaces/VaultLibraryResults.tsx:512` `VaultVersionPicker` | Picks one Vault version by search; with `programId`, from one project's Vault. | — |
| `surfaces/VaultViewOnly.tsx` | `useVaultCanWrite`, and the "View only" line. | — |
| `surfaces/VaultVersionRestore.tsx`, `shared/constants/governed-reason.ts` | The Vault's inline reason form and the 8-character floor. | — |
| `mdx/hooks/useFetchJson.ts:214,253` | `readFailureFor`, `describeReadFailure`: the one read classifier. | — |
| `v2/assessmentState.ts` | `assessmentStateFor`, `mayReassure`: only an assessment that ran and found nothing open may read clear. | — |
| `surfaces/vaultArchiveDownload.ts`, `v2/download.ts` | `sha256Hex`, `downloadBlob`. | `saveVerifiedArchive` reads `X-Content-SHA256`; the package states `X-TMF-SHA256`, so the check is made here with `sha256Hex`. |
| `shared/constants/domain/vault-taxonomy.ts:270` | TMF zone folders for the Vault's CRO/service view. | A folder structure, not what is filed or missing. Not touched. |
| `client/src/concept2cure/v2/fixtures/etmf.ts` | Deleted by `3fa2b6febc` (E1): the client's copy of the catalog. | Not brought back. |

## What changed

| File | Change |
|---|---|
| `client/src/concept2cure/v2/surfaces/VaultTrialMasterFile.tsx` (new, split out of the Vault, in its folder) | The section. |
| `client/src/concept2cure/v2/surfaces/Vault.tsx` | One import; one element after `VaultCoverage` in the Required documents view; the header button's handler, title and comment. Nothing else. |
| `client/src/concept2cure/v2/__tests__/vaultTrialMasterFile.test.tsx` (new) | 37 cases, the transport mocked. |

What the section does:

- **Reads nothing until the Required documents view is first opened**, then keeps what it read.
- **Which study.** `GET /api/study-design?program_id=<project>`. One study is used and named. Several: a chooser,
  and nothing is read for a study until one is chosen. None: "This project has no study yet, so it has no trial
  master file. A study is created in Protocol design, on the Study design tab of the project's protocol." A body
  that is not a list is a failed read, not "no study".
- **The verdict in a sentence**, from `GET /api/etmf/trials/:studyId/completeness?scope=essential`: every essential
  record is filed; N of M are filed and K are missing; or not determined (the server's `ready: null`), which is
  never said as complete or incomplete. A read that listed nothing to check states no verdict, even where it calls
  itself ready. An answer with no stated verdict, or one that names another study, is a failed read.
- **The zones**, each with "n of m filed", then each essential record by its catalog name: the document it is
  filed against (its title where the project's Vault lists it, otherwise the reference's id), that it is filed with
  no document, against a document that no longer exists, or against a reference outside the Vault, or that it is
  not filed. The filings come from `GET /api/etmf/trials/:studyId/artifacts`; if only that read fails, the verdict
  stands and the section says the documents are not shown and nothing can be removed.
- **File a document**, for a record that is not filed: `VaultVersionPicker` with `programId`, a reason of at least 8
  characters, then `POST /api/etmf/trials/:studyId/artifacts` with
  `{ artifactCode, documentRef: "vault://<the picked version's id>", reason }`. No reference is made up.
- **Remove**, for a record with a filing: a reason, then `DELETE /api/etmf/artifacts/:id` with `{ reason }`.
- After either, both reads are made again; what is shown is what the server holds. A refusal stays in the form with
  its reason. No answer (a dropped connection, a 5xx) is said as not known, never as refused.
- **Only for a role that may write the Vault** (`useVaultCanWrite`); other roles read it and see "View only".
- **Download the inspection package**: `GET …/inspection-package?scope=essential`, saved under the server's file
  name, with what it records and its SHA-256, checked on receipt against `X-TMF-SHA256`. A file that does not match
  is not saved. A failure is said with its reason and nothing is saved.
- **Refusals are said as themselves**: not in this release (403 `LAUNCH_SCOPE`), not enabled for the organization
  (403 `MODULE_NOT_LICENSED`), the person's role (403), the study not found (404 `STUDY_NOT_FOUND`), an expired
  session (401). Only a failure to answer offers "Try again", and it says it is not an empty trial master file.

The header's "Inspection readiness" keeps its visibility rule (`available('etmf')`). It now shows the Required
documents view and brings the section into view (scrolled to and focused); it no longer calls `onNav('etmf')`.
`Etmf.tsx` and its registry entry are untouched.

No existing test pinned the button's navigation. `filingPathNoDeadEnds.test.tsx` pins that the button is absent
where `etmf` is locked; that case is unchanged and passes.

ESLint, `Vault.tsx`: 0 errors and 4 warnings before, 0 errors and 4 warnings after (`max-lines` 1,
`max-lines-per-function` 1, `complexity` 2; `VaultForProject` 1691 to 1695 lines, complexity 310 unchanged). The
new file and the new test file: 0 and 0. `check-eslint-warning-ratchet.mjs --since HEAD`: "no file changed its
warning count since HEAD".

## What Etmf.tsx does, item by item

| # | `Etmf.tsx` | The section |
|---|---|---|
| 1 | Names the trial by an identifier typed by hand (`:115`, `:454-461`). | Differently: the project's study, from the study list. No typed identifier. |
| 2 | Switches scope between essential records and all artifacts (`:116`, `:462-465`). | **Does not.** Essential only. |
| 3 | "Open in Project management" (`:466`). | Not needed: the Vault's back link. |
| 4 | "Ask AnA" with a TMF-gaps prompt (`:467`). | **Does not.** |
| 5 | Loading, could not load, no assessment (`:471-502`). | Does. A refusal is also told apart from a failure, which `Etmf.tsx` does not do. |
| 6 | The verdict lead: complete, not determined, or missing N across Z zones; what "filed" rests on (`:509-530`). | Does: one sentence, and "What counts as filed" as a disclosure. No "reassure" line. |
| 7 | Three lenses: completeness; timeliness and quality, both "Not yet available" (`:533-557`). | Completeness, in words. The two unavailable lenses are not shown; the disclosure says neither is assessed. |
| 8 | The punch-list: each missing record by name, zone and code (`:573-603`). | Does, under its zone. The code is not shown. |
| 9 | "Attach & file": a file from disk goes to `POST /api/vault/ingest`, then is filed, with no reason (`:317-411`). | Differently: a version already in the project's Vault, with a reason. **Does not** upload from disk; the Vault's "Add files" does, then the record is filed here. |
| 10 | Zone completeness, n of m per zone (`:604-616`). | Does. |
| 11 | A preview of the package as a document: verdict badge, three figures, zone index, open documents, what the package is (`:620-677`). | **Does not** preview it. The same facts are the verdict, the zones and the disclosure. |
| 12 | Generates the package: the ZIP, its readiness and SHA in a toast (`:417-441`). | Does, and checks the SHA-256 on receipt. |
| 13 | When the ZIP fails, downloads a markdown readiness report built in the browser instead (`:422-425`, `:437-440`). | **Does not.** The failure is said with its reason; nothing is saved. |
| 14 | Publishes the screen's state to AnA (`usePublishSurfaceContext('etmf')`, `:232-294`). | **Does not.** AnA cannot see the section's state. |
| 15 | Does not show what a filed record is filed against, and cannot remove a filing. | Adds both. |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new tests on the unchanged code. (a) Both source files as at HEAD: the suite cannot be collected, none of 37 cases runs. (b) HEAD's `Vault.tsx` with the new file present: 3 failed, 34 passed; the three that render the Vault fail. |
| `02-green.txt` | The new tests on the changed code: 37 passed of 37. |
| `03-suites.txt` | 99 suites that cover the two source files: the Vault and eTMF client suites (69 files, 765 of 765), the other suites that render the Vault or read `Vault.tsx` (6 files, 79 of 80), and the suites that scan the v2 source tree (24 files, 283 of 283). The one failure, `projectCreationDoors.contract.test.ts`, fails the same way at HEAD: it expects `usePaletteProjects` in `Vault.tsx`, removed by `47a3067008`. |
| `04-mutations.txt` | 18 defects put back one at a time (a made-up document reference, no reason floor, not determined shown as incomplete, a refusal shown as a failure, the button opening the old screen, and the rest). 18 of 18 are caught. |
| `05-gates.txt` | The client-facing gates on the changed tree. `ci:one-product`, `ci:undefined-css-classes`, `ci:class-vocabulary`, `ci:design-system`, `ci:unauthenticated-fetch`, `ci:fixture-fallback`, `ci:fabricated-identity`, `ci:launch-scope`, `ci:ana-surface-context`, `ci:surface-discoverability` and the ESLint warning ratchet pass. **`ci:launch-scope-api` fails**; see the first item below. |

## Not done here

1. **`/api/etmf` is not in the launch scope, and this change cannot put it there.** `ci:launch-scope-api` passes at
   HEAD and fails with this change: "`[out-of-scope] /api/etmf/trials/:p`" and "`/api/etmf/artifacts/:p`", "called
   by vault in …/VaultTrialMasterFile.tsx". Only the `etmf` surface claims the prefix
   (`shared/constants/ui-surface-registry.ui-v2.ts:79`), and `etmf` is not a launch surface
   (`shared/constants/launch-scope.ts:99-109`, `vault` has `surfaces: ['vault']`). Until one of those files changes
   (P-75's "`LAUNCH_APPS` vault gains the `etmf` surface", or the `vault` surface claiming the two prefixes), a
   release answers every read here with 403 `LAUNCH_SCOPE`, and the section says "not in this release". Both files
   are outside this change's list. Which of the two is a tier decision: P-75 makes eTMF a professional module.
2. **Not opened in the running app.** No dev server was started. The layout, the scroll and focus on "Inspection
   readiness", the heading row with a long study title, the picker inside the row list, narrow widths and dark
   mode are unseen. Component tests in a simulated DOM are not evidence that a screen works.
3. **Not run against the server.** The transport is mocked. The server's study binding and reason are being
   written by another agent in this tree; the request and response shapes here were read from that work in
   progress (`{ success: false, error: <CODE>, message }` refusals, `study` on the completeness answer, 204 on
   removal).
4. `Etmf.tsx` is not retired; that is a later slice, after items 2, 4, 9, 11, 13 and 14 above are decided.
5. With several studies none is preselected, so the person chooses before anything shows. Preselecting the most
   recently updated would show a file at once, and could file against the wrong study on a later visit.
6. A record filed against an earlier version, or against another project's document, is named by the start of its
   reference's id, not by title: the section only has the project's current documents to name it from.
7. `tsc` was not run (shared rule; the lead runs it).
