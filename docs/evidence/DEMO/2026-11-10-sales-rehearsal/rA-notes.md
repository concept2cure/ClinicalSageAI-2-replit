# rA: biotech US IND, the spine end to end (C2C-101), rehearsed 2026-11-10

App http://127.0.0.1:5240 (database gademo), app_service, RLS_ENFORCE=on, LAUNCH_SCOPE_ENFORCE=on, dev
sign-in off, no model key, a development build served by Vite over a shared working tree (not a hosted build). Personas: ana (author), rhea (reviewer), ava (approver). Viewport 1440 x 900 light unless
named; 390 x 844 and dark at the end. Screenshots: `shots/rA-NN-*.png` (DSF 2). Every step below was done in the app;
"persisted" means a reload showed it again.

## What already exists (read first)

`docs/demo/biotech-walkthrough.md`; `docs/evidence/DEMO/2026-11-09-rehearsal/deep-walk/` (findings 0.x to 6.x);
`docs/evidence/HUMAN-TEST/J1..J5`. This walk extends them under launch scope ON and re-checks the findings for this story.

## Run of show that worked (in order)

| # | Step | Shot | Persisted |
|---|---|---|---|
| 1 | Home, then Projects (8 projects, filters by client, type, pathway) | rA-01, rA-02 | n/a |
| 2 | C2C-101 project: Set the objective (text, success criteria, source, reason) | rA-04, rA-05 | yes, after reload, "Version 1" |
| 3 | Plan step: the IND's documents by phase, a 58-task work breakdown scheduled back from the target date | rA-06, rA-33 | n/a |
| 4 | Vault: Add files, with type, folder 2.6.2, then Upload new version gives v2.0, Compare, History with hashes | rA-09 to rA-14 | yes |
| 5 | Vault: Send for review (Rhea reviews, Ava approves, due dates, reason) | rA-15, rA-16 | yes |
| 6 | Rhea: Home task, then Review board (All projects), Open the version, Sign review (Part 11, password) | rA-17 to rA-22 | yes |
| 7 | Ava: Home task, Review board, Open the version, Approve (Part 11) gives Approved; History lists every signature with its reason | rA-24 to rA-28 | yes, read back as ana |
| 8 | Protocol workspace (Author, "Write the protocol"): protocol C2C-101-201, 10 of 11 sections, edit a section with a governed reason, save | rA-29 to rA-31 | yes |
| 9 | Plan, Module 2, Nonclinical Overview (2.4), Create from template: the ONE editor opens with 7 sections | rA-35 | yes |
| 10 | Editor: write 2.4.2 and save with a reason, comment on a selection, send for review to Rhea | rA-36 to rA-43 | yes |
| 11 | Rhea: board, Open in editor, E-sign (Review) | rA-44 to rA-48 | yes |
| 12 | Ana: resolve the comment with a reason, then Freeze (authorship signature): Frozen, read only | rA-50 to rA-53 | yes |
| 13 | Rhea, on a second document (2.5): Record review decision, Run independent checks: 15 findings, approval held | rA-61, rA-62 | n/a |
| 14 | Submission Center: Sequences (0000 assembling), Builder (6 leaves), Validation (8 errors with the rule each comes from), Dispatch ("not yet, four things") | rA-63 to rA-67 | n/a |
| 15 | Compile & export: Validate, then Compile eCTD is refused with every missing identity fact named | rA-70 to rA-72 | history row recorded |
| 16 | Project, Submit step: "Dispatch blocked · 4 blockers" with a list of what must close | rA-73 | n/a |
| 17 | Communication: FDA IR, Questions & responses, record Q1 (CMC, 3.2.S.4.4), write the answer in the editor, record it | rA-74 to rA-85 | yes |
| 18 | Ava: Approve response (Part 11), Response package (.docx) downloads (9 kB) | rA-86, rA-87 | yes |
| 19 | New IND project from Projects (3 steps), then the first document (Target Product Profile from template) | rA-88 to rA-93 | yes |

The new project took 46 s to create and 58 s to reach its first document, scripted. A person reading each screen
would need about 2 to 3 minutes. No step needs AnA.

## Findings (strict; each has its screenshot)

### blocks-demo
- **F1. Place into filing cannot be completed from the editor.** The frozen, review-signed 2.4 was refused:
  `409 POST /api/coauthor/documents` "Independent checks or their human finding decisions are missing…" (rA-55). Check
  on the frozen document then answers `409 AUTHORING_DOCUMENT_IMMUTABLE` "Document status FROZEN does not permit this
  action.." (rA-56). Freeze accepted the document without the checks, and once it is frozen they cannot be run. The
  review dialog calls the checks "(optional)" (rA-61), but filing requires them. The checks also hold approval while
  any section is empty (rA-62), so a demo document has to be written in full. Suspects:
  `server/services/authoring/workflow-import-governance.ts:362`, `client/src/concept2cure/v2/surfaces/ReviewDecisionDialog.tsx`.
- **F2. C2C-101's data room shows another company's records.** The Evidence step lists 30 sources: Lumen suppliers,
  Lumen internal audits and management reviews, "Quality record relationship: 7", "Retained Quality document 5 v1.0".
  Each says "The original file is unavailable, so a working copy cannot be created." None of the six IND PDFs appears
  (rA-07). This is deep-walk 0.3, still open.
- **F3. Test package returns 500.** Dispatch, Assemble a test package gives `500 POST /api/submissions/sequences/2/assemble :: INTERNAL`, and the screen
  says "could not be confirmed — Request failed" (rA-69).
- **F4. Compile is a wall of red.** Compile eCTD shows "Compilation blocked · 43 errors", and the history row reads "no manifest — cannot anchor a
  lifecycle". On the same sequence, Validation says 8 errors and Validate says 41 findings (rA-66, rA-71, rA-72). This
  is deep-walk 3.2, still open.

### embarrasses
- E1. The project page contradicts itself. Dossier readiness says "0 drafted · No editing copy of this filing yet" under a list of drafts, a document in
  review and a frozen document. The Plan says "Module 2: 7 documents · 0 started" and offers "Create from template" for 2.5,
  which already exists, so a duplicate was created (rA-03, rA-33, rA-35). This is deep-walk 0.2, still open.
- E2. "Find or start a document in the editor" opens an empty 2.3 QOS scaffold. The editor has no visible way to start a
  document (rA-32). This is deep-walk 1.0, still open.
- E3. A frozen, signed document is still labelled "Saved draft sections · unbound / Unbound working copy". It shows "status is
  FROZEN" in capitals and two lock banners. The version reads v1 / 1 revision after it read v3 / 3 revisions (rA-49, rA-53). This is
  deep-walk 1.2, still open.
- E4. Clicking Rhea's Home review task opens the Review board scoped to another project (CDISCPILOT01), which says
  "Nothing is in review" (rA-18). Ava's board says "Nothing is waiting on you" while her approval is waiting (rA-24).
- E5. Code on screen:
  - "request 84d7c424-…" after Send for review;
  - "Target project: 6c8a782e-…", "Snapshot fingerprint …", "agency.context / agency.response" and "version 0 · program scope" in the response dialog (rA-79);
  - "Recorded event: ace_1794295856087_2babb0c7", "Response revision: 0" and section codes `agency.context` in the response document itself (rA-105, rA-98);
  - IND_MODULE3_REQUIRED, DOCUMENT_NOT_APPROVED and "vault_documents 2731abc5-…" in Validation (rA-66);
  - "rule pack ind:fda ich-m4-v2.2", "Type initial" and "fdaat/fdast…" in Compile (rA-70);
  - "in_development" in the protocol picker (rA-29);
  - "signature 120" (rA-87);
  - priority low/medium/high/critical and the "all" filter in lowercase.
- E6. Seed notes are shown as product text. The Vault says "Filed into Module 1 … by the launch demo seed; placement confirmed by the founder's
  session" (rA-08), which is deep-walk 4.1, still open. Communication shows "Demo seed: fictional letter …" in monospace (rA-74).
- E7. Pages are walls of controls, a retired pattern:
  - Vault has a filter grid of 6 fields, 3 AnA chips, 6 tabs and a 9-button side panel (rA-08). At 390 px the first screen is only filters (rA-97).
  - Protocol has a "Suggested order" guidance box and 16 tabs that overflow (scrollWidth 1911 against 1176), and its section list shows one row (rA-29, rA-30).
  - Several screens carry "Urgent:" AnA guidance boxes.
- E8. The protocol says "Sponsor not recorded" although the project names Concept2Cure Therapeutics as its client (rA-29).
- E9. Answering an agency question takes 6 steps: Write response, Open response in editor, a reason dialog, Open working copy,
  save, back, Refresh, Use saved response. After recording, the card says "The registered response changed. Refresh the saved response before
  saving." (rA-84).
- E10. The submission readiness list says "4 blockers" above 16 items. It tells the user to place Module 3 "from CMC / Module 3", but this
  project is a biologic, which CMC refuses by scope (rA-73). This is deep-walk 0.4, partly open.
- E11. The IR question reads "at 5 C and 25 C/60% RH" with the degree signs missing (rA-75). This is related to deep-walk 4.0.
- E12. The Team panel lists only Ana, with "8 open items unassigned · 8 assigned to someone not on this list", although
  Rhea and Ava did the review work (rA-06).
- E13. The OS dark preference is ignored: the body stays light (rA-102). Only the app's own setting turns dark on (rA-103 to rA-105).

### polish
- P1. The Vault ignores a cold-load `?documentId=` link and opens the IB instead (rA-23).
- P2. Compare versions only says "Different bytes: the SHA-256 differs" (rA-14).
- P3. "no submission placements are available to you" appears on each version, and "Resolved by ana.author@concept2cure.pro" shows an e-mail address instead of a name.
- P4. The signed time is shown twice ("2026-11-10 11:23:28 UTC / Nov 10, 2026, 11:23 · UTC"); the message ends "signing.."; "finding(s)" and "0 cmt" appear.
- P5. The response package file is named "response-ace_1794295856087_2babb0c7.docx".
- P6. After focus scrolls the page, a blank band appears below the shell (rA-07, rA-73).
- P7. "Check saved sources" did nothing visible on a frozen document (rA-57).
- P8. On New project, the breadcrumb still shows the previous project (C2C-101), and "76 filing types … not offered" sits beside "59" (rA-88).
- P9. The headless page crashed once on the editor while the box was short of memory. This is not attributed to the app.

## AnA dead ends (expected with no key; one line each)
- The project box gives "No AI provider is configured…" (`503 /api/ana-ri/stream GATEWAY_UNAVAILABLE`, rA-94).
- Shadow Review run #2 failed with no provider, so the Dispatch gate cannot clear (rA-68).
- "Draft response with AnA", "Ask AnA to propose it", "Draft with AnA", the Vault AnA chips and the Catalog record ("ask AnA to catalog it") were not
  used and would refuse.
- The section Check is `ai/deficiency-scan`. It refused because the document was frozen, not because of the key.

## Earlier findings re-checked
- 0.2 is still open (E1).
- 0.3 is still open (F2).
- 0.4 is partly open (E10).
- 1.0 is still open (E2).
- 1.2 is still open (E3).
- 3.2 is still open (F4).
- 4.1 is still open (E6).
- 4.0 is not re-checked on the PDFs; a related degree loss was seen in the IR text (E11).
- 1.1, 3.3, 3.5, 4.2 and 5.0 were not checked in this walk.

## Mutations (all mine, named "Rehearsal rA")
- C2C-101: objective v1.
- Vault document "Rehearsal rA - C2C-101 Nonclinical Pharmacology Summary": v1, v2, reviewed and approved.
- Protocol section "Treatments / Interventions": one sentence appended, with a reason.
- Editor documents "Nonclinical Overview (2.4)" (frozen) and "Clinical Overview (2.5)" (in review).
- IR question 1 recorded, its response written and approved.
- A failed compile row.
- New project "Rehearsal rA — C2C-301 oral TYK2 inhibitor (IND)" and its Target Product Profile.
- Seeded data was not deleted.
