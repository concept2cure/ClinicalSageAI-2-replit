# The 2026-11-10 sales rehearsal: the whole platform, as a buyer would see it

The founder, 2026-11-10: "Continue and expand with sub agents to help you get us close to GA and for sales
presentations of the entire platform."

This is a presenter's rehearsal. Five stories (rA to rE) were walked in the app with launch scope on, row-level
security on, dev sign-in off and no model key, on a development build served by Vite over a shared working tree (see
"How it ran" for why that matters). A verifier then walked each story's findings again. Everything below was seen in
the app, with a screenshot under `shots/`, unless the line says it was read from the API or the code. The per-story
notes are `rA-notes.md` to `rE-notes.md` in this folder.

## In short

The whole platform can be shown today **as a guided tour, with care**. It cannot be shown **end to end**: a document
written in the editor can never be placed into a filing (finding B1), and the test package and compile fail (B2, B3).

Two conditions apply to every verdict below:
- Present from a **production build** of a frozen commit. On a Vite dev server over a shared working tree, open
  wizards and dialogs close by themselves when another session edits a file (see "Not product defects").
- On the demo host, **install the report fonts** (fonts-noto-core, fonts-noto-cjk) and **restart after AUD-02 lands**.
  Without them, PDF export answers 503 and the audit trail shows a red chain banner.

| Client type | Presentable | The one reason |
|---|---|---|
| Biotech | with care | Vault governance, Part 11 signatures, the protocol, the one editor and the agency-response loop all work and persist. Filing an authored document does not, and the project's data room lists another company's records. |
| Pharma | with care | The biotech story plus CMC section signing and the honest biologic refusal. Avoid QC testing and batches (97.4 % shown as Pass), the contradiction sweep and Reporting ("0 for Pharma"). |
| CRO | with care | The Phase 2 study story works: Biostatistics, all ten RBM tabs, Tasks, IR questions and Reporting. The reviewer's document is empty, the CSR build needs a model key, and no role below admin exists to show client separation. |
| Medical device | with care | No non-IVD device project is seeded. A new 510(k) project creates its plan and eSTAR outline, and the editor, signatures, hazards and design inputs work. Avoid the data room, the Client Review Room and the test package. |
| Diagnostics | with care | NeuroPanel-Dx (an IVD) shows the 510(k) Summary, signatures, the eSTAR PDF and the QMS. A new "510(k) for IVD" project gets no plan, and the IVD report pack ends "Blocking". |

## What already exists

This rehearsal extends these; it does not repeat them (RULE 3).

- The walkthroughs: `docs/demo/README.md`, `docs/demo/biotech-walkthrough.md`, `docs/demo/mdx-walkthrough.md`,
  `docs/demo/IVD_510K_WALKTHROUGH.md` (a script demo; not walked here).
- The demo seed, through the product's own API: `scripts/demo/launch-demo/seed.mjs`, `lib.mjs` and
  `scripts/demo/launch-demo/packs/*`.
- `docs/evidence/DEMO/2026-11-09-rehearsal/README.md` and its `deep-walk/` folder (findings.json), re-checked below.
- `docs/evidence/DEMO/2026-11-09-platform-tour/README.md`: 16 stops passed with launch scope **off**.
- `docs/evidence/DEMO/2026-11-10-lumen-data-handoff/README.md`: the Lumen story and how to seed it.
- `docs/evidence/HUMAN-TEST/README.md` and `J1` to `J5`: five journeys walked on 2026-11-06 (not re-walked).
- `docs/evidence/D2-CSR-DRAFT-CONTROL/2026-11-06/walk/README.md`: the earlier CSR walk and its recipe.
- `docs/design/ONE_DESIGN_PLAN.md` §2 (the retired patterns) and `.claude/skills/claude-ui-design-principles.md`.

## How it ran

- App: `http://127.0.0.1:5240`, database `gademo` (local PostgreSQL 16).
- The server booted at commit `8a65a6f3a`, per `/api/version`. The seed ran earlier, on `332b4152e`.
- Posture, read from the running process: runtime role `app_service`, `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`,
  `ALLOW_DEV_AUTH=0` (dev sign-in answers 404), no model-provider key. No SMTP: sign-in codes went to the server log.
- `NODE_ENV=development`. The client was served by Vite over the shared working tree, while other sessions edited it.
  The server (tsx, no watch) kept the code it booted with. So uncommitted fixes reached the client but not the server.
- Sign-in was through the real form for every persona. Every persona is an organisation admin.
- Viewports: 1440 x 900 light, then 390 x 844 and dark. One headless Chromium per agent.
- AnA refuses honestly with no key. That is expected and is not a finding. Each dead end it leaves is one line in
  "Needs a model key".

How screenshots are kept: `shots/` holds only the screenshots this record, the notes and `docs/demo/*.md` cite,
reduced to half scale and 24 colours. Sign-in screens are not kept as evidence.

What could not be seeded in this posture:
- Risk-based monitoring data through the seed: the Lumen pack's RBM step reads `GET /api/mdx/rbm-data-runs`, which
  answers 403 `LAUNCH_SCOPE`. The packs were seeded with launch scope off.
- The CDISCPILOT01 efficacy results file (transcribed from the published CSR) is not on this machine.
- No CSR build or AnA narrative exists, because there is no model key.
- Shadow Review (503), the dispatch QC narrative (PROVIDER_UNAVAILABLE) and readiness orchestration produced nothing.
- No submission sequence reached "validated".
- No persona below organisation admin, so role gating cannot be shown.

What the rehearsal and the verifiers changed in `gademo` (so the next presenter is not surprised):
- rA: an objective, a Vault upload with a second version, its review and approval, a protocol section edit, a new
  Nonclinical Overview (2.4), commented, review-signed and frozen; a duplicate 2.5; an IR question and its approved
  response; a new IND project. Verifier: one refused placement, one refused check, one dry-run assemble (500).
- rB: an RBM signal, a task, an IR question and a Biostatistics working document. One CSR build (stopped at 26 %).
- rC: an ISO 14971 document, reviewed, approved and frozen; a hazard and a design input; a CAPA; an SOP
  acknowledgement; two new projects (RRC, a 510(k); RRV, a 510(k) for IVD).
- rD: a new SOP (SOP-001, Effective), its training, a deviation, two CAPAs, a change request (approved), a CMC
  section approval, a Module 3 compile (twice, V2 and V3), a Vault upload.
- rE: a new IND project (Rehearsal rE). Verifier: an empty RBM ingest run (runId 28, 0 rows) on the org-2 LMN-201 copy.

## Run of show

Only steps that worked. Each has the screenshot that shows it and the line to say; where a step's shot does not show
something, the step says so. Shots are in `shots/`.

### rE: first impression (Ana, org 2, any project)

| Step | Shot | Say |
|---|---|---|
| Open `/concept2cure/login`: e-mail, password, then the e-mailed six-digit code | none (sign-in screens are not kept) | "Sign-in is e-mail, password and a one-time code, with organisation SSO available." |
| Land on Home: greeting, one composer, your projects, your open items | `rE-03-home.png` | "Everything starts from one conversation with AnA and your projects." |
| Search (⌘K), type "Xanomeline", Enter | `rE-12-search-open.png`, `rE-13-search-xanomeline.png` | "One palette reaches every place and every project." |
| The project page: title, composer, conversations, project knowledge | `rE-15-project-xano.png` | "A project is the program: its goal, its documents, its filing and its team." |
| Plan, Author, Review, Submit, Respond | `rE-16-project-plan.png`, `rE-18-project-author.png`, `rE-19-project-review.png`, `rE-20-project-submit.png`, `rE-21-project-respond.png` | "The regulatory work is one click away, from plan to agency response." |
| Author, Open the CSR (wait about 3 s) | `rE-24-editor-csr-loaded.png` | "Every document type opens in the same editor; the CSR carries its study-data build inside it." |
| Rail: Projects, Vault, Quality | `rE-26-rail-projects.png`, `rE-29-rail-vault.png`, `rE-34-rail-quality.png` | "Portfolio, source data and the quality system, beside the filing." |
| Dark mode and phone width | `rE-72-dark-home.png`, `rE-74-dark-project.png`, `rE-62-m390-home.png`, `rE-64-m390-project.png` | "The same product in dark mode and on a phone." |

### rA: a biotech filing a US IND (C2C-101, org 2: Ana, Rhea, Ava)

| Step | Shot | Say |
|---|---|---|
| Home, then Projects | `rA-01-home.png`, `rA-02-projects.png` | "Every program sits in one place, filtered by client, client type and pathway." |
| Open C2C-101, Set the objective (text, criteria, source, reason), Record; reload | `rA-04-objective-form.png`, `rA-05-objective-after-reload.png` | "Every project starts from a goal, versioned with its reason and source." |
| Plan step | `rA-06-plan-step.png` | "The plan is computed from the filing type: what an IND needs, who does it and by when." |
| Vault, Add files, folder 2.6.2, Upload; then Upload new version | `rA-10-vault-uploaded.png`, `rA-13-versions-lineage.png` | "Every file is hashed on the way in. Versions are never overwritten." |
| Send for review: choose Rhea to review and Ava to approve, due dates, reason (the shot shows Ava chosen; Rhea's row is scrolled out of it) | `rA-15-send-for-review.png`, `rA-16-sent-for-review.png` | "The author cannot review their own work; the route is recorded with its reason." |
| As Rhea: Review board, All projects, open the version, Sign review | `rA-21-rhea-sign-dialog.png`, `rA-22-rhea-signed.png` | "A Part 11 signature: re-entered password, a meaning, a reason, bound to this exact file." |
| As Ava: open the version, Approve | `rA-26-ava-sign-dialog.png`, `rA-28-vault-approved-history.png` | "Review then approval by two other people, each in the hash-chained history." |
| Author, Write the protocol; edit a section with a reason, Save | `rA-29-protocol.png`, `rA-31-protocol-section-saved.png` | "The protocol is structured, and every edit carries a reason into the audit trail." |
| Plan, Module 2, Nonclinical Overview (2.4), Create from template; write 2.4.2, save with a reason; reload | `rA-35-create-from-template.png`, `rA-38-editor-after-reload.png` | "Every document type opens in the same editor from the project's plan." |
| Select text, Comment; More actions, Send for review to Rhea; as Rhea, E-sign (Review) | `rA-40-comment-added.png`, `rA-48-rhea-esigned.png` | "Comments anchor to the text, and the reviewer signs in the editor." |
| Resolve the comment with a reason, then Freeze | `rA-50-comment-resolved.png`, `rA-53-frozen-after-reload.png` | "Once frozen, the content is sealed and cannot change." |
| On a second document, as Rhea: Record review decision, Run independent checks | `rA-62-independent-checks.png` | "Independent checks run without a model, and a half-written document cannot be approved." |
| Submission Center: Sequences, then Dispatch (skip Validation: raw rule codes and an error count; do not quote Dispatch's counts) | `rA-64-sc-sequences.png`, `rA-67-sc-dispatch.png` | "The gate is deterministic: it says exactly what stands between this sequence and the FDA." |
| Communication, the FDA IR, Questions & responses: record Q1. Write the answer in the editor before the room (the way in is "Open response in editor", which the avoid list keeps off screen); in the room, show the saved answer and Use saved editor response | `rA-77-question-recorded.png`, `rA-84-response-recorded.png` | "Agency questions are found in the letter without AI, and each answer is written in the same editor." |
| As Ava: Approve response | `rA-87-ava-response-approved.png` | "Each response is signed by someone other than its author, with its meaning and reason." |
| Projects, New project: IND, details, Review & create; Plan, Target Product Profile, Create from template (one quick pass) | `rA-88-new-project.png`, `rA-91-new-project-review.png`, `rA-92-new-project-created.png`, `rA-93-first-document.png` | "A new IND project with its plan in about a minute, and its first document in under two." |

### rB: the Phase 2 study (LMN-201, org 6: Lumen Lead, Lumen Reviewer)

| Step | Shot | Say |
|---|---|---|
| As Lumen Lead, open LMN-201 from Home | `rB-02-lmn201-project.png` | "One project, one goal: the study's objective, its filing status and its people." |
| Author, open the CSR, expand "Build from the study's data" | `rB-04-csr-build-section.png` | "The CSR is built from the study's frozen data, inside the same editor every document uses." |
| Show the earlier build's result (do not press Build) | `rB-57-csr-build-state-later.png` | "Without a qualified model it refuses to invent text, and it names each heading it did not write." |
| Work areas, Biostatistics (do not read its phase or sample size aloud: it shows "Phase III" on a Phase 2/3 study, E19) | `rB-07-biostat.png` | "Every number here comes from a deterministic engine; the model never supplies a figure." |
| CSR S9.7 Methods, Save as a working document | `rB-10-biostat-save-working-doc.png` | "The statistics become a working document in the project." |
| Risk-based monitoring, Overview | `rB-12-rbm.png` | "Monitoring under ICH E6(R3): what needs attention first, with the engine's number behind each item." |
| RACT, then KRIs, then QTLs (do not read the RACT's approval reason: it is the seed's note, E6) | `rB-15-rbm-risk-assessment-ract.png`, `rB-16-rbm-key-risk-indicators.png`, `rB-17-rbm-quality-tolerance-limits.png` | "The risk assessment is approved by a second person; the indicators and limits sit beside it, each with its thresholds." |
| Patient profiles | `rB-19-rbm-patient-profiles.png` | "Central monitoring shows which subject is atypical and why." |
| Central monitoring, Log signal; reload | `rB-25-rbm-signal-persisted.png` | "A monitor's own observation joins the engine's signals in one inbox." |
| Monitoring plan | `rB-22-rbm-monitoring-plan.png` | "The plan's actions come from the signals and the risk assessment." |
| Tasks, New task, Create; reload | `rB-30-tasks-created-persisted.png` | "Anyone can add work, tracked with its project and module." |
| As Lumen Reviewer: Home, then LMN-201, Review (do not open the IB) | `rB-33-reviewer-review-step.png` | "Each person sees what is waiting on them." |
| Communication, the IR, Questions & responses | `rB-40-comm-questions.png` | "The agency's questions are extracted from the letter deterministically, then confirmed by a person." |
| Record question 1; reload | `rB-44-comm-question-recorded.png` | "Each question carries its response, owner and approval; the package waits until all are approved." |
| Reporting, Bundles, Schedules (do not press Export) | `rB-51-reporting-bundles.png`, `rB-52-reporting-schedules.png` | "Reports can be bundled for governance and computed on a schedule." |

### rC: a device and an IVD company (NeuroPanel-Dx 510(k), org 2: Ana, Rhea, Ava, Quinn)

| Step | Shot | Say |
|---|---|---|
| Projects, NeuroPanel-Dx 510(k) | `rC-02-neur-project.png` | "Intake recorded the regulatory facts once: class, product code, regulation, panel, predicate and the device flags." |
| Plan step | `rC-03-neur-plan.png` | "The plan is the 510(k) work breakdown, scheduled back from your target date." |
| Author, open the 510(k) Summary, Document view | `rC-10-editor-510k-document-view.png` | "This 510(k) Summary is approved and frozen, so its signed content cannot change." |
| More, Signatures (on this seed every signature is Rhea Reviewer's, so do not point at who signed or use this screen for separation of duties; a fresh seed after the seed fix lands is expected to show a third person approving, not seen here) | `rC-11-editor-510k-signatures.png` | "Each signature carries its meaning, a reason and a password re-check, bound to the content hash." |
| More, New document, ISO 14971 template, Create | `rC-15-new-document-created.png` | "A new document starts from a regulatory template, in the same editor." |
| Type into section 1, reason, Save; reload | `rC-19-new-document-reloaded.png` | "Every save records why the text changed." |
| Send for review to Rhea | `rC-22-sent-for-review.png` | "One act records the request, the reviewer's task and the audit entry." |
| As Rhea: E-sign, Review | `rC-27-rhea-review-signed.png` | "A second person signs the review; the author is not offered as reviewer." |
| As Ava: E-sign, Approval; reload | `rC-30-ava-approved-reloaded.png` | "Approval by a third person freezes the document as the signed record." |
| Plan, Design controls, New hazard; reload | `rC-38-hazard-after-reload.png` | "The risk file is ISO 14971, with the risk score computed, not typed." |
| New design input, risk reference HZ-01; reload (do not read or press the AnA line "Close the dc-… gap" above the matrix, E25) | `rC-40-design-input-after-reload.png` | "Each design input enters the trace matrix untraced until it is linked." |
| Submit, Assemble the eSTAR, Generate official eSTAR (PDF) | `rC-45-estar-generate-result.png` | "It fills the official FDA eSTAR from governed values and names the fields it does not hold." |
| Submission Center, Dispatch | `rC-48-sc-dispatch.png` | "The dispatch gate fails closed, and separation of duties is enforced on the server." |
| As Quinn: Quality, MDX-SOP-101, Read and acknowledge | `rC-54-sop101-acknowledged.png` | "Read-and-understood training is recorded per person and per revision." |
| Change control, expand MDX-CC-2026-001 | `rC-57-change-control-mdx-expanded.png` | "A software change runs through change control, with its impact assessment and linked records." |
| From the project's Review step, Quality, CAPA, Raise CAPA (in one go); reload | `rC-63-capa-after-reload.png` | "A CAPA is raised inside the project it belongs to, on the audit trail under your name." |
| Projects, New project, Medical Devices, 510(k) Premarket Notification, profile, Create (one quick pass); then its Plan | `rC-73-new-510k-project-created.png`, `rC-86-rrc-plan.png` | "A first-time device team records the classification and predicate once, and gets the 510(k) work plan, scheduled back from its target date." |
| New project, Author, Create editing copy, B2 Indications for use, Save; reload | `rC-80-new-510k-b2-after-reload.png` | "The filing's own outline is the document you write in, section by section." |

### rD: quality, CMC, Vault and the Part 11 record (org 2: Quinn, Ava, Rhea, Cal, Ana)

| Step | Shot | Say |
|---|---|---|
| As Quinn: Quality | `rD-02-quality-landing.png` | "Every controlled document, its version in force and who approved it, in one register." |
| New controlled document, SOP template, Create and open | `rD-05-new-sop-opened.png` | "A new SOP starts from a template, in the same editor." |
| Type Purpose, reason, Save; back to the register | `rD-08-new-sop-row.png` | "The new SOP sits in the register as a Draft until it is reviewed and approved." |
| Send for review: Ava reviews, Rhea approves | `rD-09-send-for-review-form.png`, `rD-11-new-sop-under-review.png` | "Only designated QMS approvers can approve; the SOP then waits on its reviewer." |
| As Ava: Sign the review | `rD-13-ava-sign-review-modal.png` | "The reviewer signs with meaning, reason and password under 21 CFR 11.50 and 11.200." |
| As Rhea: Approve, sign; reload | `rD-16-new-sop-effective.png` | "The approver's signature makes the version effective; the author cannot approve their own." |
| More, Training, assign Cal and Quinn | `rD-19-training-assigned.png` | "Training is assigned by person or role against the version in force." |
| As Quinn: Read and acknowledge; reload | `rD-21-training-coverage-after-ack.png` | "Read-and-understood is recorded per person, and coverage updates at once." |
| Change control, CAPA, Deviations, the other registers | `rD-22-quality-change-control.png` | "The whole quality system in one place." |
| Deviations, Record, Investigate; reload | `rD-33-deviation-under-investigation-more.png` | "A deviation moves through investigation with its immediate action." |
| In C2C-201, as Quinn: Raise change request, Advance; then as Ava, open it (do not approve it in the room: its risk, impact and plan read "Not recorded yet", and approval does not require them, E32) | `rD-47-change-advance-dialog.png`, `rD-48-ava-change-action.png` | "The proposer is offered Advance, not Approve; approval goes to a second person." |
| As Cal: C2C-201, CMC / Module 3, §3.2.S.1 Approve section; reload (point at the §3.2.S.1 row only; the rows around it print camelCase missing inputs, E36) | `rD-63-cmc-3-2-S-1-read.png`, `rD-65-cmc-3-2-S-1-approved.png` | "The signer reads exactly the content that will be filed, and the signature covers its hash." |
| C2C-101 (a biologic), CMC / Module 3, Module 3 build (do not press Run contradiction sweep or Compile Module 3 above the refusal) | `rD-73-cmc-c2c101-biologic-refusal.png` | "The product says plainly what it does not compose, and does not fake it." |
| C2C-201 Vault, Add files, folder 3.2.S.7, Upload | `rD-82-vault-doc-detail.png` | "Every file is hashed, classified and filed to its CTD section on the way in." |
| Document panel, History | `rD-83-vault-doc-history.png` | "Each document carries its own verified audit history." |
| Vault search "chamber qualification" (a phrase in the title) | `rD-84-vault-search.png` | "Search finds the document we just filed." (That the search also reads a PDF's body text was checked through the API with a body-only phrase, "Synthetic rehearsal document"; it was not seen on screen.) |
| Reporting (C2C-201), Catalog, Compliance & Audit Assurance Pack, Run (do not read its dates: ISO times, E39) | `rD-92-reporting-run-compliance.png` | "A compliance report computed from the governed record, including what we did a minute ago." |

The Audit trail is not in the run of show. Its audit-event chain banner reads "verification failed" until AUD-02 runs
on the demo server (B7; the API returned `broken` when the record was checked), and the rehearsal's shots of it
(`rD-54-audit-esign-filter.png`) predate that and read "no entries yet". Open it in the room only after AUD-02 lands
and a fresh walk shows the chain intact.

## Do not click, do not claim

Merged from the five stories and their verifiers.

**Environment**
- Do not present from a Vite dev server over a tree anyone is editing. Open forms, signature dialogs and uploads were
  lost to hot reloads.
- Do not press Export PDF (a report, a bundle's reports or manifest) on a host without the Noto fonts: 503.
- Do not open the Audit trail until AUD-02 is running: the audit-event chain banner reads "verification failed".
- Do not click quickly on Quality or the Vault: reloads meet 429 "Too many document requests".

**AnA (no model key)**
- Do not type to AnA, press any AnA chip or starter, "Triage my day", "Draft with AnA", "Draft response with AnA",
  Run Shadow Review, Get help or Demos, Sales demonstration. Each ends in "No AI provider is configured".
- Do not reload an AnA conversation or say "every turn is saved": the turn disappears.
- Do not press "Build CSR draft" or "Resume build" live: "being written" shows for minutes, then it stops at 26 %.
  Do not claim the CSR is drafted, figure-checked or fileable, or that the engine's tables show in the CSR.

**Filing**
- Do not Freeze an editor document and then Place into filing: 409, and a frozen document can never be checked again.
  Do not claim authored documents reach the sequence today.
- Do not click Assemble a test package (500), Compile eCTD (a wall of 43 red errors) or Dispatch.
- Do not quote error counts: Validation says 8, Validate says 41, Compile says 43, the Submit step says "4 blockers"
  above 16 items.
- Do not open Builder or Validation in front of a quality lead on the 510(k): CTD codes, raw rule codes, a uuid and a
  duplicate Device Description leaf.

**Projects and the editor**
- Do not open a project's Evidence step (data room), on any project, including a new one: it lists the
  organisation's Lumen suppliers, audits and deviations, each "original file is unavailable".
- Do not point at Dossier readiness, Module completion or the Plan's "0 started": they read 0 beside real drafts.
- Do not click "Find or start a document in the editor": it opens whatever document changed last. Start from Plan,
  Create from template, or open a document from the Author step.
- Do not Create from template a document that exists (2.5 or 2.3 on C2C-101): a duplicate is made.
- Do not type in the editor and move on without saving: a reload opens another document and the text looks lost.
- Do not claim approval checks completeness: an ISO 14971 file and an SOP with most sections empty were approved.
- Do not claim the app follows the OS dark mode; use its own setting.
- Do not leave New project or Raise CAPA open while talking. Fill them in one go.
- Do not create a "510(k) for IVD" project live: it gets no plan. Use "510(k) Premarket Notification".
- Do not read the protocol's header ("Sponsor not recorded") or the C2C-101 Team card (only Ana).

**Review and tasks**
- As the Lumen Reviewer, do not open the Investigator's Brochure or press Record review decision: all 9 sections are
  empty.
- Do not follow Rhea's Home review task: it opens another project's empty board. Use Review board, All projects.
- Do not use notification links ("Open the version in the Vault" answers 422; "Open task" is "managed outside the
  board"), and do not explain the bell's red 88.
- Do not say "site 107" for the triggered visit: the KRI breach is at site 104.

**Communication**
- Do not open "Open response in editor": the drawer shows a uuid, a fingerprint and agency.context keys.
- Do not open the BLA approval letter on the LMN-201 IND project.

**Work areas**
- Do not open Risk-based monitoring or CMC / Module 3 from C2C-101: it is a biologic, and RBM data is on LMN-201.
- Skip RBM Site risk and Site oversight ("0 sites").
- Do not quote LMN-201's sample size or phase: 23 in the CSR, 314 in Biostatistics, 375 in RBM; Phase 2, 3 or III.
- Do not open CMC QC testing or Batch records (97.4 % against 98.0–102.0 % shown as "Pass", batch "Eligible: Yes").
- Do not press Run contradiction sweep (two false "High specification_conflict" rows).
- Do not open the CMC read panels for §3.1 ("the drug substance is C2C-201 tablets") or §3.2.P.8.
- Do not open the organisation-level Vault's governed artifacts: no titles.
- Do not open Device engineering's tiles or AnA lines ("No engineering documents yet", "Open change requests 0").
- Do not promise the Client Review Room: it is always empty.
- Do not say the predicate search works (503 not configured) or that the eSTAR is pre-filled (Regulation Number blank).
- Do not open Reporting home on a pharma project ("0 for Pharma") or run the IVD pack (ends "Blocking").
- Do not say CAPA numbers are unique: three CAPAs in org 2 are CAPA-2026-0001.
- Do not raise a CAPA from Quality with no project open: it says nothing is recorded, and one was recorded.
- Do not open an Effective SOP in the editor (two contradictory lock banners).
- Do not promise legal holds or retention from the Vault document panel (they are in Admin settings).
- Do not search ⌘K for a document: it finds projects, conversations and pages only.
- Do not open Subscription & billing on the demo tenant ("7 of 5 seats" against "7 / 25").
- Do not demonstrate role gating: every persona is an organisation admin.

## Refused under the launch gate

With `LAUNCH_SCOPE_ENFORCE=on`, **no screen in any story was refused**. Every tab of Submission Center, Vault, CMC,
RBM, Quality and Reporting opened (rE's probe of every tab on XT; rB opened all ten RBM tabs).

| What was refused | Who calls it | Shown in the 2026-11-09 tour (launch scope off)? |
|---|---|---|
| `GET /api/mdx/rbm-data-runs`: 403 `{code: LAUNCH_SCOPE}` | Only the demo seed's Lumen RBM step. No screen calls it. RBM "Load extract…" posts to `/api/mdx/rbm-metric-ingest`, which the gate admits (`shots/v-rE-F07-load-extract.png`). | Yes. The tour's RBM stops passed (overview, RACT, patient profiles, site risk), on data seeded with the gate off. |

Not the gate: CMC "Quality by design" answered 409 `CMC_MODALITY_NOT_ESTABLISHED`, and CMC on C2C-101 answers 409
`CMC_PRODUCT_CLASS_OUT_OF_SCOPE`. Both are the CMC composition boundary (P-28), which is correct.

**For the founder to decide.** The RBM work area is open under the gate, but its seed cannot run under it, because
`/api/mdx/rbm-data-runs` is claimed by no surface. Claiming it for the rbm surface
(`shared/constants/ui-surface-registry.ui-v2.ts`, its rbm `apiPrefixes`) changes the launch scope. That is a founder
decision, not a session's.

## Findings

Reproduced by a verifier first, ranked blocks-demo, embarrasses, polish. Where two stories found the same defect it
is listed once, with both ids. "Holder" is from `COORDINATION.md` as the verifiers read it on 2026-11-10.

### Blocks the demo

**B1. A frozen, signed document can never be placed into filing (rA-F1).**
- Seen: Freeze accepts the 2.4; Place into filing answers 409 `INDEPENDENT_CHECK_REQUIRED`; Check on the frozen
  document answers 409 `AUTHORING_DOCUMENT_IMMUTABLE`. The review dialog calls the checks "(optional)".
- Shots: `v-rA-F1-placed-refused.png`, `v-rA-F1-check-frozen.png`, `rA-61-rhea-decision-dialog.png`.
- Cause: freeze (`server/routes/authoring.router.ts:5434`) and placement (`server/services/coauthor/coauthor-snapshot.ts:429`,
  `:656`) both call `assertWorkflowImportRelease` (`server/services/authoring/workflow-import-governance.ts:329`).
  The ledger's catch-all at `:378` turns any read or verification failure into `INDEPENDENT_CHECK_REQUIRED`. Leading
  hypothesis (not proven, the DB read was refused): the snapshot transaction reads the ledger under a different tenant
  context under RLS.
- Fix changes: `workflow-import-governance.ts`, `coauthor-snapshot.ts`, `client/src/concept2cure/v2/surfaces/ReviewDecisionDialog.tsx`.
- Holder: unheld (the S4 owner of workflow-import-governance.ts is named at COORDINATION.md:355, with no row).
- Fix: make the catch say which failure happened (503 for an unreadable ledger); one release rule on one
  tenant-scoped executor, so what freeze accepts, placement accepts; drop "(optional)". Red first: an RLS + app_service
  integration test that freezes then places.

**B2. "Assemble a test package" answers 500 (rA-F3, rC-F03).**
- Seen: "Whether the test package was assembled could not be confirmed — Request failed." on the IND and the 510(k).
- Shots: `v-rA-F3-test-package.png`, `rC-51-sc-test-package.png`.
- Cause: `server/services/submission-gateways/regional-packager.ts:1066-1076` throws a ValidationError (FDA 1789, no
  Study Tagging File for leaves at 5.3.x). `server/services/ectd/assemble-from-core.ts:343-350` converts only
  identity refusals, and `server/routes/submissions.ts:2050-2068` sends everything else to a 500. The seeds place
  leaves at 5.3.x with no study id (biotech protocol and SAP; the 510(k)'s device leaves). The STF rule is applied to
  a device eSTAR sequence too.
- Fix changes: `assemble-from-core.ts`, `submissions.ts`, `regional-packager.ts`; seed: `packs/biotech.mjs`, `packs/mdx.mjs`.
- Holder: product files unheld; seed packs unheld (last owner Design continuation 011Dpx, holds nothing).
- Fix: convert the ValidationError to a 422 naming the untagged files; skip or refuse up front the STF rule for a
  device sequence; seed the study id and STF tags. Red first: a route test with a 5.3.1.4 leaf and no study id.

**B3. Compile is a wall of red, and three gates count differently (rA-F4).**
- Seen: Validation 8 errors, Validate 41 findings, Compile 43 errors; history row "no manifest — cannot anchor a
  lifecycle".
- Shots: `v-rA-F4-sc-validation.png`, `v-rA-F4-validate.png`, `v-rA-F4-compile-page.png`, `rA-72-compile-result.png`.
- Cause: `client/src/concept2cure/v2/surfaces/EctdCompile.tsx` (~654-700 renders Validate; `:714` hard-codes the
  history text). Identity prerequisites are mixed into the findings and never shown first.
- Fix changes: `EctdCompile.tsx`. Holder: unheld.
- Fix: show the identity prerequisites as a short checklist before Compile is offered; show the Validation tab's
  count; a failed row says "Failed — nothing compiled".

**B4. Every project's data room lists the organisation's Quality records (rA-F2, rC-F01, rE-F01).**
- Seen: 22 to 37 "sources" on C2C-101, NeuroPanel-Dx, XT and brand-new projects: Lumen suppliers, audits, management
  reviews, deviations, "Quality record relationship: 7", each "The original file is unavailable". The project's own
  Vault PDFs are not listed. These are org 2's own records: not a tenant leak.
- Shots: `v-rA-F2-evidence.png`, `v-rC-F01-evidence.png`, `v-rE-F01.png`, `rE-61-rehearsal-re-evidence.png`.
- Cause: `server/services/clinical-regulatory-evidence/record-source.ts:97-117` (`syncQualityProjectSources`, called
  from `data-room-search.ts:179` on every first page) writes every row of `server/services/qms/project-evidence.ts:58-77`
  whose scope is "organization" into each project's catalogue.
- Fix changes: `record-source.ts`, `project-evidence.ts`, `client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx`;
  the project page's display is `ProjectHome.tsx` (held, see below).
- Holder: server files and the panel unheld.
- Fix: project only rows with project scope (or a change link naming this program). Name child rows by their parent.
  Red first: an org-scope supplier and a fresh project; the project's sources total must be 0.

**B5. The reviewer's only document is an empty Investigator's Brochure (rB-F1).**
- Seen: Lumen Reviewer's "Waiting on you 1" is a 9-section IB, each "No saved content in this section". The board
  says In review; the editor says Draft.
- Shots: `v-rB-F1-review-board.png`, `v-rB-F13-review-dialog-keys.png`.
- Cause: `scripts/demo/launch-demo/packs/lumen.mjs:170` creates the IB from the template with empty sections, and
  `ensureIbReview` (`:341-366`) requests review on it. `server/routes/authoring.router.ts:3395` does not refuse a
  document with no content.
- Fix changes: `packs/lumen.mjs`, `packs/lumen-content.mjs`; `server/routes/authoring.router.ts` (request-review).
- Holder: seed unheld; authoring.router.ts: COORDINATION row 93 holds only the draft route in that file.
- Fix: seed real IB section text before requesting review; request-review refuses 409 `NOTHING_TO_REVIEW` on an empty
  document.

**B6. A refused AnA turn disappears, though the screen promises it is saved (rE-F03).**
- Shots: `v-rE-F03-before-reload.png`, `v-rE-F03-after-reload.png`.
- Cause: `server/routes/ana-ri/stream.ts:1036-1040` answers 503 before the thread and the user turn are saved
  (`:1427`). `client/src/concept2cure/v2/surfaces/ConversationThread.tsx:2052` promises "every turn is saved".
- Fix changes: `stream.ts`, `ConversationThread.tsx`. Holder: Anna runtime (session_01KZK3…, COORDINATION.md:567).
- Fix: save the thread, the user turn and a refused assistant turn before the provider check; or stop promising it.

**B7. The audit-event chain shows red (rD-F02).**
- Seen: "Audit-event chain verification failed — 1 broken link over 1 entry".
- Shot: `v-rD-F02-audit-trail.png`.
- Cause: `server/routes/part11-compliance.ts:820` re-derives the hashed timestamp in JavaScript; the trigger
  (`db/migrations/20260222_audit_events_hash_chain.sql`) hashes the database's own text. Every trigger-written row
  reads as broken. The fix (AUD-02) is in the working tree, uncommitted, and the 5240 server does not run it.
- Fix changes: `part11-compliance.ts`, `server/routes/__tests__/part11-chain-trigger-written.pglite.test.ts`.
- Holder: Client administration (01T2woo…, row 95).
- Fix: land AUD-02 and restart.

**B8. CMC shows an out-of-specification result as "Pass" and the batch as releasable (rD-F03).**
- Seen: DS-2502-R2 97.4 % against 98.0–102.0 %, "Pass"; batch C2C201-DS-2502 "Eligible: Yes".
- Shots: `v-rD-F03-qc-testing.png`, `v-rD-F03-batches.png`.
- Cause: the register prints the stored word; batch eligibility trusts it. The seed records it as "pass" on purpose.
  GA-DEMO-02 (uncommitted) needs a `conformance` field that `GET /api/cmc/qc-testing` (`server/api/cmc/routes.ts:744`)
  does not send.
- Fix changes: `server/api/cmc/routes.ts` (unheld); `server/services/cmc/batch-release-evidence.ts`,
  `client/src/concept2cure/v2/surfaces/cmcRegisters.tsx` (GA readiness lane L1, row 95).
- Fix: send the computed conformance; the register and batch release use it. Land and restart.

**B9. The contradiction sweep invents two high-severity conflicts (rD-F04).**
- Shot: `v-rD-F04-contradictions.png`.
- Cause: `server/services/cmc/contradiction-registers.ts:85` passes `{release, shelf}` criteria;
  `server/services/cmc-impact-contradiction-engine.ts:56-79` reads the keys as parameter names. The type prints raw at
  `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:597`.
- Fix changes: those three files. Holder: unheld.
- Fix: key by attribute; compare release with release and shelf with shelf; show "Specification conflict". Red first:
  C2C-201's six specifications give 0 contradictions.

**B10. Organisation-level Vault artifacts have no titles (rD-F05).**
- Shot: `v-rD-F05-org-artifacts.png` (title width measured 0 px).
- Cause: `client/src/concept2cure/v2/surfaces/VaultOrganizationArtifacts.tsx:234-241` puts chip, title and meta in one
  178 px flex row; `.vn .ct-strong` is the only child allowed to shrink.
- Fix changes: `VaultOrganizationArtifacts.tsx`. Holder: Vault parity (01KnUG…, row 102).

**B11. Reporting has nothing to run for a pharma IND, and the IVD pack ends "Blocking" (rD-F06, rE-F12).**
- Seen: "0 for Pharma. No standard pack for Pharma can run here", above a "Device projects" grid of 24 raw month keys;
  the IVD pack runs an Inspection & Finding Summary with no inspection records: "Blocking", "Can't be finalized".
- Shots: `v-rD-F06-pharma-home.png`, `v-rD-F06-mdx-inspection.png`, `v-rE-F12-reporting.png`.
- Cause: `client/src/concept2cure/v2/surfaces/Insights.tsx:388-403` (RO_PRESETS), `:2194` and `:2440-2457`;
  `InsightsDevicePortfolio.tsx:45-60` renders unconditionally. No pack seeds an inspection record.
- Fix changes: `Insights.tsx`, `InsightsDevicePortfolio.tsx` (Reporting analytics 011HLkY…, row 103; the portfolio
  file is also named at row 93); `packs/mdx-content.mjs` (unheld).
- Fix: give the IND segment a runnable pack (the compliance pack and the IND Safety pack both ran); seed one inspection
  for MDx; show device sections only on device projects.

**B12. PDF export answers 503 on this host (rB-F2, rD-F01). Environment, plus one product word.**
- Shots: `v-rB-F2-export-pdf.png`, `v-rD-F01-export-pdf.png`.
- Cause: `server/services/report-os/pdf/writer.ts:117` refuses honestly when Noto fonts are missing; this host has only
  NotoColorEmoji. `Dockerfile.optimized:83-84` and `.devcontainer/post-create.sh` install them, so a hosted image
  exports. Product defect: `Insights.tsx:1458` and `:1468` add a second full stop ("exported..").
- Fix: install the fonts before any demo, and add an export check to the demo set-up's prove step. Holder of the
  full-stop fix: Reporting analytics (011HLkY…).

### Embarrasses

Each line: what, the cause, the files a fix changes, the holder, the fix. Shots are the verifier's unless named.

- **E1. Dossier readiness and the Plan contradict the document list (rA-E1, rE-F09).** "0 drafted", "No editing copy"
  per module, under real drafts; the Plan's "0 started" and a duplicate 2.5 offered. Cause:
  `client/src/concept2cure/v2/surfaces/ProjectDossier.tsx:194`, `:241` (counts only the filing's bound copy);
  `client/src/concept2cure/v2/editor/IndDocumentLibrary.tsx:26-30` matches only template id or exact title, and
  `:68-76` offers Create beside a match. Holder: ProjectDossier.tsx, Project page (session_01FTWcmXm7At3ZXBE5VWn6oS,
  row 83, already handed this at COORDINATION.md:235-242); IndDocumentLibrary.tsx unheld. Fix: one lead sentence when
  nothing is bound; match by CTD code and offer Open, not Create. Shots: `v-rA-E1-project.png`, `v-rA-E1-plan-module2.png`,
  `v-rE-F09-project-author.png`.
- **E2. "Find or start a document" opens whatever changed last (rA-E2).** Today another lane's SOP. Cause:
  `client/src/concept2cure/v2/projectDoors.ts:24` passes no document; `DocumentWorkbench.tsx` opens the newest. Fix
  changes: `projectDoors.ts` (unheld), `DocumentWorkbench.tsx` (held, see below). Fix: open the document list with
  New document. Shot: `v-rA-E2-find-or-start.png`.
- **E3. A frozen or approved record says "Unbound working copy" (rA-E3, rC-F09).** Two lock banners, raw "FROZEN" or
  "APPROVED", and the section's version in the header. Cause: `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:1736`
  ignores status; `:4368`, `:4390` print the unbound words; `server/services/authoring/authoring-document-read.ts:41`
  interpolates the status. Holder: the one editor (see held files). Shots: `v-rA-E3-frozen-24.png`, `v-rC-F09-editor-approved.png`.
- **E4. Rhea's review task opens another project; Ava's board says "Nothing is waiting on you" above her approval
  (rA-E4).** Cause: `client/src/concept2cure/v2/OpenWork.tsx:175` (no program); `surfaces/Review.tsx:575-594` (Vault
  items not counted). Unheld. Shots: `v-rA-E4-rhea-task.png`, `v-rA-E4-ava-board.png`.
- **E5. Ids, enums and codes on screen (rA-E5).** "Snapshot fingerprint", "Target project: <uuid>"
  (`editor/SourceImportDialog.tsx:76`, `:156`; `editor/SourceAssemblyDialog.tsx:89`); IND_MODULE3_REQUIRED and "rule
  pack ind:fda" (`SubmissionCenter.tsx`, `EctdCompile.tsx`); "in_development" (`ProtocolDevSelection.tsx:80`);
  "signature 120" (`CommitmentRow.tsx:197`). Unheld. Shots: `v-rA-F4-sc-validation.png`, `v-rA-F4-compile-page.png`,
  `v-rA-E7-protocol.png`, `v-rA-E9-qr.png`.
- **E6. Seed notes shown as product text (rA-E6, rB-F7).** "Filed … by the launch demo seed; placement confirmed by
  the founder's session" (`packs/biotech.mjs:204`); "Demo seed: fictional letter" (`packs/biotech-work-content.mjs:408`,
  `packs/lumen-content.mjs:273`, `:379`), in monospace (`AgencyInbox.tsx:410-411`); the RACT approval reason "Demo seed:
  approve…" (`packs/lumen-rbm-content.mjs:179`). Holders: biotech-work-content.mjs, GA readiness L1; other packs and
  AgencyInbox.tsx unheld. Rows already written need a fresh seed. Shots: `v-rA-E6-communication.png`, `v-rB-F7-rbm-ract.png`.
- **E7. Walls of controls on the Vault and the protocol (rA-E7, rE-F11).** Protocol: 16 tabs (1911 px in 1176) and a
  "Suggested order" box (`ProtocolDevWorkspace.tsx`, `ProtocolWorkflowGuide.tsx`, unheld). Vault: 7 filter inputs, 3
  AnA chips, 6 tabs, 163 buttons, "Filing binder · IND × FDA · … ich-m4-v2.2" (`Vault.tsx`,
  `server/routes/c2c/project-vault.ts`; Vault parity and J2 hold parts). Shots: `v-rA-E7-protocol.png`,
  `v-rA-E7-vault.png`, `v-rE-F11-vault.png`.
- **E8. The protocol says "Sponsor not recorded" (rA-E8).** `ProtocolDevWorkspace.tsx:131-138` never falls back to
  the project's client; the seed sets no sponsor. Unheld. Shot: `v-rA-E7-protocol.png`.
- **E9. Answering one agency question takes six hops, through a drawer of codes (rA-E9, rB-F8).** Cause:
  `AgencyResponseEditor.tsx:30` (no programName), `:46`; `useAgencyResponseEditor.ts:82` marks the response just
  recorded as stale; `editor/SourceImportDialog.tsx:72-79` prints the fingerprint and section codes. Unheld. Shots:
  `v-rA-E9-edit-response.png`, `v-rB-F8-comm-response-editor.png`.
- **E10. "Dispatch blocked · 4 blockers" heads 16 items, and sends a biologic to CMC (rA-E10).** `ProjectHome.tsx`,
  `MarketBlockers.tsx`. Holder: Project page (row 83). Shot: `v-rA-E10-submit.png`.
- **E11. The C2C-101 team lists only Ana (rA-E12).** The seed adds only Ana as a member (`packs/biotech.mjs`, unheld);
  `ProjectHome.tsx:915-935` (row 83). Shot: `v-rA-E1-project.png`.
- **E12. The app ignores the OS dark mode (rA-E13).** `client/src/concept2cure/v2/V2App.tsx:203` defaults dark to
  false; nothing reads prefers-color-scheme. Unheld. Shot: `v-rA-E13-os-dark-home.png`.
- **E13. The CSR build says "being written" for minutes with no provider, then ends in bad grammar (rB-F3).** Cause:
  in development the gateway falls back to demo mode, 30 calls burn the per-user limit, and the 31st is classed
  `CSR_DRAFTING_RATE_LIMITED` (`server/services/ai-gateway/gateway.ts:1733-1735`, `:1804-1823`;
  `server/services/csr/csr-draft-refusal.ts:68-71`); "The drafts of … was not written"
  (`server/services/csr/csr-job-runner.ts:316-317`, `:341`). Unheld; check with 01QoxbLZ… first. Shot:
  `v-rB-F4-csr-build-section.png`.
- **E14. The CSR promises tables it does not show, and the Synopsis reads "To evaluate Synthetic global cure
  indicator…" (rB-F4).** `client/src/concept2cure/v2/editor/StudyDataBuild.tsx:96-106`; `server/services/csr-builder.ts:783`,
  `:502-504`; the source JSON `data/seeds/lumen-demo/seed-data/lmn201_synthetic_csr_source_v2.json`. Unheld. Shot:
  `v-rB-F4-csr-build-section.png`.
- **E15. RBM Site risk and Site oversight are empty, "0 sites", while signals name sites (rB-F5).** The only writer
  (`server/routes/mdx-rbm.ts:35`, `:79`) derives from site_intel, whose writer is mounted nowhere
  (`server/services/rbm/site-risk-engine.ts:151-172`). Holder: coordinating session (01JbQU…, row 106). Shots:
  `v-rB-F5-rbm-site-risk.png`, `v-rB-F5b-rbm-site-oversight.png`.
- **E16. An approved-BLA letter sits on a Phase 2 IND project (rB-F10).** `packs/lumen.mjs:171`,
  `packs/lumen-content.mjs:268-286`. Unheld. Shot: `v-rB-F10-comm.png`.
- **E17. The IND Safety pack contradicts the Vault: 0 of 9 Module 1 headings, IB "No document recorded" (rB-F11).**
  `server/services/report-os/regional/filing-readiness.ts:132-158` never reads Vault placements;
  `render/render.ts:372` "a Investigational". Unheld. Shot: `v-rB-F12-report-run-1.png`.
- **E18. Reports print provider keys and enums (module1_content, etmf, "Tmf files", "missing") (rB-F12).**
  `server/services/report-os/render/render.ts:284-286`, `:529`; `research-compliance-report-providers.ts:309-314`.
  Unheld. Shots: `v-rB-F12-report-run-0.png`, `v-rB-F12-report-run-1.png`.
- **E19. LMN-201's design disagrees across screens: N 23, 314 or 375; Phase 2, 3 or III (rB-F16).**
  `packs/lumen-content.mjs:169-172`, `packs/lumen-rbm-content.mjs:83`, the CSR source JSON. Unheld. Shot: `v-rB-F16-biostat.png`.
- **E20. RBM, Communication and Tasks use retired patterns: eyebrows, six stat tiles, "Linked to" cards, ten tabs, a
  guidance box (rB-F18, rE-F06, rE-F14).** RBM: `Rbm.tsx:336`, `:363`, `:369`, `RbmSurfacesA.tsx:153-161` (coordinating
  session, row 106). Communication: `CommunicationCenter.tsx:488` (unheld). Tasks: `TaskBoard.tsx` (unheld). Shots:
  `v-rB-F18-rbm-overview.png`, `v-rE-F06-rbm-lmn201.png`, `v-rE-F14-tasks-xt.png`.
- **E21. The editor's header: a false "Nothing to edit yet" while loading, then two rows of equal buttons; four rows
  on a phone (rE-F10, rB-F19).** `DocumentWorkbench.tsx:5218-5229` and its header; `styles/app-v2.css`. Holder: the
  one editor (see held files). Shots: `v-rE-F10-false-empty.png`, `v-rE-F10-editor-loaded.png`, `v-rB-F19-phone-csr.png`.
- **E22. The Client Review Room is always empty (rC-F04).** Nothing writes `client_visibility` (read only in
  `server/routes/mdx-client-review.ts:176-212`). Fix: one quiet line instead of three empty groups
  (`ProjectClientReview.tsx`, `mdx/components/ClientReviewZone.tsx`). A way to share is a new door: founder decision.
  Shot: `v-rC-F04-F15-review-step.png`.
- **E23. A new "510(k) for IVD" project gets no plan (rC-F05).** `server/routes/pyramid.routes.ts:470-474` matches
  registry ids only; `shared/regulatory/filing-catalog.ts:157` already maps `us_510k_ivd` to 510k. Unheld. Shot:
  `v-rC-F05-ivd-plan.png`.
- **E24. The eSTAR leaves Regulation Number blank, and all 38 sections read "empty" (rC-F06).** The wizard stores the
  regulation in metadata (`server/routes/c2c/projects.ts:996`); the eSTAR reads the column
  (`server/services/pathway-engines/estar/estar-administrative-data.ts:112-117`, `:283`, `:741`). Unheld (projects.ts is
  named by D3/S12 only for source-changes). Shot: `v-rC-F06-device-510k.png`.
- **E25. Device engineering is a dashboard of retired patterns with wrong counts and "Close the dc-1794312370414 gap"
  (rC-F07).** `mdx/surfaces/EngineeringSurface.tsx:300-345`; `v2/surfaces/DesignControlsTrace.tsx:480`;
  `v2/surfaces/RiskRegister.tsx:784` ("When the backend is connected"). Unheld. Shot: `v-rC-F07-engineering.png`.
- **E26. Typed text looks lost after a reload (rC-F10).** The cache keeps it, but the editor's URL names no document,
  so a reload opens another one. `DocumentWorkbench.tsx` (held). Shots: `v-rC-F10-typed.png`, `v-rC-F10-after-reload.png`.
- **E27. The 510(k) sequence is described in CTD and eCTD terms, with a duplicate Device Description leaf (rC-F11).**
  Seed: `packs/mdx.mjs:388-415`, `packs/mdx-content.mjs:39-90` (unheld); copy: `SubmissionCenter.tsx` (unheld).
  Evidence: `GET /api/submissions/sequences/3/leaves` (7 leaves); rehearsal shot `rC-46-sc-builder.png`.
- **E28. Three CAPAs in one organisation are CAPA-2026-0001 (rC-F12, rD-F07).** Numbering is per project by design
  (`server/services/capa-mdr/capaMdr.service.ts:137`; `migrations/20260919_capa_code_uniqueness_per_program.sql`); the
  organisation list shows only the code (`client/src/concept2cure/quality/qmsCapaRegister.tsx:86`, `:91`). Holders:
  capaMdr.service.ts, Client administration (row 95); qmsCapaRegister.tsx, Quality and training (01GyGhjg…, row 116).
  Fix: qualify with the project code in the organisation view. Shot: `v-rC-F12-capa.png`; rehearsal `rD-44-org-capa-whole-org.png`.
- **E29. The Review step: "Open change controls 0", a reviewer shown as an e-mail, an approved document missing
  (rC-F15).** The change control was seeded with no project (`packs/mdx-qms.mjs:60-74`);
  `server/services/review/authoring-review-board-standing.ts:76` returns the e-mail;
  `server/services/review/authoring-review-board.ts:270-277` drops RR5-approved documents. Unheld. Shot:
  `v-rC-F04-F15-review-step.png`.
- **E30. New project fires about 87 requests at once and leads with what is not offered (rC-F16).**
  `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx:166-178`; `Projects.tsx:439-446`, `:1051`. Unheld. Shot:
  `v-rC-F02-wizard-open.png`.
- **E31. On a device project, New document offers "CTD module M1–M5" and 469 templates, drug first (rC-F17).**
  `client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx:140`, `:143-144`. Unheld. Rehearsal shot:
  `rC-13-new-document-dialog.png`.
- **E32. A change was approved by e-signature with risk, impact and plan all "Not recorded yet" (rD-F09).**
  `server/services/qms/change-approval-signature.ts` (called from `server/routes/mdx-qms.ts:1348`) never requires them.
  Unheld; the modal is `quality/ChangeControl.tsx` (Quality and training). Shot: `v-rD-F09-RD-CC-2026-001.png`.
- **E33. An SOP with 8 of 9 sections empty became Effective (rD-F10).** `quality/QmsReviewRoute.tsx:113-122` (Quality
  and training); `server/routes/mdx-qms.ts` route start (unheld). Shot: `v-rD-F20-history.png`.
- **E34. An Effective SOP in the editor shows two contradictory lock notes and filing buttons (rD-F13).**
  `server/services/qms/controlled-document-content.ts:43` (unheld); `DocumentWorkbench.tsx:5589-5600` (held). Shot:
  `v-rD-F13-editor-effective-sop.png`.
- **E35. CMC composed text is wrong: "The drug substance is C2C-201 tablets"; "conducted under ACC"; "more than one
  storage condition" (rD-F14).** `server/services/module3Composer.ts` (GA-DEMO-03 uncommitted; L1);
  `server/services/cmc/recorded-stability.ts:1033` (unheld); sources as "stability:5" (`CmcModule.tsx:481`, L1). Shots:
  `v-rD-F14-read-3-1.png`, `v-rD-F14-read-3-2-P-8.png`.
- **E36. CMC section approvals print camelCase keys and "0 of 0 have none recorded" (rD-F15).**
  `CmcModule.tsx:1100-1110` (L1); `server/services/module3-extensions.ts:735-760` (unheld). Shot: `v-rD-F15-cmc-home.png`.
- **E37. The stability register says "0 outside limits · 14 not assessed"; §3.2.P.8 names one OOS (rD-F16).**
  `CmcModule.tsx:1731`; `packs/biotech-work-content.mjs` (both L1). Shot: `v-rD-F16-stability.png`.
- **E38. The audit trail prints codes ("tenant_data_export:2"), sits under "Admin — compliance" with a project
  breadcrumb over organisation rows, says "digitally signed", and has no paging (rD-F17).**
  `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx:460`, `:880`; `server/routes/audit-trail-ledger.routes.ts`.
  Holder: Client administration (row 95). Shot: `v-rD-F02-audit-trail.png`.
- **E39. The compliance report prints ISO times and says e-signature standing "is not inferred" for an e-signed
  change (rD-F18).** `Insights.tsx` (Reporting analytics); `server/services/qms/project-evidence.ts` (unheld). Shot:
  `v-rD-F18-compliance-run.png`.
- **E40. Linked records lead with Vault UUIDs (rD-F19, rC-F14).** `client/src/concept2cure/quality/ChangeRecordDetail.tsx:63-64`
  (Quality and training); seed `packs/mdx-qms.mjs:75-84`. Shot: `v-rD-F19-MDX-CC-2026-001.png`.
- **E41. SOP history headings read "qms-purpose Purpose" (rD-F20).** `quality/ControlledDocumentHistory.tsx:51`
  (Quality and training). Shot: `v-rD-F20-history.png`.
- **E42. The SOP register's More is a row of eight equal buttons, and each time prints twice (rD-F21).** In
  `client/src/concept2cure/quality/**` (Quality and training; confirm the file name). Shots: `v-rD-F21-more.png`,
  `v-rD-F21-quality-register.png`.
- **E43. Normal navigation of Quality meets 429 (rD-F23).** `server/middleware/redisRateLimiter.ts:412-446` puts
  `/api/mdx/qms/documents` reads in the 20-a-minute documents bucket. Unheld. Shot: `v-rD-F23-after-reloads.png`.
- **E44. "Sales demonstration" posts a script id and a tool name as the person's turn (rE-F04).**
  `client/src/concept2cure/v2/V2App.tsx:906-911`; its test `__tests__/shellWiring.test.tsx:163` asserts the id. Unheld.
  Shot: `v-rE-F04.png`.
- **E45. The AnA conversation is a control wall: four header buttons, switches and paragraphs under the composer, a
  mid-word title, "Project" on a Home question (rE-F05).** `ConversationThread.tsx:1636`, `:1958`, `:2289-2322`;
  `AnaWorkSections.tsx:178`. Coordinate with Anna runtime. Shot: `v-rE-F03-before-reload.png`.
- **E46. Notification links fail, and the bell counts 88 against "27 assigned" (rE-F08).**
  `server/services/notifications/notification-record-target.ts:157-163`; `TaskBoard.tsx:383-394`; `TaskTray.tsx:133`.
  Unheld. Shots: `v-rE-F08-open-vault.png`, `v-rE-F08-open-task.png`, `v-rE-F08-your-work.png`.

### Polish

| Id | What | Cause and files | Holder |
|---|---|---|---|
| rA-E11 | "5 C and 25 C/60% RH"; recorded questions keep hard line breaks | The seed letter is ASCII by design (`packs/biotech-work-content.mjs:400-442`); no reflow in `shared/agency/letter-questions.ts` | L1 (seed file); letter-questions unheld |
| rB-F6 | Raw ISO times and doubled times on RBM | `RbmSurfacesA.tsx:365`, `RbmSurfacesB.tsx:541-542`; `_shared/components/GovernedTimestamp.tsx:84-94` | Rbm: row 106; GovernedTimestamp unheld |
| rB-F9 | A disabled package button drawn as primary; "Your Team And Concept2Cure" | `AgencyResponses.tsx:749`; `styles/commcenter-v2.css:102` | unheld |
| rB-F13 | Section keys "1.14.4.1:work:3" | `shared/regulatory/section-code.ts:264-273`; `ReviewDecisionDialog.tsx:85` | unheld |
| rB-F14 | Task form: "Medical Device" and "MedicalDevice", lowercase priorities | `TaskBoard.tsx:2132`, `:2141`; `fixtures/task-board-data.ts:100-119` | unheld |
| rB-F15 | The task blames site 107 for an AE-lag breach that is at site 104 | `packs/lumen-content.mjs:223`; `packs/lumen-qms-content.mjs:9`, `:241` | unheld |
| rB-F17 | "breakpoint 0.15000000000000002" | Fixed in the working tree, uncommitted (`server/services/ana-biostats/judgment-engine.ts`, `document-generator.ts`) | GA readiness lane L6: land it |
| rC-F19 | eSTAR at 390 px: stepper and sub-tabs run out of their cards | `mdx/surfaces/K510Surface.tsx`, `mdx/surfaces/pathway/PathwayPanes.tsx` | K510Surface: row 95; PathwayPanes unheld |
| rD-F12 | Compile toast has no version or link; the binder reads 0/0 beside 21 compiled sections | `CmcModule3Build.tsx:302-313`; `server/services/vault/vault-coverage.ts` | toast unheld; vault-coverage Vault parity |
| rD-F22 | Audit chain banner squeezed at 390 px | `v2/surfaces/AuditEventChain.tsx:208-223` | unheld |
| rE-F13 | ⌘K does not find documents (its placeholder is honest) | `v2/Shell.tsx`, `v2/paletteProjects.ts`; existing `GET /api/c2c/project-vault/search` | unheld (Shell.tsx was being edited by another session today) |

Shots: `v-rB-F7-rbm-ract.png`, `v-rB-F9-comm-package-button.png`, `v-rB-F13-review-dialog-keys.png`,
`v-rB-F14-new-task.png`, `v-rB-F15-tasks.png`, `v-rB-F15b-rbm-plan.png`, `v-rC-F19-phone-estar.png`,
`v-rD-F12-compile-toast.png`, `v-rD-F12-binder.png`, `v-rD-F22-audit-390.png`, `v-rE-F13-search.png`,
`v-rA-E11-questions.png`.

### Not product defects (verified)

- **Forms close by themselves (rC-F02, rE-F02).** Vite dev over the shared tree: a module that cannot Fast Refresh
  remounts the shell. The closes line up with "[vite] invalidate … Could not Fast Refresh" and "page reload" in the
  server log; a 150 s idle with no such update held. Remedy: present from a production build. Shots:
  `v-rC-F02-after.png`, `v-rC-F02-wizard-closed.png`, `rE-58b-wizard-lost.png`.
- **RBM "Load extract…" is not a dead end (rE-F07).** It posts to an admitted endpoint. Only the seed's call is refused.

### Reported, not reproduced

Seen once by the rehearsal, not walked again by a verifier. Treat them as likely, not proven.

- rA-P1: a Vault deep link opens the Investigator's Brochure, not the linked document (`rA-23-ava-version.png`).
- rA-P2: Compare versions says only "Different bytes" (`rA-14-compare-versions.png`).
- rA-P3: doubled times, "signing..", "finding(s)", an e-mail for a name, a .docx named after an event id (`rA-22-rhea-signed.png`, `rA-50-comment-resolved.png`).
- rA-P4: the shell scrolls up and leaves a blank band (`rA-73-project-submit-step.png`).
- rA-P5: New project's breadcrumb shows the previous project (`rA-88-new-project.png`).
- rA-P6: the editor toolbar wraps into three rows at 390 px (`rA-98-390-editor.png`).
- rB-F20: RBM at 390 px pushes content below the first screen (`rB-61-phone-rbm.png`).
- rB-F21: "No monitoring projects" while loading; "patient(s)", "Safetycritical" (`rB-26-rbm-load-extract-result.png`).
- rB-F22: "Refine the csr s9.7 methods"; access level "Edit" shown as a role; a toast over the outline (`rB-02-lmn201-project.png`).
- rC-F08: two signature receipts show the same "Chain" value, which is the content hash (`EsignModal.tsx:462-465`, read in code; `rC-29-ava-approved.png`).
- rC-F13: Raise CAPA with no project lets you type everything first (`rC-60-raise-capa-filled.png`).
- rC-F18: doubled times; a hash in a toast; all three 510(k) Summary signatures by Rhea (`rC-11-editor-510k-signatures.png`).
- rC-F21: a 510(k) offers the protocol workspace and Biostatistics; the training panel misses Quinn's acknowledgement (`rC-55-training-after-ack.png`).
- rD-F08: Raise CAPA with no project said "nothing is recorded" and one was recorded (mechanism read at `qmsCapaRegister.tsx:35-50`; `rD-38-raise-capa-filled.png`).
- rD-F11: two different e-signature dialogs, Quality and CMC (confirmed in code: `CmcModule.tsx:503-526`; `rD-15-rhea-approve-esign.png`, `rD-64-cmc-3-2-S-1-esign.png`).
- rD-F24: the new SOP numbered SOP-001 beside C2C-SOP-001, with no review date (`rD-08-new-sop-row.png`).
- rD-F25: compile and sweep buttons above the biologic refusal (`rD-73-cmc-c2c101-biologic-refusal.png`).
- rD-F26: "--" and "phase_2" on the drug substance (`rD-66-cmc-study-records.png`).
- rD-F27: the Deviations table's More runs past its edge (`rD-24-quality-deviations.png`).
- rE-F15: Home repeats codes, prints an ISO date, opens on red overdue dots, shows "Record your company details · To do" (`rE-06-home-bottom.png`).
- rE-F16: Biostatistics opens on an oncology worked example and is a rail entry (`rE-32-rail-biostatistics.png`).
- rE-F17: the organisation panel is unstyled and duplicated in Account (`rE-42-org-switcher.png`).
- rE-F18: Communication's eyebrow and "FDA loop" tab (`rE-28-rail-communication.png`).
- rE-F19: "76 not offered" beside a tab count of 59; "GLOBAL" (`rE-56-new-project-after-12s.png`).
- rE-F20: billing "7 of 5 seats" against "7 / 25"; consumer usage wording. Owned by the client-administration workflow (`rE-49-menu-subscription-billing.png`).
- rE-F21: the brand tile with ".RI", and a heavy red-brown focus ring on sign-in (no shot: sign-in screens are not kept).

### Needs a model key

Each is an honest refusal; each leaves a dead end in a story.
- The CSR build (rB, and the CDISCPILOT01 study): no draft text, 26 % and stop. The non-key defects are E13 and E14.
- Every AnA conversation, chip and starter on Home, Vault, Biostatistics, RBM, Device engineering ("I will draft the
  benefit-risk rationale…", rC-F20) and Communication ("Draft response with AnA").
- Demos, Sales demonstration (rE-F04): with no key it should run its script or say it needs AnA.
- Shadow Review (503), so no sequence clears dispatch.
- The dispatch QC narrative (PROVIDER_UNAVAILABLE). The verdict itself does not need a model.

## Earlier findings re-checked

From `docs/evidence/DEMO/2026-11-09-rehearsal/deep-walk/findings.json`, the Lumen hand-off and the showcase.

Fixed:
- "DEV ONLY" Demo access on sign-in: gone (seen in the walk; sign-in screens are not kept).
- No organisation control in the top bar: there is one (the panel itself is unstyled, rE-F17).
- No device taxonomy on the MDx project: About shows class, product code, regulation, panel, predicate (`rC-02-neur-project.png`).
- Approve offered to a change's proposer: the proposer is now offered Advance (`rD-47-change-advance-dialog.png`), and
  Approve appears for a second person (`rD-48-ava-change-action.png`).
- Stability "14 OOS": gone, but the register now disagrees with §3.2.P.8 (E37).
- "RBM refused by launch scope": only `/api/mdx/rbm-data-runs` is refused; every RBM screen opens.
- The 510(k) page's red "fetch failed" errors: now an honest "Predicate intelligence is not configured" banner (the
  two 503s behind it remain).

Still open:
- Dossier readiness "0 drafted" (0.2); data room with other programs' records (0.3, now worse: on new projects too);
  "4 blockers" over a longer list (0.4); the editor link to an empty or arbitrary document (1.0); "Unbound working copy"
  on a frozen record (1.2); validators disagree (3.2); seed note as filing rationale (4.1).
- No objective on demo programs (XT); notification links fail; the AnA no-provider turn vanishes; raw codes on screen;
  the setup checklist "Record your company details".
- Biostatistics sensitivity float (fixed in the tree by L6, not running); Reporting contradicts the Vault; RBM Site risk
  empty (site_intel writer mounted nowhere); PDF export 503 on hosts without fonts.
- MDx: every eSTAR section "empty", the predicate 503s, demo predicate; 7 leaves with a duplicate; drug and eCTD rules on a device;
  raw rule codes and UUIDs; "Open change controls 0"; Cybersecurity "Draft" against "In review"; linked records by
  UUID; signatures all by Rhea; the training panel misses the acknowledgement.
- Quality and audit: the audit trail shows only the newest entries (now 1,000, still no paging); seeded SOP-001 and
  MDX-SOP-101 "Not assigned"; Reporting 0 % readiness; raw section codes; raw audit codes; the chain banner (now red);
  enum codes in the catalog; reports that cannot run; "digitally signed"; cramped register rows.
- CMC: §3.1 "C2C-201 tablets"; DS-2502-R2 Pass; camelCase missing inputs; garbled §3.2.A.3; unsupported composed
  claims; "--" and phase_2; compile buttons above the biologic refusal.
- Vault: organisation artifact titles 0 px; the binder 0/0 where compiled content exists.

Could not check: RBM "New KRI" 500 (it would add a KRI); seeded PDFs printing "?"; seed comments resolved by their
author; Module 2 QC; the IND checklist; data-room counts; the audit trail 200 (as distinct from the limit); Reporting
for C2C-101; the release-signature gate on the readiness card; orchestration under the NEUR breadcrumb; the Vault data
room's "Captured 14"; the 319 x 320 PDF viewer; "Open document" on a draft SOP.

## Proposed lanes

Lanes over disjoint files that nobody holds today. No file appears in two lanes. Each lane works under a `Plan:` and
`Completes:` trailer for its package (RULE 5, RULE 6): these are completions of existing files, not new work.

| Lane | Findings | Files |
|---|---|---|
| 1. Filing release | B1, rB-F13 | `server/services/authoring/workflow-import-governance.ts`, `server/services/coauthor/coauthor-snapshot.ts`, `client/src/concept2cure/v2/surfaces/ReviewDecisionDialog.tsx`, `shared/regulatory/section-code.ts` (ask the S4 owner named at COORDINATION.md:355 first) |
| 2. Assembly refusal | B2 (product half) | `server/services/ectd/assemble-from-core.ts`, `server/routes/submissions.ts`, `server/services/submission-gateways/regional-packager.ts` |
| 3. Submission Center words and compile gate | B3, E5 (compile and validation), E27 (copy) | `client/src/concept2cure/v2/surfaces/EctdCompile.tsx`, `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx` |
| 4. Project data room | B4, E39 (server half) | `server/services/clinical-regulatory-evidence/record-source.ts`, `server/services/qms/project-evidence.ts`, `client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx` |
| 5. Agency letters and responses | E9, E5 (dialogs, CommitmentRow), E6 (AgencyInbox font), E20 (Communication), rB-F9, rA-E11 (reflow) | `client/src/concept2cure/v2/surfaces/AgencyResponseEditor.tsx`, `useAgencyResponseEditor.ts`, `AgencyResponses.tsx`, `AgencyInbox.tsx`, `CommitmentRow.tsx`, `CommunicationCenter.tsx`, `client/src/concept2cure/v2/editor/SourceImportDialog.tsx`, `SourceAssemblyDialog.tsx`, `client/src/concept2cure/v2/styles/commcenter-v2.css`, `shared/agency/letter-questions.ts` |
| 6. Review board, tasks and notifications | E4, E29 (board), E46, E20 (Tasks), rB-F14 | `client/src/concept2cure/v2/OpenWork.tsx`, `client/src/concept2cure/v2/surfaces/Review.tsx`, `server/services/review/authoring-review-board-standing.ts`, `server/services/review/authoring-review-board.ts`, `server/services/notifications/notification-record-target.ts`, `client/src/concept2cure/v2/TaskTray.tsx`, `client/src/concept2cure/v2/surfaces/TaskBoard.tsx`, `client/src/concept2cure/v2/fixtures/task-board-data.ts` |
| 7. Demo seed packs | B2 (seed), B5 (seed), B11 (inspection seed), E6, E8 (seed), E11 (seed), E14 (source), E16, E19, E27 (seed), E29 (seed), E40 (seed), rB-F15 | `scripts/demo/launch-demo/packs/biotech.mjs`, `lumen.mjs`, `lumen-content.mjs`, `lumen-rbm-content.mjs`, `lumen-qms-content.mjs`, `mdx.mjs`, `mdx-content.mjs`, `mdx-qms.mjs`, `data/seeds/lumen-demo/seed-data/lmn201_synthetic_csr_source_v2.json`. Not `biotech-work-content.mjs` (L1 holds it). Rows already in gademo need a fresh seed. |
| 8. CSR build path | E13, E14 (product) | `server/services/csr/csr-draft-refusal.ts`, `server/services/csr/csr-job-runner.ts`, `server/services/ai-gateway/gateway.ts`, `client/src/concept2cure/v2/editor/StudyDataBuild.tsx`, `server/services/csr-builder.ts` (check with 01QoxbLZ… first: it commits on this path with no row) |
| 9. Reporting engine words | E17, E18 | `server/services/report-os/regional/filing-readiness.ts`, `server/services/report-os/render/render.ts`, `server/services/report-os/research-compliance-report-providers.ts` |
| 10. CMC composition and sweep | B8 (route), B9, E35 (stability), E36 (server), rD-F12 (toast) | `server/api/cmc/routes.ts`, `server/services/cmc/contradiction-registers.ts`, `server/services/cmc-impact-contradiction-engine.ts`, `server/services/cmc/recorded-stability.ts`, `server/services/module3-extensions.ts`, `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx` |
| 11. Quality server rules | E32, E33 (server), E34 (server), E43 | `server/services/qms/change-approval-signature.ts`, `server/routes/mdx-qms.ts`, `server/services/qms/controlled-document-content.ts`, `server/middleware/redisRateLimiter.ts` |
| 12. Device plan and eSTAR | E23, E24 | `server/routes/pyramid.routes.ts`, `server/services/pathway-engines/estar/estar-administrative-data.ts`, `server/routes/c2c/projects.ts` (the create path only; D3/S12 are named for source-changes) |
| 13. Device screens | E25, E30, E31, rC-F19 (PathwayPanes) | `client/src/concept2cure/mdx/surfaces/EngineeringSurface.tsx`, `client/src/concept2cure/v2/surfaces/DesignControlsTrace.tsx`, `RiskRegister.tsx`, `AnaVerbs.tsx`, `Projects.tsx`, `AuthoringCreateExport.tsx`, `client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx` |
| 14. Protocol workspace | E7 (protocol), E8 (screen), E5 (picker) | `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx`, `ProtocolWorkflowGuide.tsx`, `ProtocolDevSelection.tsx` |
| 15. Shell defaults and palette | E12, E44, rE-F13 | `client/src/concept2cure/v2/V2App.tsx`, `client/src/concept2cure/v2/__tests__/shellWiring.test.tsx`, `client/src/concept2cure/v2/Shell.tsx`, `client/src/concept2cure/v2/paletteProjects.ts` |
| 16. Plan matching and the editor door | E1 (Plan half), E2 (door) | `client/src/concept2cure/v2/editor/IndDocumentLibrary.tsx`, `client/src/concept2cure/v2/projectDoors.ts` |
| 17. Small display fixes | rB-F6 (timestamp), rD-F22 | `client/src/concept2cure/_shared/components/GovernedTimestamp.tsx`, `client/src/concept2cure/v2/surfaces/AuditEventChain.tsx` |

**Findings in held files, addressed to their holders.**

- **Project page, session_01FTWcmXm7At3ZXBE5VWn6oS (row 83: `surfaces/Project*.tsx`, `MarketBlockers.tsx`).** E1 (the
  dossier lead, `ProjectDossier.tsx:194`, `:241`), E10 (count and the biologic's remedy), E11 (the Team card's
  owners), B4 (the data room's display on the project page), E29 (the Review step's counts).
- **The one editor: the coordinating session 01JbQU… (D4, row 140), and Codex project/editor continuation (row 79,
  saved-refresh only).** `editor/DocumentWorkbench.tsx`, `editor/DocumentCanvas.tsx`, `styles/app-v2.css`,
  `server/services/authoring/authoring-document-read.ts:41`: E2 (no document), E3, E21, E26 (document in the URL),
  E34 (the QMS lock note and filing buttons).
- **Coordinating session 01JbQU… (row 106: `server/routes/mdx-rbm.ts`, RBM services, `surfaces/Rbm*.tsx`).** E15 (with
  `server/services/rbm/site-risk-engine.ts`, unheld, which goes with it), E20 (RBM), rB-F6 (the RBM half),
  `fixtures/rbm-data.ts`.
- **Reporting analytics, 011HLkY… (row 103: `Insights*.tsx`).** B11, B12 (the double full stop), E39 (renderer).
  `InsightsDevicePortfolio.tsx` is also named at row 93.
- **Client administration, 01T2woo… (row 95).** B7 (land AUD-02, then restart 5240), E38 (`AdminSurfaces.tsx`,
  `audit-trail-ledger.routes.ts`), E28 (`capaMdr.service.ts`), rC-F19 (`K510Surface.tsx`). The rbm `apiPrefixes`
  claim in `ui-surface-registry.ui-v2.ts` waits for the founder (see the launch gate).
- **GA readiness lane L1, 01T2woo… (row 95: `cmcRegisters.tsx`, `batch-release-evidence.ts`, `CmcModule.tsx`,
  `module3Composer.ts`, `packs/biotech-work-content.mjs`).** B8 (land GA-DEMO-02 with lane 10's `conformance`), E35
  (land GA-DEMO-03; name sources), E36 (section titles, plain missing inputs), E37, rD-F11 (converge CMC signing onto
  `EsignModal.tsx`), and in the seed file: E6 (the letter channel) and rA-E11 (a UTF-8 letter with °C).
- **GA readiness lane L6.** rB-F17: land `judgment-engine.ts` and `document-generator.ts`, then restart.
- **Quality and training, 01GyGhjg… (row 116: `client/src/concept2cure/quality/**`).** E28 (the organisation view's
  number), E32 (`ChangeControl.tsx` modal), E33 (`QmsReviewRoute.tsx`), E40 (`ChangeRecordDetail.tsx`), E41, E42.
- **Vault parity, 01KnUG… (row 102), with J2 human test (row 89) for Vault row copy.** B10, E7 (the project Vault's
  layout and the binder label in `project-vault.ts`), rD-F12 (`vault-coverage.ts`).
- **Anna runtime, session_01KZK3jgtmQBgNepqLjXjS3k (COORDINATION.md:567).** B6 (`stream.ts`), E45
  (`ConversationThread.tsx`, `AnaWorkSections.tsx`).
- **CSR drafting with the person in control, row 93.** B5's product half (request-review in `authoring.router.ts`; the
  row holds only the draft route in that file) and E22 (`ProjectClientReview.tsx`, which that row lists; a sharing
  action is a founder decision).
- **Environment, no repository file.** A production build for presenters; the Noto fonts on the demo host; restart
  after AUD-02, GA-DEMO-02, GA-DEMO-03 and L6 land.

## Not walked

- Role gating: every persona is an organisation admin.
- A non-IVD device company's seeded project (none exists) and a second diagnostics project; PMA, De Novo and IVDR.
- A CRO client type or the client-type switch in the account menu.
- Sequence lifecycle (Validated, freeze, dispatch, sequence 0001) and the dispatch signatures, to keep sequence 0000.
- Vault "Place into filing…" from an approved Vault document (another filing route), seals and fixity, binders,
  Export Module 3, the organisation Vault's Export manifest.
- The editor's Approval e-signature that "approves and freezes" on C2C-101; recording the other IR questions,
  commitments and meetings; completing the IR response on LMN-201.
- The audit trail screen in rA's story; Module 2 QC; the IND checklist and Forms and letters; the Data catalog tab.
- RBM New KRI, Add reading, Approve plan, Recompute site risk, Run central monitoring (they change the seeded study).
- Periodic review and Revise of an SOP; CAPA effectiveness and closure; create forms for suppliers, audits, management
  reviews and nonconformances.
- CMC Quality by design, Approvals & audit, the Q1E estimate.
- Reporting schedules and run history for C2C-201; legal holds and retention (Admin settings).
- Sign-out and a fresh sign-in to completion (the account keeps at most five sessions; setup proved it).
- Admin, subscription, usage, access requests and onboarding: owned by the client-administration workflow.
- `docs/evidence/HUMAN-TEST/J1` to `J5`; the CDISCPILOT01 CSR study as Lumen; the faux pack's review and approval.
- Dark mode at 390 px.
