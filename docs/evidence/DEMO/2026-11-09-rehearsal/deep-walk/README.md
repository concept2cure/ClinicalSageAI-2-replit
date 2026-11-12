# The deep demo walk, 2026-11-09: every screen a client could reach, and what it said

**What this is.** This walk followed the dress rehearsal in `../README.md`, on the same freshly seeded database at
trunk `b4284d08ce`. Seven walkers each took one area and opened every screen a presenter or a client could reach from
it, one level deep. Every finding was then reproduced by an independent verifier, starting from a fresh browser
session. `findings.json` holds all of it: the screens walked, the walkthrough claims checked, each verified finding
(steps, what the screen showed, what was expected, the code path, the verdict and its cause) and the presenter advice
for each area.

**Package.** F1.

## Numbers

| Area | Walkthrough claims checked | Verified (all high) | Not verified (medium / low) |
|---|---|---|---|
| Front door, Home, Projects, the three program pages | 21 | 8 | 20 |
| The editor on C2C-101 | 21 | 3 | 21 |
| The device program end to end (NeuroPanel-Dx 510(k)) | 38 | 7 | 17 |
| Submission Center and dispatch readiness | 15 | 6 | 17 |
| Vault, Communication and Tasks | 16 | 3 | 18 |
| Quality, Audit trail, Reporting, Biostatistics, RBM | 26 | 5 | 17 |
| CMC / Module 3 and AnA | 7 | 4 | 15 |
| **Total** | **144** | **36** | **125** (91 medium, 34 low) |

Every one of the 36 high findings was reproduced and confirmed real:
- **12 are stale walkthrough.** The screen was right and the presenter script was out of date.
- **24 are product or seed defects.**

The 125 medium and low findings were recorded but not independently verified. They are in `findings.json` under
each area's `unverified`, and are not claimed as defects here.

## The 36, re-checked at trunk on 2026-11-12

**No fix from this lane landed.** The fixes this lane built on 2026-11-09 were lost with its machine before they were
applied, and the `fixes/` folder an earlier version of this file named never existed. Other lanes then fixed many of
the same defects. On 2026-11-12 each finding was re-read against trunk `a9b5af187` to `592233d61`: the code the
screen runs, the seed, the commits since the walk, and the holds in `.design/claude-convergence/COORDINATION.md`.
A second reader challenged 13 of the 19 groups; the six it did not reach are marked †. Each reader's proof, by file
and line, is in `recheck-2026-11-12.json`.

**Result: 3 closed, 16 partly closed, 17 open.** This was read from code and tests, not walked in the app.

Ids are `area.index` into `findings.json`. GA ids are items of `docs/evidence/GA-READINESS/2026-11-10/ledger.json`.

| Id | Finding | State | Closed by | What a user still sees | Held by |
|---|---|---|---|---|---|
| 6.0 | Stability calls 14 results out of specification | closed | `40cc8265b`, `e30adf066` | Nothing. GA-DEMO-01 can be marked closed | — |
| 4.0 | Seeded PDFs print "?" | closed | `aeb72f6e9` | Nothing on a fresh seed. GA-DEMO-14 can be marked closed | — |
| 6.3 | A failed AnA turn blocks AnA's reads | closed | `c6ab29961` | Nothing. GA-DEMO-04 can be marked closed | — |
| 5.3 | Sensitivity breakpoints wrong | partly | `eaa0237fa` | The two designs the finding names are right. The challenger found the section still wrong on the worked example a device project opens on | `01T2woo…`, lane L6 |
| 6.2 | An out-of-specification result shows Pass, its batch eligible | partly | `40cc8265b`, `feea54cae` | Signing a release is refused. The QC register still shows a plain "pass" (the server sends no verdict), and the batch still reads eligible | `01T2woo…` (GA-DEMO-02); batch rows `01QoxbLcnW…` |
| 6.1 | §3.1 names the product as the substance | partly | `40cc8265b` | The name is right. The §3.1 contents table omits 3.3, 3.2.A and 3.2.R | `01T2woo…`, lane L1 |
| 2.0 | Release signature "Satisfied" on an unsigned 510(k) | open | `7df1d292c` (server note only) | As observed: the screen does not read the note | handed to RIM `011e42…` (GA-D7-11), no hold row |
| 3.4 | A personal address as template reviewer | partly | `7df1d292c` | No address shows. FDA 1571 and 3674 still read "no named reviewer yet" | `01T2woo…`, lane L4 |
| 5.0 † | Audit trail shows 200 entries as the whole trail | partly | `3ab73b247` | Right under 1,000 entries. Past that, filters still search only the newest 1,000 | J2 `01QoxbLb…` (the route) |
| 3.2 † | Two validators disagree | partly | `7df1d292c` | Validate names its rule set. The two counts still differ, and the gate still ignores package identity | RIM `011e42…` (GA-D7-10B), by hand-off |
| 0.7, 2.5 | 510(k) page errors | partly | `114f943f1`, `d92eeea15` | No raw "fetch failed". Section counts disagree (38, 31, 36), and the predicate is still "SepsiScreen Panel" | `01T2woo…`, lanes L8 and L3 |
| 1.1, 2.4, 4.1 | Seed: comments by the author; a resolution claiming an edit never made; filing notes "by the launch demo seed" | open | — | As observed | `01T2woo…`, lane L3 (GA-DEMO-13) |
| 3.3 | Module 2 QC says 2.3 is missing | open | — | As observed | handed to RIM (GA-D7-14), no hold row |
| 3.5 † | IND checklist "Not started" on placed sections | partly | `7df1d292c` | A placed leaf reads placed. A placed child does not roll up to its heading, and the denominators still differ (a founder question) | `01T2woo…`, lane L4 |
| 5.4 † | Reporting: "No governed artifacts" | open | — | As observed | server unheld; `Insights.tsx` Reporting `011HLkY…` (GA-DEMO-06) |
| 2.6 | Orchestration shows the wrong program | partly | `4c6d882af` | The open project is followed. Code names still show as copy, "0 blockers" sits beside "Blocked", and no run exists | `01T2woo…`, lane L7 |
| 0.3, 4.2 | Data room names, cross-program change controls, counts | partly | `275b7e328`, `912ec3cf3` | Counts agree. Each project still lists the other program's change control, and "Filed to vault 0" sits above six filed uploads | seed packs `01T2woo…` L3; the label: data room lane `01QoxbLdTrwY…` |
| 1.2 | A signed document labelled "unbound" | open | — | As observed | `01J935DZ…` took it 2026-11-12 (GA-UI-19) |
| 0.2 | Dossier readiness "0 drafted", "No editing copy" | partly | `d92eeea15` (device seed only) | As observed on C2C-101 | project page `01FTWcmX…` |
| 0.6 | C2C-201 "No documents" | open | — | As observed | project page `01FTWcmX…` |
| 0.0, 0.1, 0.4, 1.0, 3.0, 3.1, 5.1, 5.2, 2.3 † | Walkthrough lines the screens contradict | open | — | Both scripts are unchanged on these lines | `01T2woo…`, lane L3 (GA-DEMO-16) |
| 0.5, 2.1, 2.2 † | Device walkthrough §4 and §5 | partly | `d92eeea15` (six leaves again) | The script still says an eSTAR id is refused and describes six UNRESOLVED_DOCUMENT errors | `01T2woo…`, lane L3 |

**What this lane may take.** Nothing in the table is free: every remaining item is held or was handed to a lane. The
125 unverified findings (GA-DEMO-18) are verified in the next section.

## The 125 unverified findings, verified at trunk on 2026-11-12 (GA-DEMO-18)

Verified in the running app: trunk `592233d61`, a database built from empty and seeded with the biotech and device
packs (a second signer designated QMS approver, a third person), no model provider. One verifier per batch of four or
five findings followed each finding's steps in a browser. A second verifier then tried to reproduce every finding the
first cleared or set aside; it changed 2 verdicts from cleared to still wrong (0.u19, 4.u0). Each finding's quoted
screen, code path at HEAD, GA item, holder and smallest fix are in `unverified-verified-2026-11-12.json`.

**Result: 82 reproduced, 36 changed but still wrong, 7 no longer seen.** Of the 118 still wrong: 96 product, 11
stale walkthrough, 9 seed data, 1 environment (the "DEV ONLY" label on a development build), 1 not a defect. Severity
now: 58 medium, 57 low, 3 none. None was judged high.

The holder column is the verifier's reading of `.design/claude-convergence/COORDINATION.md` and is a lead, not a ruling.
In particular the demo seed packs and both walkthroughs sit under the client administration session's lane L3
(row 121), whatever a single row below says.

| Id | Finding | State | Kind | Severity | Holder (verifier's reading) |
|---|---|---|---|---|---|
| 0.u0 | Signed-version notifications in the bell fail with 'Retry linked record' (422) | reproduced | product-defect | medium | Wave B lane W6-review-and-tasks |
| 0.u1 | Periodic-review tasks 'Assigned to you' on Home but 'Unassigned' on the project; Team card counts wrong | reproduced | product-defect | medium | periodic-review-task.ts and unified-work-view.ts unheld |
| 0.u2 | 'What this IND needs' says '0 started' though drafts exist; 'Due for you: Nothing' above own tasks; raw 'SOURCE-DEPENDENT' | reproduced | product-defect | medium | IndDocumentLibrary.tsx unheld |
| 0.u3 | Review stage 'Open change controls 0' though C2C-CC-001 (proposed) is in the project's data room | reproduced | seed-data | low | biotech-qms.mjs: no hold row (Codespace setup row 116 holds nothing) |
| 0.u4 | Raw codes shown: 'FROZEN', 'APPROVED', '510k', '(510K, FDA)', 'k510' (protocol status now fixed) | changed | product-defect | low | ProjectRecords.tsx |
| 0.u5 | A Home question is silently scoped to the last project opened | reproduced | product-defect | medium | unheld |
| 0.u6 | No-provider AnA turn is not saved, yet copy says it is kept and listed on the project | reproduced | product-defect | low | stream.ts and useAnaChat.ts unheld |
| 0.u7 | Sign-in card shows a 'DEV ONLY' divider above 'Demo access' | reproduced | environment | low | unheld |
| 0.u8 | Demo programs have no objective | not-reproduced | — | — | unheld |
| 0.u9 | Four different denominators for C2C-101 readiness on adjacent screens | reproduced | product-defect | medium | ProjectDossier.tsx: Project page (session_01FTWcmXm7At3ZXBE5VWn6oS) |
| 0.u10 | Review stage shows the approved row's reviewer as a raw email beside a display-named reviewer | changed | product-defect | medium | Client administration and screen work (01T2woo…) |
| 0.u11 | Biotech script says the top bar has segment and organisation controls; it does not | reproduced | stale-walkthrough | medium | Client administration and screen work (01T2woo…) |
| 0.u12 | MDX script disclaims the device taxonomy (F9) that the About panel shows; Product shows the project title | reproduced | stale-walkthrough | medium | Client administration and screen work (01T2woo…) |
| 0.u13 | Submit market row: sentence fragments, 'Planning' twice, duplicated MDX title | reproduced | product-defect | low | ProjectMarkets.tsx: D3 Project page (01FTWcmX…) |
| 0.u14 | Respond letter card: 'Your Team And Concept2Cure' title-cased by CSS; monospace jargon meta line | reproduced | product-defect | low | Client administration and screen work (01T2woo…) |
| 0.u15 | Projects empty-state copy names filters that do not exist; Pathway filter can hide while applied | changed | product-defect | low | Project page D3 (session_01FTWcmXm7At3ZXBE5VWn6oS) |
| 0.u16 | About 'Edit' opens Project settings, where no About field is editable; the sharing drawer is jargon | reproduced | product-defect | low | Project page D3 (session_01FTWcmXm7At3ZXBE5VWn6oS) |
| 0.u17 | Demo tenant shows unfinished setup ('Record your company details · To do'), leading to a dev-server notice | reproduced | seed-data | low | HomeSetup.tsx: Client administration (01T2woo…) |
| 0.u18 | State disagreements: Cybersecurity Summary Draft in Author vs In review; vault folder counts vs sequence/letters | reproduced | product-defect | low | ProjectHome.tsx: Project page D3 (session_01FTWcmXm7At3ZXBE5VWn6oS) |
| 0.u19 | Raw field keys and a garbled origin sentence in the CMC section completeness column | changed | product-defect | none | unheld |
| 1.u0 | Two 'Review' signatures by the same person 2 s apart (freeze seal not told apart); signer was a validation fixture | changed | product-defect | low | Client administration session (01T2woo…) |
| 1.u1 | Walkthrough says the product 'refuses to freeze while a comment is open'; Freeze is offered and an audited override exists | reproduced | stale-walkthrough | medium | Client administration session (01T2woo…) |
| 1.u2 | Review board opens on SOP-003 ('No review requested yet', red 'No approval chain') even from Module 2.5; QA workflow labelled by raw UUID and 'user: <email> · sign' | reproduced | product-defect | medium | Client administration session (01T2woo…) |
| 1.u3 | Protocol Synopsis card: 'Reviewers signed, sign-off pending', red 'No approval chain' banner, program name wraps one word per line, numeric date | reproduced | product-defect | low | Client administration session (01T2woo…) |
| 1.u4 | 'Check' on the frozen synopsis fails with a red error toast containing a raw status | reproduced | product-defect | medium | unheld (COORDINATION.md:105 gives the Codex editor lane only DocumentW |
| 1.u5 | Access panel shows 'Document access could not be read' on the frozen synopsis | reproduced | product-defect | medium | unheld (no COORDINATION.md row names server/routes/authoring-permissio |
| 1.u6 | Two stacked lock banners on the frozen synopsis, the first showing the raw status 'FROZEN' | reproduced | product-defect | low | unheld (COORDINATION.md:105 holds authoring-document-read.ts for count |
| 1.u7 | Internal codes like '1.20:work:3' shown as section numbers; false 'stored order differs' warning on Form 1571 | changed | product-defect | low | section-code.ts: Client administration and screen work (`01T2woo…`) |
| 1.u8 | Revision history shows raw HTML markup, a cramped header, and Revert on the genesis revision | reproduced | product-defect | medium | unheld (COORDINATION row 105 holds DocumentWorkbench.tsx only for the  |
| 1.u9 | Changing the editor rail's status filter switches the open document | reproduced | product-defect | medium | unheld (row 105's DocumentWorkbench.tsx hold is saved-refresh only |
| 1.u10 | Truncated rail titles make the four SOPs indistinguishable; QMS SOPs are mixed into the filing list and offer Place into filing | reproduced | product-defect | medium | unheld (row 105's DocumentWorkbench.tsx hold is saved-refresh only) |
| 1.u11 | Opening several documents within a minute trips the 20-per-minute limiter ('This document's review could not be read') | not-reproduced | — | — | unheld |
| 1.u12 | Module 2.5's review request reason says 'send the synopsis for scientific review' | reproduced | seed-data | medium | unheld (no COORDINATION row holds biotech-authoring.mjs |
| 1.u13 | Editor audit panel cramped, raw role codes, duplicate 'Accessed frozen document' rows on top | reproduced | product-defect | low | DocumentWorkbench.tsx: Codex project/editor continuation (COORDINATION |
| 1.u14 | A document 'In review' is fully editable with Freeze and E-sign offered, and no notice | reproduced | product-defect | low | DocumentWorkbench.tsx: unheld for this region (the Codex row :105 hold |
| 1.u15 | Amber review dots on all-resolved sections; edit and lock affordances on a sealed document | changed | product-defect | low | DocumentWorkbench.tsx: unheld for these lines (the Codex row :105 hold |
| 1.u16 | Fully author-written seeded sections report 'No recorded origin — 1–2%' | reproduced | product-defect | low | DocumentAttributionBar.tsx held 2026-11-12 by the screen-repair sessio |
| 1.u17 | Place into filing opens with an invalid pre-filled code and an immediate red error | reproduced | product-defect | low | unheld |
| 1.u18 | 'Reviewed and signed in Quality' beside a disabled Freeze on a Draft SOP; SOPs offer Place into filing | reproduced | product-defect | low | unheld for reviewTaskState.ts |
| 1.u19 | Search cannot find documents; 'Open the queue' appears to do nothing | reproduced | product-defect | low | Review.tsx: GA map lane L7 (shell) of the Client administration/GA ses |
| 1.u20 | Frozen synopsis v1.0 already contains the Week 2 PK sampling that Amendment 1 / CC-001 proposes to add | reproduced | seed-data | low | GA map lane L3 (packs/biotech*.mjs |
| 2.u0 | Vault Uploads data room: 'Captured 14 … 14 need review' beside 'Nothing captured for this project yet.' | changed | product-defect | medium | unheld (COORDINATION.md:115 gives J2 01QoxbLb… Vault.tsx for row copy  |
| 2.u1 | Evidence step's data room is 14 QMS projection records with 'original file unavailable'; no device evidence listed | changed | product-defect | medium | unheld (R1 01QoxbLdKp… 'holds nothing' |
| 2.u2 | Walkthrough §1: code DMN5 (screen NEUR), missing badges, no Lifecycle stage, no workstream, stale F9 note, 36 eSTAR sections | reproduced | stale-walkthrough | medium | Client administration session 01T2woo… (COORDINATION.md:121 names docs |
| 2.u3 | Walkthrough §2 'Source files · filing cabinet' does not exist; approved 510(k) Summary not in the governed tree, readiness 0% | changed | stale-walkthrough | medium | Client administration session 01T2woo… for docs/demo (COORDINATION.md: |
| 2.u4 | Approved, frozen 510(k) Summary shows 'Unbound working copy', raw 'status is APPROVED', edit affordances | changed | product-defect | medium | unheld (COORDINATION row :105 holds DocumentWorkbench.tsx for the save |
| 2.u5 | Signature claims differ from screen (Approval/Password vs APPROVER/PIN); 'Covers frozen version approved'; two display names | changed | stale-walkthrough | medium | docs/demo: unheld by row (GA-DEMO-16) |
| 2.u6 | Walkthrough §3 'close the program' step, F2 note and 'open query blocks freeze' are stale | reproduced | stale-walkthrough | medium | unheld by row (GA-DEMO-16: the lead's rehearsal intends to correct doc |
| 2.u7 | Cybersecurity Summary: 'Draft' in editor and Author step, 'In review' on Review step; review reason names 510(k) Summary | reproduced | product-defect | medium | mdx.mjs: unheld (011Dpx… holds no file now |
| 2.u8 | Device 510(k) described with drug/eCTD rules in Planner, Validation and Dispatch | reproduced | product-defect | medium | SubmissionCenter.tsx held by Client administration and screen work (01 |
| 2.u9 | Raw rule codes, table names and UUIDs shown as reason text | reproduced | product-defect | medium | unheld (dispatch-readiness.ts released by RIM |
| 2.u10 | Market card repeats itself and its blocker count disagrees with its list | reproduced | product-defect | low | Project page (session_01FTWcmXm7At3ZXBE5VWn6oS) |
| 2.u11 | Review step says 'Open change controls 0' while MDX-CC-2026-001 is open | reproduced | seed-data | low | unheld (device demo pack owner 011Dpx… holds no file now |
| 2.u12 | Change-control linked records labelled by raw UUIDs; title truncated; pharma (ICH Q10/Annex 15) framing; F7 note stale | changed | seed-data | low | ChangeRecordDetail.tsx: Quality and training (01GyGhjgjrNv… |
| 2.u13 | Audit trail: raw event names/targets; 200-row window filling with rehearsal and System noise | changed | product-defect | medium | audit-trail-ledger.routes.ts event names: J2 human test (01QoxbLb… |
| 2.u14 | Session ended by the server: Submission Center tabs show garbled 'didn't respond … Sign in again..' instead of a sign-in prompt | reproduced | product-defect | medium | sessionEnd.ts / queryClient.ts: unheld |
| 2.u15 | Analytical Performance report: tiny 319x320 viewer; PDF subtitle and provenance footer run off the page | changed | seed-data | low | unheld (no COORDINATION row names scripts/demo/launch-demo/lib.mjs |
| 2.u16 | Raw tokens and identity inconsistencies across the device screens (510k, 510K, k510, Ivd, demo-pack rationale, two manufacturer names) | reproduced | product-defect | low | ProjectHome.tsx / ProjectRecords.tsx / projectWords.ts: Project page ( |
| 3.u0 | With no AI provider, 'Explain the findings' blames invalid JSON instead of the missing provider | reproduced | product-defect | low | submission-ai-service.ts and SubmissionSeqWorkspaces.tsx: unheld. gate |
| 3.u1 | Walkthrough 'Open Dispatch readiness' has no rail item; Search's 'Orchestration & readiness' says '0 blockers' | reproduced | product-defect | medium | Orchestration.tsx and biotech-walkthrough.md: Client administration (0 |
| 3.u2 | Walkthrough §5 navigation stale; widening to the org's submissions changes the selected submission under the C2C-101 breadcrumb | changed | product-defect | medium | SubmissionCenter.tsx: Wave B W3-compile-in-words |
| 3.u3 | On the Submit stage the whole app shell scrolls, hiding the top bar and leaving a band at the bottom | changed | product-defect | medium | unheld (D3's Project*.tsx and project-home-v2.css were released |
| 3.u4 | C2C-201 is 'Biotech' on its project page but 'Pharma' in Submission Center | reproduced | product-defect | medium | unheld |
| 3.u5 | Every seeded leaf reads 'Vault document · not yet determined' above 'Source evidence not yet determined for 6 leaves' | reproduced | product-defect | medium | unheld (COORDINATION.md:475 marks submission-leaf-source-evidence.ts u |
| 3.u6 | Internal table names, UUIDs, record keys and gate codes appear in client-facing findings | changed | product-defect | medium | unheld (DispatchReadiness.tsx |
| 3.u7 | Developer-facing copy shown to the client (Sequences, Validation, Forms and letters) | reproduced | product-defect | low | IndLifecycle.tsx and SubmissionCenter.tsx: Client administration and s |
| 3.u8 | Form field check shows raw snake_case keys | changed | product-defect | low | Client administration (01T2woo…) |
| 3.u9 | Seeded failed Shadow Review Run #1: copy contradicts itself and Dispatch counts | reproduced | product-defect | medium | ShadowRunCoverage.tsx and shadow-review-waiver.ts unheld |
| 3.u10 | 'Draft' regresses sequence 0000 from Assembling in one click, no confirm or reason | reproduced | product-defect | medium | SubmissionCenter.tsx held by Wave B (01T2woo… |
| 3.u11 | Required deliverables tab is empty for an IND | reproduced | product-defect | medium | SubmissionRequiredDeliverables.tsx unheld (no row) |
| 3.u12 | Identity-difference table has no layout; raw field keys and 'ind' | reproduced | product-defect | medium | unheld |
| 3.u13 | Compile shows Module 5 green 'Ready' for unapproved documents, plus rule-pack and orchestrator jargon | reproduced | product-defect | medium | EctdCompile.tsx: Client administration and screen work (01T2woo…) |
| 3.u14 | Planner lists eSTAR for an IND; gateway rules are bare codes; form list disagrees with the Submit stage | changed | product-defect | medium | SubmissionCenter.tsx: Client administration and screen work (01T2woo…) |
| 3.u15 | Validation finding header stacks code, a lone dot and the section on three lines | reproduced | product-defect | low | unheld (COORDINATION.md:1091 lists SubmissionSeqWorkspaces.tsx BT-F4 a |
| 3.u16 | Question chips leave Submission Center for a prefilled project conversation (honest with no provider) | reproduced | not-a-defect | none | Client administration and screen work (01T2woo…) |
| 4.u0 | Org-level governed-artifact table shows no artifact names (title column collapses to 0 px) | changed | product-defect | none | unheld |
| 4.u1 | Walkthrough Vault navigation and numbers are stale ('Uploaded files', '92 sections', 'Source files · filing cabinet') | reproduced | stale-walkthrough | medium | unheld (GA-DEMO-16: 'unheld by row' |
| 4.u2 | Governed CTD section says the IB is 'Not started — no content yet' while IB v3.0 is filed at the same section | changed | product-defect | low | project-vault.ts partly held by Vault parity (01KnUG…) |
| 4.u3 | PDF viewer squeezed into ~320x320 side panel; title bar shows a blob UUID | changed | product-defect | low | vaultPdfViewer.tsx unheld |
| 4.u4 | FDA loop says 'No submission items yet' for a program that has IND sequence 0000 | reproduced | product-defect | medium | Wave B W5-agency-communication (COORDINATION.md row 122 names v2/surfa |
| 4.u5 | Story conflict: FDA IR 'We are reviewing your submission' on an undispatched IND; no Pre-IND meeting recorded | changed | seed-data | low | unheld (demo packs: no COORDINATION row for packs/biotech*.mjs |
| 4.u6 | Vault chips 'What is missing for this filing?' / 'not yet effective' go to AnA though the screen answers deterministically | reproduced | product-defect | low | unheld for the starter row (Vault.tsx is held only for row copy by J2 |
| 4.u7 | Inspection readiness: CRO/service view, no trial prefilled, urgent verdict, output credited to AnA | not-reproduced | — | — | eTMF inside the Vault lane (COORDINATION row 130: Etmf.tsx |
| 4.u8 | 'Mark the tasks that gate the milestone' opens 'Start a workflow' (Create 6 tasks); marks nothing | reproduced | product-defect | medium | Wave B W6-review-and-tasks (COORDINATION row 122 names v2/surfaces/Tas |
| 4.u9 | 'Approvals pending 0' beside open approval tasks; 'has the most open work' stated over a tie | reproduced | product-defect | medium | Wave B lane W6 (COORDINATION.md line 122: 'v2/surfaces/TaskBoard.tsx . |
| 4.u10 | MDX filing-cabinet documents numbered 39.1, 39.2, 40.1...: a global folder counter that reads like section numbers | reproduced | product-defect | medium | unheld (the eTMF row |
| 4.u11 | Prefilled 'Draft response with AnA' prompt shows an internal id and promises an attachment that is not shown | reproduced | product-defect | low | Wave B lane W5-agency-communication (COORDINATION.md line 122 lists v2 |
| 4.u12 | Task cards truncate the project to '[Demo · …', so biotech and device tasks look the same | reproduced | product-defect | low | Wave B lane W6 (COORDINATION.md line 122 |
| 4.u13 | Seeded task states contradict their records; Team card disagrees with the board on assignees | reproduced | product-defect | low | ProjectHome.tsx: Project page D3 (session_01FTWcmXm7At3ZXBE5VWn6oS |
| 4.u14 | New task Module dropdown lists duplicate raw values; Priority is lowercase | reproduced | product-defect | low | Client administration and screen work (01T2woo…) |
| 4.u15 | Required-document rows show bare codes and a raw rule-pack line; required set inconsistent with Library | changed | product-defect | low | Vault parity (01KnUG…) |
| 4.u16 | Copy rough edges on the FDA letter card (capitalised visibility, non-link 'letter in the data room', '5 C', truncated Q2) | reproduced | product-defect | low | AgencyInbox.tsx and commcenter-v2.css: Client administration and scree |
| 4.u17 | Classification/type labels a reviewer would question; uploaded-files rows misaligned | changed | product-defect | low | Vault.tsx: Vault parity (01KnUG…) |
| 5.u0 | 'Open document' on draft/under-review SOPs opened an empty 'Read and acknowledge' box | not-reproduced | — | — | Quality and training (01GyGhjgjrNv…) |
| 5.u1 | Version history headings show raw section codes ('qms-purpose Purpose') | reproduced | product-defect | medium | Quality and training (01GyGhjgjrNv…) |
| 5.u2 | Change control linked records lead with raw Vault UUIDs instead of the record title | changed | product-defect | low | Quality and training (01GyGhjgjrNv…) |
| 5.u3 | 'Approve' offered to the founder on MDX-CC-2026-001, a change the founder proposed | not-reproduced | — | — | Quality and training (01GyGhjgjrNv…) |
| 5.u4 | Audit rows show raw internal codes as events and targets | changed | product-defect | medium | audit-trail-ledger.routes.ts: J2 human test |
| 5.u5 | Newest audit entries are rehearsal noise; the scripts point at the top rows | changed | stale-walkthrough | medium | Client administration (`01T2woo…`) |
| 5.u6 | Second chain banner says some services write to another chain 'instead of the ledger' | reproduced | product-defect | medium | unheld (no COORDINATION.md row names AuditEventChain.tsx) |
| 5.u7 | Report catalog shows raw enum codes for regions, roles, families and availability | changed | product-defect | low | Reporting analytics (`011HLkY…`) |
| 5.u8 | Long lists of reports that cannot run (30 on Reports, 25 not computed on Catalog) | reproduced | product-defect | low | Reporting analytics (011HLkY...) |
| 5.u9 | Biotech report page shows a 'Device projects' block with a 24-row grid of zeros | reproduced | product-defect | medium | Insights.tsx: Reporting analytics (011HLkY...) |
| 5.u10 | Risk-based monitoring is empty for the biotech demo; AnA starters speak of 'this study' | reproduced | seed-data | low | Rbm*.tsx: the coordinating session (01JbQU...) |
| 5.u11 | Walkthrough says the change record and the protocol amendment are 'the same event'; C2C-CC-001 links only to SOP-002 | reproduced | stale-walkthrough | low | GA readiness lane L3 (packs/biotech*.mjs |
| 5.u12 | Stale walkthrough details: 'Quality & Assurance', 'four SOPs', F7 'log column shows 0', APPROVED vs 'Meaning: Approval' | reproduced | stale-walkthrough | low | unheld (GA-DEMO-16: 'unheld by row |
| 5.u13 | Design calculators: rail highlight, raw 'effectSize' error, button enabled with empty field, lowercase enums, raw result labels | changed | product-defect | low | unheld |
| 5.u14 | Biostatistics copy: 'org-scoped' badge, 'NoteRandomisation', "psoriasis's design" subtitle | reproduced | product-defect | low | unheld |
| 5.u15 | Audit trail 'digitally signed', empty Validation filter with no message, Compliance reports 'audit_events store' | reproduced | product-defect | low | AdminSurfaces.tsx: security lane (011Dpx…) |
| 5.u16 | SOP register rows cramped: truncated titles, actions stacked six deep | not-reproduced | — | — | Quality and training (01GyGhjgjrNv…) |
| 6.u0 | Raw camelCase field keys shown as 'missing' inputs | changed | product-defect | medium | unheld (the CMC lane 01GJidg5 'Holds nothing' |
| 6.u1 | §3.2.A.3 missing input is a garbled paragraph ('0 of 0 have none recorded'); lactose not flagged | not-reproduced | — | — | unheld |
| 6.u2 | Lineage/provenance show raw JSON, user id '1', record keys/UUIDs; §3.2.S.4 lineage includes drug-product records | changed | product-defect | medium | CmcModule3Build.tsx: Client administration and screen work 01T2woo |
| 6.u3 | Composed Module 3 narrative states things the records do not support | reproduced | product-defect | medium | unheld (CMC lane 01GJidg5 holds nothing |
| 6.u4 | ICH check contradicts the register's 'Validated' methods, counts DS+DP batches together, derives 0 CQAs from 6 specs | changed | product-defect | medium | unheld (qbd-analyzer.ts listed 'Unheld |
| 6.u5 | Second-person QC review drawer defaults to 'pass' and hides the result being verified | reproduced | product-defect | medium | Validation for GA (01QoxbLcnW…) holds v2/surfaces/cmcRegisterForms.ts  |
| 6.u6 | Incomplete composed Module 3 sections cannot be read from the CMC screen | reproduced | product-defect | medium | CmcModule.tsx Overview approvals table: Validation for GA (01QoxbLcnW… |
| 6.u7 | AnA says 'Prior turns are preserved' but a question asked with no provider is saved nowhere | reproduced | product-defect | medium | useAnaChat.ts and routes/ana-ri/stream.ts: unheld (no row |
| 6.u8 | Drug substance row is bare ('--' formula, MW, CAS) and shows raw enum 'phase_2' | changed | product-defect | low | cmcRegisters.tsx: no explicit hold. The CMC session (01GJidg5…) names  |
| 6.u9 | Plan says Module 3 has '21 documents · 0 started' and readiness 0% while 21 Module 3 sections are composed | reproduced | product-defect | medium | ProjectHome.tsx: Project page D3 (session_01FTWcmXm7At3ZXBE5VWn6oS) |
| 6.u10 | Chips only prefill; CMC chips land in an earlier, unrelated conversation | reproduced | product-defect | low | unheld |
| 6.u11 | Conversation chrome advertises agent capabilities with no provider and shows jargon | reproduced | product-defect | low | unheld |
| 6.u12 | C2C-101 biologic refusal honest but surrounding screens and seed inconsistent | reproduced | product-defect | low | unheld |
| 6.u13 | Change control opens with deployment-flag jargon | reproduced | product-defect | low | unheld |
| 6.u14 | Tables overflow their cards; minor layout and console noise | changed | product-defect | low | unheld |

## Method, and its limits

- **One database, one trunk.** The counts in the findings (4 blockers, 8 errors, 7 leaves, 579 chained entries) are
  this seed on this trunk. The walkthroughs now tell the presenter to read such counts off the screen.
- **No model provider.** AnA's answers were not exercised beyond its honest "No AI provider is configured" reply.
- **Screens.** The walkers' screenshots (1,113 PNGs, 210 MB) stayed on the rehearsal machine. `findings.json` names
  each finding's screenshots by their local path, and the steps to reproduce each one are in the finding itself.
- **Read from code, then walked.** The 36 were re-checked from code and tests; the 125 were walked in the app.
