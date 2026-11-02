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
   a route naming Rhea and Ava, Rhea signed the review, and Ava approved it. That is 21 signatures, each with a
   password. All seven are `approved` at their exact hash. The browser took about 30 s per file; by hand, plan on a
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
   - one gap for each heading the build did not save.

   Placement needs a complete build, so it was not reached.

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

## Not walked (blocked in this environment)

- **Real drafting.** This container has no model key, so the gateway runs in demo mode. Without real drafts, these
  were not walked:
  - section approvals;
  - "Import approved sections";
  - the review of drafted text;
  - E-sign with the P-89 figure gate;
  - "Place CSR files";
  - "Place into filing".

  This is reported as blocked, not done.
- **Production mode.** The pinned drafting model is PQ-pending (`server/services/ai-gateway/approved-models.ts`). With `NODE_ENV=production`, high-risk drafting is refused, every heading falls back to its template, and the build fails. A demo in production mode first needs the model's PQ, or a founder decision.

## Demo runbook (for the founder)

### Before the demo: the environment

1. **A model key.** Set `ANTHROPIC_API_KEY` in the demo environment. Without it, nothing is drafted: after today's
   fix, each heading keeps its template and the build ends failed.
2. **Mode.** If the demo runs with `NODE_ENV=production`, drafting needs a PQ-passed model, and the pinned one is
   pending. Run the demo in a non-production environment, or record the PQ first.
3. **The organization's tier.** `standard` allows 10 CSR builds per period, `enterprise` is unlimited, and `free`
   has none: it fails with "Failed to enqueue CSR build job". Every press of Build counts.
4. **Three people with signing authority:** an author, a reviewer and an approver. Separation of duties refuses
   one person in two of these roles.

### Before the demo: the data

5. **Fetch the pilot files** with `scripts/cre/fetch-cdisc-pilot-adam.mjs`. Attribute CDISC. Do not modify the
   files or charge for them.
6. **Upload into the project's Vault:** ADSL, ADAE, ADLBC, ADLBH and ADVS (`.xpt`), define.xml, then the efficacy
   file, then the manifest. The manifest names each file by its Vault id and full SHA-256, so it is written after
   the uploads. Re-uploading a dataset makes the manifest stale.
7. **Approve each of the seven files in the Vault:**
   - the author sends it for review, naming the reviewer and the approver;
   - the reviewer signs the review;
   - the approver approves it.

   This takes a few minutes per file, about 20–30 minutes in all.
8. **Run the build ahead of the demo.** With a real key it drafts up to 119 headings one after another. Plan on
   tens of minutes, and do not run it live. After the build:
   - have the reviewer approve the headings, one at a time (the requester cannot approve their own build's
     headings);
   - build the narratives (seconds);
   - supply or declare "not applicable" for the §16 appendices (16.1.x and 16.3 come only from the sponsor);
   - assemble the CSR files;
   - create an open sequence in Submission Center for this project.

### Live: what to show (each step was used in the running app on 2026-11-02)

1. Open the project. On **Author**, choose **Find or start a document in the editor**, then **More document actions
   → New document…**. Title it, choose **M5**, search "Clinical Study Report", and pick the **first** "GLOBAL ·
   Clinical Study Report (CSR)" (F1). Then **Create document**.
2. Open **Build from the study's data**. For **Clinical source**, choose "… ADaM bundle manifest · v1.0 · approved"
   (not the efficacy file, F5). Choose **Preview clinical tables** (about 4 s). Open §11.1 and §11.4, and set them
   beside the published Tables 14-1.01 and 14-3.01.
3. **Freeze as this document's study data** (about 4 s). Show **Build CSR draft · CDISCPILOT01** and the prepared
   build under "CSR builds from this study data", with its section review, narratives (95) and CSR files.
4. **Review.** On the reviewer's account:
   - open the project's **Review** tab;
   - choose the document, then **Record review decision**, then **Approve**;
   - in the CSR scientific review, tick the study data and choose **Read the retained tables**;
   - map each figure to its table cell.
5. **E-sign** on the approver's account. P-89 asks about each figure not found in its source.

### What not to do live

- Do not press Build. It takes tens of minutes and uses a credit.
- Do not choose the second "Clinical Study Report (CSR)" entry.
- Do not choose the efficacy file as the clinical source.
- Do not re-upload a dataset after the manifest is approved.

## Reproduce

The scripts are in the session scratchpad. They are not committed, because they carry the pilot's paths.

```
npx vitest run server/services/__tests__/csr-builder-no-provider.test.ts \
  server/services/csr/__tests__/csr-study-data-list.pglite.test.ts \
  client/src/concept2cure/v2/__tests__/reviewDecisionCsrEvidence.test.tsx
```
