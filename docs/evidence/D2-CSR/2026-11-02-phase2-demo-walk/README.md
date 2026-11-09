# D2 — the Phase 2 CSR path, walked for the founder's demo on the CDISC pilot (2026-11-02)

Launch row D2, workstream W1, ledger package L1. Roadmap: `docs/design/CSR_END_TO_END_2026-10-29.md`.

The founder asked for a demo of a Phase 2 CSR project. This walk took that path in the running app, using
CDISCPILOT01, CDISC's public Phase 2 pilot study (xanomeline TTS in mild to moderate Alzheimer's disease). It went
from an empty project as far as the app goes in an environment with no model key:

1. the Vault approval;
2. the study data;
3. the build;
4. the review;
5. the narratives;
6. the assembly.

Two defects found on the way were fixed red-first and walked again. This file is also the demo runbook (last
section).

**No CDISC data is in this repository.** CDISC's terms forbid modifying the pilot data, distributing it without
attribution, distributing it for a fee, or using it to compete with CDISC. The ten pilot files, the manifest and
the efficacy file made from the published CSR stay outside it. This folder holds counts, codes and screenshots
that show titles and statuses, never a subject row or a result value.

## What already exists (RULE 3)

Every step below is existing product. Nothing was added.

| Step | Where it lives | What it did here |
|---|---|---|
| Project | `Projects.tsx` (New project), `server/routes/c2c` projects | "Xanomeline TTS Phase 2 (CDISCPILOT01)", IND, drug |
| Vault upload | `POST /api/vault/ingest` | Uploaded 5 ADaM XPT files, define.xml, the ADaM bundle manifest and the efficacy file. The XPT files were read as `xpt-structure`. |
| Vault approval | `VaultLifecycle.tsx` `VersionLifecycleActions`, `VaultReviewRoute.tsx`, `/api/regulatory/documents/:id/{advance,sign}` | Send for review, a review signature and an approval signature, by three different people, for each of 7 files |
| Bundle contract | `shared/csr-adam-bundle.ts` (`concept2cure.csr-adam-bundle.v1`, `…csr-efficacy-results.v1`) | The manifest and efficacy file parse under the product's own schemas |
| Editor start | `editor/DocumentWorkbench.tsx` (More document actions → New document), template `component:clinical_study_report` | Created "CDISCPILOT01 Clinical Study Report" |
| Study data | `editor/StudyDataBuild.tsx`, `editor/StudyDataSource.tsx`, `server/services/csr/csr-study-data.ts`, `/api/submission-orchestrator/csr/{sources,source-preview,study-data}` | Previewed 11 tables in 3.9 s, then froze them in 4.2 s (study data `920a530f…`) |
| Build | `CsrBuildProgress.tsx` → `POST /api/csr/jobs`, `server/services/csr/csr-job-runner.ts`, `server/services/csr-builder.ts` | Builds 1 and 2: see "Defect 1" |
| Section review | `CsrBuildProgress.tsx` `CsrHeadingReview` | Lists 119 ICH E3 headings, each with a status |
| Narratives | `POST /api/csr/jobs/:id/narratives`, `server/services/csr/narrative-*.ts` | 95 of 95 narratives in 4.5 s, with §14.3.3 and §12.3.2 written. Template prose from facts, no model. |
| Assembly | `CsrAssemblyControl.tsx` → `POST /api/csr/jobs/:id/assembly`, `server/services/csr/csr-assembly*.ts` | Assembled, but incomplete, and each gap was named (below) |
| Peer review | `editor/SendForReviewDialog.tsx`, `surfaces/Review.tsx`, `ReviewDecisionDialog.tsx`, `CsrEvidenceReview.tsx` | Sent to Rhea Reviewer. Her CSR scientific review: see "Defect 2" |

The map of this path was read before the walk (Explore agent, 2026-11-02): which files, which refusals and which
preconditions. It was then checked in the app step by step.

## The data (outside the repository)

| Item | How it was made |
|---|---|
| The ten pilot files | Fetched by `scripts/cre/fetch-cdisc-pilot-adam.mjs`; the hashes are verified |
| ADaM bundle manifest | `studyInfo` comes from the published CSR's title page and synopsis. Phase 2; 254 randomized; 26 weeks; primary endpoint "ADAS-Cog (11) change from baseline to Week 24 (LOCF)". Arms PBO, XANLOW, XANHIGH; `randomizedFlag` ITTFL. Datasets ADSL, ADAE, ADLBC, ADLBH and ADVS, each named by Vault id and SHA-256. The conventions are run 3's and D17's (`../2026-10-30-cdisc-pilot-e2e/`): DCDECOD, DSRAEFL, RFENDT, REMOTE as not related, N/H/L, AVISIT = End of Treatment, TRTDUR, AVGDD in mg. Populations EFFFL and COMP24FL and the descriptive demographics use the define.xml labels. `dataCutDate` 2015-03-05, which is both the CSR's study-period end and the last ADSL RFENDT. |
| Efficacy file | 14 results transcribed from the published Tables 14-3.01 (ADAS-Cog) and 14-3.02 (CIBIC+): the per-arm means, the three pairwise ANCOVA differences with their CIs and p-values, and each dose-response p, armless with method and population. Nothing was computed. |

Both files parse under the product's schemas before upload (`CsrAdamBundleSchema`, `CsrEfficacyResultsSchema`).

## What was walked, and what it showed

Three accounts took part: JM Smith (author: uploads, sends), Rhea Reviewer, and Ava Approver. Rhea was seeded for
this walk with `scripts/seed-admin.mjs`. The screenshots are in `live/`, and the database counts are in
`live/db-rows.txt`.

1. **Vault approval of the seven files, through the product's ceremony.** Each file got three steps: JM sent it on
   a route naming Rhea and Ava, Rhea signed the review, and Ava approved it. That is 7 routes and 14 signatures (7
   review, 7 approval), each with a password; sending is not a signature. All seven are `approved` at their exact
   hash. The browser took about 30 s per file; by hand, plan on a
   few minutes per file. (`01-…`, `02-…`, `03-…`.) The 10-31 walk had inserted this row into the database; this
   walk did not.
2. **Study data.** The "Clinical source" picker offered the manifest as "v1.0 · approved". It also offered the
   efficacy file, which is not a clinical source. Preview took 3.9 s and showed 11 tables. The populations table
   matches the published Table 14-1.01: Efficacy 79/81/74 = 234; completed 58/25/27 = 110. Freeze took 4.2 s.
   (`04-…`, `05-…`.)
3. **Build** — see Defect 1. This environment has no model key, so no real drafting was walked.
4. **Review** — see Defect 2.
5. **Narratives.** 95 of 95, the same number as the pilot's engine-only run. Each lists what the source does not
   record: AEACN, ADEX, ADCM, ADMH, DTHDT and DTHCAUS.
6. **Assembly** on build 2 (a failed, template-only build) reported:
   - "Assembled, incomplete": 181 links checked, 1 failed;
   - the body's bookmarks reach 3 levels where 4 are required;
   - 16 sections still hold a data placeholder, each of which blocks placement;
   - 12 §16 appendices block placement: 16.1.1–16.1.5, 16.1.7, 16.1.9, 16.2.2, 16.2.3, 16.2.6, 16.2.8 and 16.3;
   - one gap for each heading the build did not save.

   Placement needs a complete build, so it was not reached. After the narratives wrote §12.3.2 and §14.3.3, build
   2 holds 20 rows ("20 of 119 … drafted").

## Defect 1 — the gateway's demo-mode reply was saved as an AI draft (fixed, `c226754e3`)

With no provider key, the development gateway answers each drafting call with a fixed text: "Document Draft (Demo
Mode) — No draft was written…" (`deterministic: true`, model `demo-mode`). `acceptSectionReply` took it as a
draft.

- **Build 1** saved it on **30 headings** as `ai_generated = true` by `demo-mode`. The section review listed each
  one as "Draft · Send for review" (`06-build-1-before-fix.png`).
- **Fix.** The builder now refuses a deterministic or demo-mode reply, as the MCP drafting tool already does
  (`server/mcp/tools/drafting.ts`). The lineage records `no_model_provider`, and the section keeps its template.
- **Build 2**, on the same server, saved **18 rows, none AI-labelled and none with that text**
  (`07-build-2-after-fix.png`, `live/db-rows.txt`).
- **Tests.** Red: 2 failed, and 1 passed (the provider-draft case, which must hold). Green: 3 of 3. The CSR suites
  pass (61 files, 652 tests), and `tsc --noEmit` passes.

## Defect 2 — the CSR scientific review offered no study data (fixed, `c29fdcb4e`, `d39a037dc`)

**What happened.** JM sent the CSR to Rhea. Rhea opened "Record review decision" and chose Approve. The CSR
scientific review said: "This program has no saved package run. Start one from eCTD compile with the approved
clinical source tables, then return here." "Record approval" stayed disabled (`08-review-before-fix.png`).

**Why.** The picker read only `/api/submission-orchestrator/runs`. The server's reader already accepts a
document's frozen study data (`saved-clinical-tables.ts:47-50`). Package runs now refuse a clinical source, so the
advice could not be followed. **A CSR started from New document could not be approved or signed.**

**Fix.** Two parts:
- `listCsrStudyData` also returns the study data that an imported working copy's CSR build was drafted over
  (`importSource.jobId` → `csr_build_jobs.source_run_id`). The row is still read in this organization and this
  project, and the build must be this organization's. Every entry carries `via`.
- The picker reads that list beside the package runs and labels each entry. A failed read is shown as an error,
  never as an empty list.

**After the fix.** Rhea was offered "Study data frozen for this document · CDISCPILOT01 · source v1.0 · frozen
2026-11-02 02:57 UTC". She chose it, and the server read its tables (preview 200). The review moved on to "2.
Each figure in the saved text" (`09-…`, `10-…`). There it says, correctly, that this document has no saved text
yet: its sections are still the template scaffold, because the build's text reaches Authoring only through
"Import approved sections".

**Tests.**

| Test | Red (before the fix) | Green |
|---|---|---|
| Server | 2 failed; 2 safety cases passed | 4 of 4 |
| Client | 5 new tests failed; 4 existing passed | 9 of 9 |

Removing the organization condition from the join fails the foreign-build test (`red/mutation-…`). One existing
test pinned the old empty-state copy; it now pins the new copy.

## Found, not fixed here (each outside this change's files, or a decision)

| # | What | Where | Why not here |
|---|---|---|---|
| F1 | **New document lists "GLOBAL · Clinical Study Report (CSR)" twice.** The second entry is `registry:ICH_CSR`, and a CSR made from it has no "Build from the study's data" (shown: `live/db-rows.txt`, "Template check: second CSR entry"). One document type, two catalog entries, and only one carries the type's function. | `shared/regulatory/global-document-registry.ts` `ICH_CSR`; `server/services/market-specs/document-template-library.ts` | Catalog convergence (RULE 4: one entry per type). It belongs to the catalog's owner. |
| F2 | **A template is counted and labelled as drafted.** The section review says "18 of 119 ICH E3 headings drafted" and "Draft · Send for review" for rows with `ai_generated = false` that still hold `[…]` placeholders. | `CsrBuildProgress.tsx` `CsrHeadingReview` | It is a different file; it needs its own hold. |
| F3 | **The confidence interval prints with two decimals** ("-2.10–1.10") where Table 14-3.01 gives "(-2.1;1.1)". | `server/services/csr/csr-efficacy-table.ts` `interval` | The scientific review binds an approval to `tablesSha256` over these tables. Changing the format would stop every recorded approval from verifying. `csr-bayesian-result.test.ts:53` pins the format. This needs a versioned table format. |
| F4 | **The reviewer's task has no link** to the document or the Review board. The board is reached from the project's Review tab, or `/concept2cure/review?program=…`. | Tasks detail sheet | Shell and Tasks belong to the coordinator's D work |
| F5 | **The "Clinical source" picker lists every JSON file in the project's Vault**, including the efficacy file, which cannot be a clinical source. | `vault-source-input.ts` source list | Low risk; it belongs with the source-list owner |
| F6 | **"Import approved sections into Authoring" creates a new working copy.** It does not fill the CSR started from New document. | Roadmap step 3 ("a heading's draft is the editor's section draft") | Roadmap work, not a repair |
| F7 | **The builder does not pace itself under the gateway's 30-per-minute user limit.** Without a key, instant demo-mode replies cross it (39 refusals in build 2). With a real key each heading takes seconds or more, so a sequential build stays far below the limit. | `csr-job-runner.ts` | Not reached with a model key; kept on record from the 10-31 walk |
| F8 | **Fixed later the same day (addendum below).** An imported working copy that still held "[DATA TO BE INSERTED…]" could be approved and placed as an approved CSR leaf; only the assembly's placement refused a placeholder. The CSR scientific review now refuses it, by the same rule. | `shared/authoring/csr-scientific-review.ts`, `csr-scientific-review-core.ts`, `csr-placeholders.ts`, `csrEvidenceMap.ts` | — |
| F9 | **A heading is approved on the build board without its text.** The section review shows no section text, so the approver cannot read what they approve before the import. | `CsrBuildProgress.tsx` `CsrHeadingReview` | Same file as F2; roadmap step 5 folds this review into the editor's |
| F10 | **A failed build shows no reason**, only "CSR build N · failed · NN%". The list returns no error, and `GET /api/csr/jobs/:jobId` has no client caller. | `server/routes/csr-jobs.ts` list, `CsrRunBuilds.tsx` | Another file; needs a hold |
| F11 | **Copy that no longer matches the product.** The imported §14.3.3 says to "run the narratives again on the build board", a label that does not exist (it is "CSR builds from this study data"). eCTD Compile still says "First-study AI narrative generation remains unavailable." while the editor composed 95 narratives. | `CsrNarrativeReferenceView.tsx`, `CsrNarrativeReadiness` | Copy in other lanes' files |
| F12 | **The picker that shows the source preview hides the builds, with no way back.** "Freeze newer study data" opens the source picker and hides the build, narratives and files until a freeze or a reopen; a freeze selects the new study data, which has no builds. | `editor/StudyDataBuild.tsx` | A behaviour change to the panel; not needed for the demo if it is not pressed |

**2026-11-05:** F2 (`e92252c1b2`), F9 (`a8a2f3d06e`) and F10 (`dd5b03c24d`) are fixed, red first
(`../2026-11-05-csr-path-green/README.md`). F6 is fixed too: the approved sections are imported into the CSR
document itself (`../2026-11-05-import-into-the-csr/README.md`).

F8 to F12 were found by an independent check of this walk and its runbook (a workflow of 15 agents that mapped each
stage against the code and the local database, then critiqued the runbook). Its corrections are taken into this
file: the approval count, the appendix count, the row count, the P-89 claim and the runbook's live path.

## Not walked (blocked in this environment)

- **Real drafting.** This container has no model key, so the gateway runs in demo mode. Section approvals, "Import
  approved sections" and the scientific review of the imported copy were walked later on build 2's template text
  (addendum). Without real drafts, these were not walked:
  - the review of drafted text, with figures mapped to cells;
  - E-sign of the CSR (P-89's figure question does not apply to it: an imported copy carries no project source
    references, so the gate returns clear);
  - "Place CSR files";
  - "Place into filing".

  This is reported as blocked, not done.
- **Production mode.** The pinned drafting model is PQ-pending (`server/services/ai-gateway/approved-models.ts`). With `NODE_ENV=production`, high-risk drafting is refused, every heading falls back to its template, and the build fails. A demo in production mode first needs the model's PQ, or a founder decision.

## Addendum (later, 2026-11-02): the import path walked, F8 fixed, and a correction to `c29fdcb4e`

The founder offered a model key. None reaches this container: no environment variable, no `.env` value, and no
credential at the proxy (`api.anthropic.com` answers 401). Real drafting therefore stays blocked, and it is the next
rehearsal once the key is in the environment. Meanwhile, the import path the first walk could not reach was walked
on build 2's template text, the fail-closed gap F8 was fixed, and the walk found that one of this morning's fixes
did not work on real data.

**Walked in the running app (`live/11-…` to `13-…`):**
1. JM sent build 2's 20 headings for review on the build board, and Ava, who did not request the build, approved
   all 20 (`11-…`).
2. JM pressed "Import approved sections into Authoring". The working copy, titled with the study's title, has 20
   sections. The receipt lists the failed build, three headings with no output and a placeholder in §9.8 (`12-…`).
3. JM sent the copy to Rhea. Her board lists it as "Awaiting your review".
4. Rhea's scientific review offered "Study data the imported CSR build was drafted from · CDISCPILOT01 · source
   v1.0 · frozen 2026-11-02 02:57 UTC". The server read its tables (preview 200).
5. The review named the **16 sections that still hold a data placeholder**, each with its text. "Record approval"
   stayed disabled (`13-…`).

**The correction to `c29fdcb4e`.** That fix followed `importSource.jobId`. A stored import names its build as
`importSource.id`, the job id as text, with the selection beside it (`authoring-from-draft.ts`; read the same way by
`authoring-source-import.ts`). Its test had built the origin from the selection's type, so it passed, and the list
missed every real import.
- On the working copy, the corrected query finds `920a530f…`.
- The test now uses the stored shape. It fails on the old query (`red/study-data-stored-shape-red.txt`) and
  passes on the new one.

**F8, fixed.**
- **One rule.** The bracket rule moved into `shared/authoring/csr-scientific-review.ts` (`CSR_DATA_PLACEHOLDER`).
  `csr-placeholders.ts`, which the build runner and the assembly's placement use, takes it from there.
- **The verifier.** `placeholderIn` reads a section's visible text, markup read as blank. The verifier refuses a
  section that still holds a placeholder (`CSR_EVIDENCE_SECTION_PLACEHOLDER`), beside its refusal of a blank one.
- **Where it applies.** The same verifier runs when the review is approved and again at every release (freeze,
  signature, export). So a CSR with a placeholder can be neither approved nor released.
- **Behaviour change, named.** A CSR approved before this change, whose text still holds a placeholder, is now
  refused at its next release.
- **The screen.** The reviewer's gap list names each such section first, quoting a long placeholder cut and
  closed with "…]".

**Tests.**

| Run | Result |
|---|---|
| Red, before the fix | 5 failed: the verifier accepted a correctly mapped section that still said "[DATA TO BE INSERTED FROM SOURCE RECORDS]" (`red/f8-placeholder-red.txt`) |
| Green | 20 of 20 |
| Every suite that reaches these modules | 86 files, 1,053 tests (`green/f8-suites.txt`) |
| Mutation: reading raw HTML instead of the visible text | fails the two markup controls (`red/f8-mutation-without-markup-masking.txt`) |

The verifier's complexity is unchanged: the check is a function of its own.


## Demo runbook (for the founder)

The order matters more than any single click. **A build, its narratives and its files belong to the study data
they were started from.** A CSR created live freezes new study data, which has no builds. So the demo is prepared
on one CSR document beforehand, and the live part opens that document. Nothing below types an identifier the
study does not have.

### Demo day, 2026-11-09: the founder's Codespace, in order

*Added 2026-11-09 for the client demo at 1:00 pm Pacific.*

**AnA's conversation was refused on every turn on trunk from 2026-11-06.** That came from b8cee0745: every run
started at tier 3, which only a self-hosted model may serve. The founder chose the fix: d8febe020, on trunk at
5fa65a602. A run now starts at tier 1. A turn that reads a CONFIDENTIAL source, such as the CDISC files in the
Vault, is still refused on Anthropic. It was verified in the running app with a dummy key: the turn reached
Anthropic (ALLOW_INPUT_TIER).

1. **Update the Codespace.** In its terminal:
   ```
   git pull --ff-only origin concept2cure-v2
   bash .devcontainer/post-start.sh
   ```
   This restarts the app on the checkout and reinstalls dependencies if the lockfile changed. Its output must show
   an `ANTHROPIC_API_KEY: …` line. With no key, add the Codespaces secret, then stop and start the Codespace.
2. **Check the CSR study.** The output must say "CSR study ready". If it says "did not finish", the preparation
   walk could not load `playwright`, which is not in package.json. Run:
   ```
   npm install --no-save playwright@1.56.1 && npx playwright install --with-deps chromium && bash .devcontainer/post-start.sh
   ```
   The Codespace's study has no efficacy file, so §11.4 reads "not supplied".
3. **Check AnA.** Sign in with Demo access, open the CDISCPILOT01 project and ask "What is this project about?".
   It must answer. "Blocked by AI gateway policy" means the app runs an older commit.
4. **Build the CSR now**, not live: Author → "CDISCPILOT01 Clinical Study Report" → Build from the study's data →
   Build CSR draft. It takes tens of minutes. Then do steps 11–13 below.

### Before the demo: the environment

1. **A model key.** Set `ANTHROPIC_API_KEY` in the demo environment. Without it, nothing is drafted: each heading
   keeps its template and the build ends failed.
2. **Mode.** With `NODE_ENV=production`, drafting needs a PQ-passed model, and the pinned one is pending. Run the
   demo in a non-production environment, or record the PQ first.
3. **The organization's tier.** `standard` allows 10 CSR builds per period, `enterprise` is unlimited, and `free`
   has none ("Failed to enqueue CSR build job"). Every press of Build counts.
4. **Three people with signing authority, and their passwords at hand:** an author, a reviewer and an approver.
   Separation of duties refuses one person in two roles, and the requester of a build cannot approve its headings.

### Before the demo: the data and the prepared CSR

*Updated 2026-11-05 to the app on trunk after F1, F5, F6, F9 and B7 (re-walked as
`../../DEMO/2026-11-05-csr-lifecycle/README.md`, "Re-walk after the fixes"). Migrate the demo database from the
current set first (`node scripts/db/deploy-migrate.mjs`): a database migrated before 2026-10-31 answers 500 on the
study data. A local server's `ALLOWED_ORIGINS` must name its own URL (for example
`ALLOWED_ORIGINS=http://127.0.0.1:5200,http://localhost:5200`), or sign-in and `demo:seed` are refused with
`CORS_ORIGIN_BLOCKED`.*

5. **Fetch the pilot files** with `scripts/cre/fetch-cdisc-pilot-adam.mjs`. Attribute CDISC; do not modify the
   files or charge for them.
6. **Upload into the project's Vault:** ADSL, ADAE, ADLBC, ADLBH and ADVS (`.xpt`), define.xml, then the efficacy
   file, then the manifest. The manifest names each file by its Vault id and full SHA-256, so it is written after
   the uploads. Re-uploading a dataset makes the manifest stale.
7. **Approve each of the seven files in the Vault:** the author sends it for review naming the reviewer and the
   approver, the reviewer signs the review, the approver approves. A few minutes per file.
8. **Create the CSR document:** Author → Find or start a document in the editor → More document actions → New
   document… → M5 → "GLOBAL · Clinical Study Report (CSR)". It is listed once (F1, `23375e29e0`), and every CSR
   document shows **Build from the study's data**.
9. **Freeze the study data** in that document: Clinical source → the manifest (the picker lists clinical sources only, F5) →
   Preview clinical tables → Freeze as this document's study data. Take screenshots of §11.1 and §11.4 here if you
   want to show the tables; the preview is not reachable later without hiding the builds (F12).
10. **Build CSR draft**, then wait. It drafts up to 119 headings one after another: tens of minutes.
11. **Approve the headings** on the build board, as the reviewer or approver (not the requester). Read each
    heading's saved text first (**Read saved section text**, F9); the approval is offered only after that read, and
    template text is not offered for review (F2).
12. **Import approved sections into this document** (author), in the CSR's own panel. It previews what it will
    write ("Into “…”, by ICH E3 section number. No other document is created"), asks the reason, writes the approved
    headings into this CSR and shows its receipt in place; the editor shows the imported text (F6). There is no
    working copy: this CSR is the document that is reviewed, signed and filed. A section someone edited since is
    left as it is and reported. The receipt lists each section that still holds a "[…]" placeholder. Replace each one with the study's data, by hand: the scientific review refuses a
    section that still holds one, so the CSR cannot be approved until it is gone.
13. **Build narratives** (seconds) and **Assemble CSR files**. Supply each blocking §16 appendix from the Vault
    (PDF) or declare it not applicable with a reason; 16.1.x and 16.3 come only from the sponsor.
14. **Send the CSR for review** to the reviewer (More document actions → Send for review). Until a reviewer
    approves it, Freeze and E-sign say "Needs its scientific review first" (B7). In Submission Center, create sequence 0000 for the
    project's submission.
15. **The compile will refuse** without the agency's application number, a bound sponsor and its D-U-N-S number.
    The pilot has none; do not type one. End the demo at placement, or show the refusal.

### Live: what to show (each step was used in the running app on 2026-11-02, except where marked)

1. **The Vault.** The project's seven study files at Approved, each with its review and approval sign-offs.
1a. **AnA.** In the project's composer, ask about the project, its plan or its next step. Do not ask AnA to read
   the CDISC files in the Vault. They are stored CONFIDENTIAL, and AnA refuses them on Anthropic ("requires local
   processing"), as the founder chose on 2026-11-09. The CSR build is not affected.
2. **New document** (optional, show only): More document actions → New document…, to show the CSR is one
   document type in the one editor. Do not continue in it.
3. **The prepared CSR.** Open it and expand **Build from the study's data**. Study data shows the frozen entry.
   Show the build's section review, the narratives (95 of 95, each listing what the source does not record) and
   the CSR files with their gaps.
4. **The CSR's imported sections** (needs a real build for drafted text). Show the drafted text beside the tables.
5. **Review**, as the reviewer: the project's **Review** tab → the CSR → **Record review decision** →
   **Approve**. In the CSR scientific review, tick **"Study data frozen for this document"** (since F6, the build
   writes into this CSR, so its own study data is listed; "…the imported CSR build was drafted from" appears only
   for a separate working copy) → **Read the retained tables** → map each figure to its cell → attest → **Record
   approval**. A section that still holds a "[…]" placeholder blocks it (F8).
6. **Stop at the review.** E-sign and Freeze of a CSR whose sections are imported AI drafts are refused, first with
   WORKFLOW_MODEL_QUALIFICATION_REQUIRED, then with WORKFLOW_HUMAN_ADOPTION_REQUIRED, until a person replaces that
   text. No model pin is qualified yet (workflow-import-governance.ts). Show the refusal as the governance control,
   or end at the recorded review. **Place into filing** and **Place CSR files** follow a signature, and are not
   reachable today with drafted text.

### What not to do live

- Do not press **Build CSR draft**, **Freeze newer study data** or **Freeze as this document's study data**. Each
  either takes tens of minutes or moves the panel to study data that has no builds.
- In "CSR build", do not choose a failed or keyless build.
- Do not create the CSR live and expect the prepared build to appear in it.
- Do not re-upload a dataset after the manifest is approved.
- Do not ask AnA to read or summarise the CDISC files in the Vault: it refuses CONFIDENTIAL sources on Anthropic.
- Do not E-sign or freeze the CSR expecting it to pass: imported AI text is refused at release (live step 6).

## Reproduce

The scripts are in the session scratchpad. They are not committed, because they carry the pilot's paths.

```
npx vitest run server/services/__tests__/csr-builder-no-provider.test.ts \
  server/services/csr/__tests__/csr-study-data-list.pglite.test.ts \
  client/src/concept2cure/v2/__tests__/reviewDecisionCsrEvidence.test.tsx
```
