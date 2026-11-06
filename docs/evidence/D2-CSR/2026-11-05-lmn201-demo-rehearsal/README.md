# The CSR demo, rehearsed on today's trunk with the Lumen LMN-201 pack (2026-11-05)

Launch row D2, ledger package L1. The founder has a platform demo today with the CSR as its example. This rehearsal
walked the CSR path in the running app, as three people, on a database provisioned from empty at `f7d5b3ade`
(462/462 migrations). It used the existing Lumen demonstration pack, the founder's runbook
(`../2026-11-02-phase2-demo-walk/README.md`) and the LMN-201 sandbox runbook
(`data/seeds/lumen-demo/LMN201_CSR_SANDBOX_RUNBOOK.md`).

**Read with the CSR lane's lifecycle walk.** `docs/evidence/DEMO/2026-11-05-csr-lifecycle/README.md` is the
canonical walk of this path. It covers the CDISC pilot, runs as the runtime role with RLS forced, and holds the
re-walk scripts. This rehearsal is its companion on the Lumen pack. The two agree on F2, F6 and F10. R-1 to R-4
below were found only here and were sent to that lane on 2026-11-05.

**Nothing here is Lumen's data.** The pack shows "Lumen Bioscience (demo — not affiliated)", and the CSR source is
the kit's SYNTHETIC LMN-201-like Part B fixture: 23 invented participants, labelled "NOT ACTUAL DATA" on every
table.

## What already exists (RULE 3)

Every step is existing product, and nothing was added. The pieces are:
- the seed: `scripts/demo/launch-demo/seed.mjs --pack lumen`, packs `lumen.mjs` and `lumen-content.mjs`;
- the Vault review route and signing;
- `editor/StudyDataBuild.tsx`;
- `CsrBuildProgress.tsx` and `CsrRunBuilds.tsx`;
- the `/api/csr/jobs` build, narratives and assembly;
- `/api/authoring/import/source`.

## What was walked, step by step

| # | Step | Result | Evidence |
|---|---|---|---|
| 0 | `seed.mjs --pack lumen --plan enterprise` | 39 records, 0 failures: 4 projects; the synthetic CSR source in LMN-201's Vault with its SHA-256; the RePreve study design; CMC; tasks; a fictional approval letter from which the inbox proposed 4 commitments | seed log |
| 1 | Vault: author sends the source for review (reviewer Rhea, approver Ava, due date, reason) | `POST /api/regulatory/documents/:id/advance` 200; the source is "In review" | |
| 2 | Rhea signs the review; Ava approves | Two Part 11 signatures, each re-verifying the password; 200, 200 | `01-…` |
| 3 | Author → Find or start a document in the editor → More document actions → New document… → "GLOBAL · Clinical Study Report (CSR)" | **One** CSR entry now (F1 of 11-02 is closed). The document is created with 119 ICH E3 sections; the bar shows Freeze held "Needs its scientific review first", plus E-sign and Place into filing | `02-…` |
| 4 | Build from the study's data → Clinical source "…SYNTHETIC… · v1.0 · approved" → Preview clinical tables | About 6 s. 8 engine tables: §10.1, §11.1, §11.2, §11.4, §12.2 ×3, §12.3. §11.1: 12 / 11 / 23. §11.4: global cure 10/12 vs 4/11, with CI and p-value "—" (the engine does not invent them) | `03-…` |
| 5 | Freeze as this document's study data | `POST …/csr/study-data` 201 | |
| 6 | Build CSR draft | `POST /api/csr/jobs` 202. **No model key in this container**, so: "failed · 26%", "Not complete: §4, §6, §9.2 … have no saved text" (F10 closed); "2 of 119 drafted · 16 are template text with data missing" (F2 closed) | `04-…` |
| 7 | Section review: the author sends §1; Ava (not the requester) reads it and approves | 200, 200 | |
| 8 | Import approved sections into this document → reason → Import into this document | §1 of the CSR document holds the build's text (F6 closed): no new document, and approvals are said not to transfer | `05-…` |
| 9 | Build narratives | 202. "This run's source is a hand-built summary with no subject-level dates, so no narratives were composed." This is honest; see "For the demo" | |
| 10 | Assemble CSR files | 202. "Assembled, incomplete: … 76 link(s) checked, 1 failed"; bookmarks at 3 levels where 4 are required; each placeholder section "Blocks placement"; each §16 appendix offers "Supply from the Vault" or "Not applicable because"; placement into 5.3.5.1 says to create a sequence first | `06-…` |

There was no failed request and no page error on any step.

## Not walked (blocked here, reported as blocked)

There is no model key in this environment. So these were not walked:
- AI drafting of the 119 headings;
- the CSR scientific review of drafted text, with each figure mapped to its cell;
- E-sign of the CSR;
- placement into a sequence;
- AnA drafting a CSR into the canvas from the conversation. The CSR lane made `draft_authoring_document` reachable
  on every turn in `1d129897b`, but it needs a model key.

The scientific review will refuse while any section holds a "[…]" placeholder. That is by design (F8).

## Found today (handed to the CSR lane's holder, `011Dpx…`)

| # | What | Where | Demo impact |
|---|---|---|---|
| R-1 | **The import preview renders below the whole section list** (119 rows), far from "Import approved sections into this document", with no scroll or focus to it. A click looks like nothing happened. | `CsrRunBuilds.tsx` import preview | **Closed** (`b3c176b34d`, `71095a9003`); re-walked below. |
| R-2 | The import preview request is sent twice per click (two identical `previewOnly` POSTs). | `CsrRunBuilds.tsx` | None. Not a defect: React StrictMode runs the effect twice in development only. |
| R-3 | The source-preview tables have no column spacing: the header reads "Synthetic LMN201 armSynthetic CONTROL armTotal". | the study-data preview table | **Closed** (`0180e0eec2`); re-walked below. |
| R-4 | A local seed against a dev server fails with `CORS_ORIGIN_BLOCKED` unless `ALLOWED_ORIGINS` names the seed's base URL. | `server/middleware/enterprise-security.ts`; `scripts/demo/launch-demo` | Setup only, now in the lane's runbook (`9772520bd`): set `ALLOWED_ORIGINS=http://localhost:5200`. |

### Re-walked on trunk, 2026-11-06, on the Lumen pack

This was run at `7ad066cfe` on the same database as above. It did not write anything: the tables preview is a
read-only POST, and nothing was frozen or imported.

- **R-1 closed.** The re-walk clicked "Import approved sections into this document" once and waited 1.5 s.
  - Focus was in the textarea labelled "Reason for importing (8–2000 characters, recorded with each section)".
  - The field was inside the viewport, 374 px from the top. Nobody scrolled.
  - The box says "§1 Title Page · Already holds this approved text", which is the import of step 8.
  - Screenshot: `07-r1-import-first-click.png`.
- **R-3 closed.** The re-walk opened Freeze newer study data, which only reveals the chooser, then Preview clinical
  tables and §11.1.
  - The table is `reg-tbl`, and every header cell has 8 px × 12 px padding.
  - The columns read Population, Synthetic LMN201 arm, Synthetic CONTROL arm, Total, at 147, 230, 243 and 76 px.
  - "Return to current frozen study data and CSR build" leads back without freezing.
  - Screenshot: `08-r3-preview-11-1-spaced.png`.
- No request failed and the page raised no error.

The CSR lane checked the same two fixes on the CDISC pilot (`../../DEMO/2026-11-05-csr-lifecycle/README.md`, "After the
founder's rehearsal").

### With production's launch-scope gate on, 2026-11-06

`LAUNCH_SCOPE_ENFORCE` is on by default when `NODE_ENV=production`, and off in a local development run. Under it,
screens outside the launch catalog say "not in this release" and their APIs answer 403. So the demo path was walked
again, read-only, with the gate on (`LAUNCH_SCOPE_ENFORCE=on`, same database and commit). The steps were: the project
home, the Vault source, the CSR in the editor, the study-data panel, the §11.1 and §11.4 preview and its return, the
import box (then Cancel), the assembly gaps, and Submission Center.

- No request was refused and no page said "not in this release".
- The writes were only the tables preview and the import preview, both reads.

**The project's objective.** The project home said "No objective is recorded for this project yet": the Lumen seed
sets none. The plan's spine starts from a project with a goal, so the run-of-show now records it beforehand.
- It was set through the project page's own form ("Set the objective"), with the gate on. The objective and the
  success criteria are the pack's own statement of the public listing (`LMN201_DESIGN.objectives`, `endpoints` in
  `scripts/demo/launch-demo/packs/lumen-content.mjs`), taken from ClinicalTrials.gov NCT05330182.
- `PUT /api/charters/by-project/:id/objectives` answered 200. The page shows "Version 1", the source and "The
  project's objective is recorded." (`09-project-objective-recorded.png`).

## For the demo (run-of-show, verified as far as above)

**Before the demo**
1. **Environment.**
   - Set `ANTHROPIC_API_KEY`. Without it every heading keeps its template and the build fails, as in step 6.
   - Run outside `NODE_ENV=production`. The pinned drafting model is PQ-pending.
   - Use the organization on the enterprise plan (`seed.mjs --plan enterprise`).
   - Have three accounts with signing authority: an author, a reviewer and an approver.
2. **Seed.** Run `npm run demo:seed -- --pack lumen --email <author> --plan enterprise`. Locally, the server needs
   `ALLOWED_ORIGINS` set to its own URL.
3. **Record the project's objective.** On the LMN-201 project page, use "Set the objective":
   - Objective: "To evaluate whether LMN-201 with standard-of-care antibiotics improves sustained clinical cure
     compared with placebo."
   - Success criteria: sustained clinical cure at week 12.
   - Taken from: A trial registry entry, NCT05330182.
   - Reason: one sentence.

   The project then opens on its goal.
4. **Run steps 1–8 above beforehand**, on one CSR document.
   - Build CSR draft takes tens of minutes with a key.
   - Approve the drafted headings as the reviewer or approver, not the person who requested the build.
   - Import them.
   - Replace any "[…]" placeholder in the imported text by hand.
5. **Narratives.** The LMN-201 synthetic source has no subject-level data, so it composes none. To show narratives,
   use the CDISC pilot project of the 11-02 runbook (95 of 95), or say plainly that this source carries none.

**Live (about 10 minutes)**
1. **Project.** The LMN-201 project home: one project with its objective, its steps (Plan, Evidence, Author, Review,
   Submit, Respond) and the conversation with AnA.
2. **Vault.** The synthetic source at Approved, with its review and approval signatures, bound to the file's
   SHA-256.
3. **The CSR in the one editor.** No separate CSR app: the CSR is one document type, with "Build from the study's
   data" inside the editor.
4. **Study data.** Show §11.1 and §11.4 without writing anything:
   - press Freeze newer study data, which only opens the chooser;
   - pick the clinical source and press Preview clinical tables, a read;
   - open §11.1 and §11.4;
   - press "Return to current frozen study data and CSR build".

   This was walked on 2026-11-06: one read-only POST, and the build and its section review came back as they were.

   What to say:
   - The numbers come from the deterministic engine over the frozen source.
   - AnA writes the narrative over them, and every figure is checked against them.
   - The CI and p-value are "—" because the source does not carry them. The platform never invents a statistic.
5. **Section review.** Template rows are labelled honestly and are not reviewable. Drafted rows are read, then
   approved by someone other than the requester (separation of duties).
6. **Import.** The approved text lands in this document. One click opens the import box with the reason field
   focused.
7. **Assembly.** The gap list: what blocks placement and why, appendix by appendix.
8. **Review and e-sign.**
   - Send the CSR for review.
   - The reviewer's CSR scientific review maps each figure to its table cell and refuses any placeholder.
   - The approver e-signs (Part 11: meaning, reason, password).
   - Place into filing at 5.3.5.1.

**What not to do live**
- Do not press Build CSR draft or Freeze as this document's study data. The first takes tens of minutes. The second
  moves the panel to study data that has no builds. Freeze newer study data is safe on its own; it only opens the
  chooser (step 4).
- Do not choose a failed or keyless build.
- Do not create the CSR live and expect the prepared build to appear in it.
