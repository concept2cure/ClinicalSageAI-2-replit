# The CSR lifecycle demo on CDISCPILOT01: prepared and walked in the running app (2026-11-05)

Launch row D2, workstream W1, ledger package L1. Runbook walked:
`docs/evidence/D2-CSR/2026-11-02-phase2-demo-walk/README.md` ("Demo runbook"), steps 5–15 of "Before the demo" and
steps 1–6 of "Live: what to show". The founder will show this path to a paying client. This folder is the record of
that walk: every break, with its screen, its API status and the code responsible. **No product code was changed.**

**No CDISC data is in this folder.** The pilot files, the efficacy transcription, the manifest, the state file and
the reviewer's password stay in the session scratchpad. Screenshots show titles, counts and statuses. The narrative QC
list (subject ids) is masked in every screenshot, and the clinical tables are shown collapsed. The logs hold counts,
codes and ids.

## Outcome in one paragraph

The preparation reaches the end of the runbook, but **two parts of the path do not work on a correctly provisioned
database.**

- **Blocker B1: narratives and assembly.** The queued narrative and assembly workers cannot see the project's Vault
  rows under row-level security. Both refuse with "This retained source is no longer eligible for data consumption"
  (B1).
- **Blocked by the missing model key: drafting.** Without a model key, the build drafts nothing. Two headings
  (Title Page, Study Objectives) came out as plain template text and could go through review, approval and import.
  The reviewer's CSR scientific review then correctly refuses, because no result is reported, and so the E-sign
  refuses too.

What works:
- the project start;
- the Vault ceremony with three people (7 files, 14 signatures);
- the one CSR entry in New document (F1 closed);
- freezing the study data (11 tables);
- section review with the text read first (F9 closed);
- the failure reason on the build card (F10 closed);
- template rows labelled as template (F2 closed);
- sequence 0000;
- the compile's refusal.

Narratives (95 of 95) and assembly (incomplete, gaps named) were walked only by a labelled diagnostic run (below).

## How to rerun it (the founder's operator)

```
node scripts/cre/fetch-cdisc-pilot-adam.mjs <data-dir outside the repo>
# put cdiscpilot01-efficacy-results.json in <data-dir>: Tables 14-3.01 and 14-3.02 of the published CSR,
# transcribed (concept2cure.csr-efficacy-results.v1). Without it the manifest omits efficacy (§11.4 "not supplied").
DEMO_SIGNER_PASSWORD=… node docs/evidence/DEMO/2026-11-05-csr-lifecycle/walk.cjs http://127.0.0.1:5200 <data-dir> all
```

- **Modes.** `prepare` runs the runbook's steps 5–15, `live` runs its "what to show" steps, and `all` runs both.
- **Re-runnable.** Each step reads what is already done and skips it. The ids it creates go in
  `<data-dir>/csr-demo-state.json`.
- **People.** Three people, each signed in once per run with `POST /api/auth/dev-login`: JM Smith (author), Rhea
  Reviewer and Ava Approver. Override them with `DEMO_AUTHOR_EMAIL`, `DEMO_REVIEWER_EMAIL` and
  `DEMO_APPROVER_EMAIL`. The reviewer and the approver were created with `scripts/seed-admin.mjs` (`ADMIN_EMAIL`,
  `ADMIN_NAME`, `ADMIN_PASSWORD`, `ADMIN_ORG_SLUG=concept2cure-therapeutics`).
- **Options.** `DEMO_REBUILD=1` starts a new build when the newest one failed (for example once a key is set).
  `DEMO_TAG=<name>` writes a separate log and prefixes its screenshots.
- **Files.** `walk.cjs` is the entry point. The steps are in `walk-prepare.cjs` and `walk-live.cjs`, the shared
  helpers in `walk-common.cjs`. All four are lint-clean.
- **Output.** `walk.json` (the last full run), `walk-b1-owner.json` (the diagnostic run) and `screenshots/` (at
  1440×900; `42-`, `43-` and `44-` are at 390 wide).

## The environment, as it was

- **Server.** Port 5200, `NODE_ENV=development`, `RLS_ENFORCE=on`, on the fresh database built from the migration
  set, as the runtime role `c2c_rt`.
  - The server started at `1aa22ba92`. Ten commits then landed from other sessions, among them the F2, F9 and F10
    fixes. The client is served live from the working tree, so the client was newer than the server. The server
    was restarted at **`a8a2f3d06`** for the rest of the walk; builds 2 and later ran on it.
  - Three commits landed after that restart and were not walked: `9eb24c878`, `23375e29e` (one CSR type) and
    `15447b389` (the clinical source picker; F5).
- **Fresh database: two migrations had never been applied.** It was migrated on 10-31 at 22:55. Two files in
  `C2C_MIGRATION_FILES` were committed after that and never reached it: `20261025_shadow_review_run_coverage.sql`
  and `20261031_csr_study_data.sql`.
  - Without the second, the CSR's "Build from the study's data" panel answered **500**:
    `relation "csr_study_data" does not exist`, from `GET /api/submission-orchestrator/csr/study-data`.
  - Both files were applied as the schema owner, as a deploy would. The three tenant sweeps were then replayed
    (`20260801_uuid_tenant_isolation_nonpublic`, `20260813_child_table_parent_scoped_rls`,
    `20260801_tenant_isolation_sweep`), so the new table has its tenant policy.
  - This is environmental, but it is the deploy rule in practice: **a demo database must be migrated from the
    current set.**
- **No model key.** The gateway runs in demo mode, and the builder refuses its replies, as designed.
- **Dev reloads.** Vite reloaded pages several times while other sessions edited the client. Each UI step is
  therefore retried after a reload, and an API read is asked again. A write is never repeated: the Vault steps
  re-read the stage before each act.

## What was walked, in order

| # | Runbook step | Who | Result | What happened |
|---|---|---|---|---|
| 0 | Project | JM | **pass** | Projects → New project → IND → Drug → Create: `POST /api/c2c/projects` 201 (`00-project.png`) |
| 5–6 | Fetch; upload to the project's Vault | JM | **pass** | 10 files fetched, all hashes verified. `POST /api/vault/ingest` 201 for 5 XPT files, define.xml, the efficacy file, then the manifest (written after the uploads: Vault id and SHA-256 of each). 81–723 ms each; adlbc.xpt (32.7 MB) in 637 ms. |
| 7 | Approve the 7 files (3 people) | JM, Rhea, Ava | **pass** | 7 routes; 14 signatures (7 REVIEWED, 7 APPROVED), each with reason and password. All 7 `approved` at their exact hash (`01-`, `02-`, `03-`, `04-`). See B8. |
| 8 | Create the CSR from New document | JM | **pass** | Author → Find or start a document in the editor → More document actions → New document… → M5: **one** "GLOBAL · Clinical Study Report (CSR)" (F1 closed). Created: 119 sections; "Build from the study's data" present (`05-`, `06-`). |
| 9 | Freeze the study data | JM | **pass** | The manifest was chosen and its tables previewed: 11 tables in 6.1 s. Frozen in 8.8 s (`07-`, `08-`). The efficacy file is still offered as a clinical source (F5, at `a8a2f3d06`). |
| 10 | Build CSR draft | JM | **blocked: model key** | Builds 1 and 2: failed at 26% in about 25 s each. The card now says why: "Not complete: §4, §6, §9.2 … and 39 more have no saved text" (F10 closed). "2 of 119 ICH E3 headings drafted · 16 are template text with data missing" (F2 closed) (`09-`, `10-`). |
| 11 | Approve the headings | JM sends, Ava approves | **pass (2 headings)** | §1 and §8 were sent by JM. Ava pressed "Read saved section text" before Approve was offered (F9 closed) (`11-`, `12-`, `13-`). |
| 12 | Import approved sections | JM | **pass, then B2** | "Draft working copy saved", titled with the study's title, 2 sections. The receipt says "The saved CSR job is failed; available output is a partial draft." **"Open working copy" fails** (B2); the copy opens from the Author step (`14-`, `15-`). |
| 13a | Build narratives | JM | **FAIL: B1** | Run failed: `CSR_SOURCE_DATA_UNAVAILABLE` "This retained source is no longer eligible for data consumption…" |
| 13b | Assemble CSR files | JM | **FAIL: B1** | The same refusal. |
| 14 | Send the working copy for review; sequence 0000 | JM | **pass** | Review request to Rhea, with the Reviewer role and a task (`18-`, `19-`). Submission Center → Sequences → Start sequence 0000: `POST /api/submissions/7/sequences` 201 (`20-`). |
| 15 | Compile refuses | JM | **pass, but a different reason** | "Compilation blocked: 38 errors". The first error is internal wording; the runbook's expected reasons do not appear (B3) (`21-`). |
| L1 | The Vault | JM | **pass** | 7 study files listed Approved; the manifest's review and approval sign-offs (`30-`, `31-`) |
| L2 | New document (show only) | JM | **pass** | One CSR entry under M5 (`05-new-document-m5-csr-entry.png`) |
| L3 | The prepared CSR | JM | **pass*** | Study data frozen; section review; narratives "95 of 95"; CSR files "Assembled, incomplete" (`32-`–`35-`). *The narratives and assembly shown were produced by the diagnostic run, because B1 blocks them. |
| L4 | The working copy | JM | **blocked: model key** | It holds §1 Title Page and §8 Study Objectives, template text from facts (`36-`) |
| L5 | Review as the reviewer | Rhea | **blocked: model key** | Review tab → board → Record review decision → Approve → CSR scientific review offers "Study data the imported CSR build was drafted from" → Read the retained tables: 200. Record approval stays disabled: "No figure is mapped to a table cell. A CSR review needs at least one mapped result." This is correct for a copy that reports no result. See B6 (`37-`–`39-`). |
| L6 | E-sign; Place into filing | Ava | **blocked** | E-sign opens and asks for the password, then the server refuses: `409 CSR_SCIENTIFIC_REVIEW_REQUIRED` "No current scientific-review receipt covers the saved CSR…". The gate holds; see B7. Place into filing opens its dialog; not pursued without an approved copy (`40-`, `41-`). |
| — | 390 wide | all | **pass, with B5** | No page-level horizontal overflow on the project, the CSR panel or the review board (0 px). Inside the editor, the CSR panel is clipped at the right (B5) (`42-`–`44-`). |

### The diagnostic run past B1 (labelled; not the product as deployed)

To show what the demo would display once B1 is fixed, a second server ran on port 5201, connected as the schema owner
(`postgres`, which bypasses row-level security). On it, only "Build narratives" and "Assemble CSR files" were pressed
(log: `walk-b1-owner.json`; its screenshots were removed because they showed subject ids unmasked). The server was
stopped afterwards.

- **Narratives: 95 of 95 composed in about 18 s.** §14.3.3 and §12.3.2 were written. Every narrative lists what the
  source does not record: withdrawal actions, ADEX, ADCM and ADMH.
- **Assembly: "Assembled, incomplete", in about 11 s.**
  - 6 files.
  - 181 links checked, 1 failed: "csr-body.pdf: The body's bookmarks reach 3 level(s); 4 are required".
  - 16 sections still hold a data placeholder, each of which blocks placement.
  - 18 §16 appendices are missing: 16.1.1–16.1.12, 16.2.2, 16.2.3, 16.2.5, 16.2.6, 16.2.8 and 16.3. The 11-02 walk
    listed 12.
  - 53 body gaps.

In the same run, the two new headings §14.3.3 and §12.3.2 were sent by JM and approved by Ava on the board after she
read their text. That is why the section review now reads "4 approved".

## Re-walk after the fixes (2026-11-05, afternoon)

The same database, after a fresh migration from the current set (`deploy-migrate`, exit 0). Server on port 5200 as
`c2c_rt`, with `RLS_ENFORCE=on` and `NODE_ENV=development`, started at `d20e013e72`, with every fix below on trunk. The
client was served live from the working tree, so the one-line review note (`4e423e651c`) shows in the later shots. No
model key. The walk scripts follow F6 now (`2be9c3e469`, `ac8c9193e8`). Records: `walk-rewalk.json`, `walk-f6.json`,
`walk-b1.json`; shots `rewalk-*`, `f6-*`, `b1-*`.

| Break | Fix on trunk | Re-walked | What the app did |
|---|---|---|---|
| **B1** narratives and assembly fail under forced RLS | `82579d85cc` | **pass** (`b1-16-`, `b1-17-`) | `DEMO_REBUILD=1` started build 3, so both ran fresh as the runtime role, not on the owner-run results of job 2. Narratives: "95 of 95 narratives composed from the ADaM rows; §14.3.3 and §12.3.2 written." Assembly: assembled, incomplete, 6 leaves, 181 links checked, and 18 appendices named as missing (16.1.1–16.1.12, 16.2.x, 16.3). |
| **F6** import made a second document | `49b7521569`, `2a6b4d02d2`, `667f97d103`, `c68af7c21a` | **pass** (`f6-14-import-preview`, `f6-14-import-receipt`, `f6-15-`) | The preview said "Into “CDISCPILOT01 Clinical Study Report”, by ICH E3 section number. No other document is created", with §1, §8 and §12.3.2 "Will be written" and §14.3.3 "Held by reference". The database shows §1, §8 and §12.3.2 written into document `3ff5466e…`, each with a Part 11 UPDATE row ("Imported from CSR build 2, §1, heading approved by Ava Approver at 2026-11-05T01:45:49Z", with the person's reason) and one `CSR_IMPORT` receipt. **No document was created in the project.** |
| **B2** "Open working copy" missed the copy | gone with F6 | n/a | There is no working copy to open: the panel writes into the open document, and the editor shows the imported text (`667f97d103`). |
| Send for review | (F6) | **pass** (`f6-18-`, `f6-19-`) | The CSR itself went to Rhea Reviewer: "Review requested. The server recorded one request on this document". |
| **B3** compile reasons | `8cffd6c48b` | **pass** | The compile is refused, and its first three reasons are the missing application number, bound sponsor and D-U-N-S, each ending "Record it in Submission Center, Forms and letters (1571, cover letter, LOA), under Recorded applicant identity." |
| **B4** device card on a drug IND | `0b33248bad` | **pass** (`f6-20a-`) | Submission Center for this IND shows no "Device filings · eSTAR" card. |
| **B7** review-first refusal | `4c0c1f3765`, `4e423e651c` | **pass** (`b1-17-`) | Freeze and E-sign say "Needs its scientific review first" in the bar. The full sentence is in the control's title and in the signing dialog. |
| F1 one CSR entry | `23375e29e0` | **pass** | M5 lists the CSR once. One run read the list before it loaded (0 entries, `f6-05-` shows "Loading templates…"). The check now waits for the list (`ac8c9193e8`), and it passes with 1. |

Not re-walked here: B5 (390 px), B6, B8 and F11 have red/green tests and in-app checks in `fixes/`.

**After the founder's rehearsal (session `01QoxbLd`, `docs/evidence/D2-CSR/2026-11-05-lmn201-demo-rehearsal/`),
checked in the running app:**
- **R-1** (`b3c176b34d`, `71095a9003`): "Import approved sections into this document" brings its box into view (top
  at 153 px), and once the preview stands, focus is in "Reason for importing" (`r1r3-r1-import-opens-in-view.png`).
- **R-3** (`0180e0eec2`): the preview tables are the product's data table, header cells padded 8×12 px
  (`r1r3-r3-preview-table-spaced.png`).
- **The narrative QC list** (95 subjects, about 9,000 px) is collapsed under "Narrative QC list · 95 subjects", as
  beside §14.3.3 in the editor (`qc-collapsed-narratives-block-settled.png`).
- The solid magenta block below the narratives in these screenshots is not the product. `walk-common.cjs` `shot()` masks
  `ul[aria-label="Narrative QC"]` and the saved §12.3.2/§14.3.3 text, to keep CDISC participant detail out of committed
  screenshots, and Playwright paints a masked region magenta. An earlier note here took it for a renderer limit; that was wrong.
One run stopped on the Vault step (`b1-fail-3.png`): the Library tab was showing, not Uploads. It did not recur on the
next run, and every later step read the recorded stage first.

Still blocked by the missing model key: real drafting, and so a CSR whose results a reviewer can map and approve. Then
E-sign and Freeze over that approval.

## Breaks found (each: what was done, expected, what happened, code, suggested fix)

| # | Severity | What happened | Code | Suggested fix |
|---|---|---|---|---|
| **B1** | **Blocker** | "Build narratives" and "Assemble CSR files" (step 13): each run ends `failed`, `CSR_SOURCE_DATA_UNAVAILABLE`. Expected: 95 narratives and an assembly. **Cause, proven on the database:** both queued workers open their connection with `withTenantConnection({ tenantId, source: 'job' })`, with no `orgUuid`, so `app.current_org_id` is empty. `vault.documents` has forced RLS, and its SELECT policy is `core.can_access_program(program_id)` → `identity.current_org_id()`. As `c2c_rt`, with tenant 9 and an empty org UUID, the manifest's row reads **0 rows**; with the org's UUID, **1 row**. The receipt check then refuses. The dev database `clinicalsage` has the same forced RLS on `vault.documents`. | `server/services/csr/csr-narrative-run.ts:116`, `server/services/csr/csr-assembly-run.ts:191`; same pattern in `server/jobs/csrQueueRecovery.ts:38` (a recovered build). The refusal is raised at `server/services/csr/source-receipt-eligibility.ts:39`. | Give each job its organization's UUID: read `organizations.uuid` for the job's organization, or carry the requester's `orgUuid` on the run row, and pass it to `withTenantConnection`. Add a test against a non-owner role with forced RLS: a mock connection or an owner connection hides this. |
| **B2** | High (demo-visible) | Import → "Open working copy" (step 12). Expected: the copy opens. It shows instead: "Couldn't open the linked document — it isn't in the documents in scope (status filter: all)… Showing the editor's default view instead." The copy exists in the same project (`authoring_documents.client_program_id` matches) and opens from the Author step. The screen was captured during the walk; that capture was overwritten by a later run. A new import would create a second copy with the same title in the demo project, so the message is quoted here instead. | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:2523-2545`: `docs.find(...)` over the list read before the import. The target is set by `editor/SourceImportDialog.tsx:48-51` (`setEditorTarget` + `onNav` to the already-mounted editor). | When a `docId` target misses, re-read the document list (or that one document) once before saying it is out of scope. |
| **B3** | Medium (copy, and the runbook is out of date) | Compile eCTD (step 15). Expected: refused for the application number, the sponsor and its D-U-N-S. It does refuse: 38 errors, 1 warning. The first error reads: "This program has no linked section-tracking store: section tracking is keyed by the legacy numeric project id and no numeric project row exists for this program, so no authored sections are visible to the compiler (pending the document-identity contract)." 37 "Required section … is missing" follow. The expected reasons are not among them. This applies to every project made with New project, until a leaf is placed. | `server/routes/ectd-compile.ts:187-190` (the text), raised at `:130-131` and `:442` | Client copy in the product's words, such as "No document has been placed in sequence 0000 yet". Update runbook step 15 to what the compile actually says first. |
| **B4** | Medium (RULE 4) | Submission Center, on this **drug IND**, shows "Device filings · eSTAR — 510(k) device assembly readiness: nothing assemblable yet · 11 required sections missing" on its Submissions tab (`20a-submission-center-device-card.png`). | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:1478` renders `DeviceFilingsCard` unconditionally | Render it only for a device project or client type |
| **B5** | Low (390 wide) | The editor's "Build from the study's data" panel: the paragraph text and the Study data select are cut off at the right edge, not wrapped. The page itself does not overflow (`43-390-csr-build-panel.png`). | `client/src/concept2cure/v2/styles/authoring-v2.css:2689-2693`: `.ed-source-detail` is a grid whose items have no `min-width: 0`; the long `<select>` sets the track width | `.ed-source-detail > * { min-width: 0 }` and `select { max-width: 100% }` |
| **B6** | Low (reviewer effort) | CSR scientific review: "Phase **2**", "Weeks **8** and **16**", "Week **4** to Week **24**" and "(**11**)" are presented as figures to map, each offering unrelated table cells. One example is a disposition count offered for "Phase 2". The reviewer must mark each "Not a result from these tables". | `client/src/concept2cure/v2/surfaces/csrEvidenceMap.ts:66-85` (`figureOccurrences`: every place a cell's value appears) | Exempt study metadata and time points, as the server's figure scanner exempts identifiers. At least, rank the "not a result" choice first for metadata spans. |
| **B7** | Low (spares a credential check) | E-sign as the approver on the working copy. The dialog takes a reason and a password; only then does the server answer `409 CSR_SCIENTIFIC_REVIEW_REQUIRED`. | `client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx:605` (E-sign button) | Read the scientific-review receipt first. Disable E-sign with that sentence, as the Vault does for "who may not sign". |
| **B8** | Low (live discoverability) | In the Vault, the file's next step (Send for review / Sign review / Approve) sits in the file's collapsed **Versions** section. A person sees "In review" on the row and must know to open Versions. | `client/src/concept2cure/v2/surfaces/VaultVersions.tsx:412` (inside `details`) | Show the current version's next step beside the file's title, or open Versions when a step is waiting for the reader |

### F1–F12 from the 11-02 walk

| F | Now |
|---|---|
| F1 two CSR entries | **Closed.** One "GLOBAL · Clinical Study Report (CSR)" under M5. Other CSR-like entries remain, untried: "5.3.5.1 · Clinical Study Reports of Controlled Studies" and "M5 · … preparation worksheet". `23375e29e` gives every CSR document the build. |
| F2 template counted as drafted | **Closed:** "Template · data missing", not counted and not offered for review |
| F3 CI with two decimals | **Still in code:** `server/services/csr/csr-efficacy-table.ts:12` `toFixed(2)`. Not re-read on screen, so no value is shown here. |
| F4 reviewer's task has no link | Not re-checked in Tasks. The project's Review tab lists the document with "Open document" and the task. |
| F5 efficacy file offered as clinical source | **Reproduced** at `a8a2f3d06`. `15447b389` landed after it and was not walked. |
| F6 import makes a separate working copy | **Reproduced.** The CSR from New document is not filled; a second, unbound document is created (RULE 4: two documents for one CSR). |
| F7 builder does not pace for the 30/min limit | **Likely reproduced:** exactly 30 drafting calls, all demo mode, then 51 headings with no saved text. With a key each call is slower. |
| F8 placeholder approval | **Holds:** the assembly names 16 placeholder sections as blocking. The working copy (§1, §8) has none, so the review refusal was "no mapped result". |
| F9 approve without text | **Closed** |
| F10 failure without reason | **Closed** |
| F11 stale copy | **Partly.** eCTD Compile still says "First-study AI narrative generation remains unavailable." while the editor composes 95 narratives. The §14.3.3 wording was not read (its text names subjects). |
| F12 picker hides builds | Not pressed. `StudyDataBuild.tsx` now offers "Return to current frozen study data and CSR build". |

## What looks like a separate app, card or workspace (RULE 4)

- **Rail.** "Work areas" lists CMC / Module 3, Risk-based monitoring, Quality, and Reporting & analytics. The project's
  side card lists "Work areas: Study & Protocol Design, Biostatistics, CMC / Module 3, Risk-based monitoring".
- **The Author step.** "Write the protocol in the protocol workspace" and "Compose Module 3 in CMC / Module 3" sit
  beside "Find or start a document in the editor". These are two document types with their own workspaces.
- **Submission Center.** It describes itself as "workspaces": Planner, Builder, Required deliverables, Sequences,
  Validation, Shadow review and Dispatch. It also shows the device eSTAR card on a drug IND (B4).
- **eCTD Compile.** It carries CSR inputs of its own ("Clinical narrative inputs", "Orchestrator run · Build package
  run", "Raw clinical observations are not linked to the narrative generator…"), outside the CSR document.
- **Two documents for one CSR.** The import creates a second document beside the CSR started from New document (F6).
- **Data room and Vault.** The Vault page shows "Data room · Captured 0 · Nothing captured for this project yet", and
  the Evidence step shows "No sources in this project yet", while the Vault holds the 8 uploaded files.

## Blocked only by the missing model key

- Drafting itself: 101 of 119 headings not drafted, 16 template rows with data missing.
- Approving more than the two plain headings, and an import with real text.
- The figure-to-cell mapping in the CSR scientific review, and therefore "Record approval".
- The approver's E-sign; Place into filing / Place CSR files into sequence 0000.

**Not blocked by the key:** B1 (narratives, assembly) and B2–B8.

## What already exists (RULE 3)

Nothing was added to the product. Every step is an existing path:
- `Projects.tsx` (New project);
- `server/routes/vault-ingest.ts`;
- `VaultLifecycle.tsx` / `VaultReviewRoute.tsx` / `VaultVersions.tsx`, with `/api/regulatory/documents/:id/{sign,advance}`;
- `editor/DocumentWorkbench.tsx` (New document);
- `editor/StudyDataBuild.tsx` and `StudyDataSource.tsx`, with `/api/submission-orchestrator/csr/{sources,source-preview,study-data}`;
- `CsrBuildProgress.tsx`, `CsrRunBuilds.tsx` and `CsrAssemblyControl.tsx`, with `/api/csr/jobs…`;
- `editor/SourceImportDialog.tsx`;
- `editor/SendForReviewDialog.tsx`;
- `surfaces/Review.tsx`, `ReviewDecisionDialog.tsx` and `CsrEvidenceReview.tsx`;
- `SubmissionCenter.tsx`;
- `EctdCompile.tsx`, with `/api/ectd-compile/:id/compile`.

The walk scripts reuse the sign-in of `docs/evidence/SPINE/S11/2026-11-04-program-plan/walk.cjs`.
