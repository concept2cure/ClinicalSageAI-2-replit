# The filing spine: every feature inside the work of building a filing

**Status:** decided by the CPO 2026-10-08 for slices F0–F24, except the five questions in §8, which are the founder's. Supersedes nothing; builds on `docs/design/ONE_ANA_ONE_CANVAS.md` (one AnA, the canvas) and `docs/SURFACE_DECISIONS_2026-10-08.md` (what is real), and corrects the latter where §6 row 27 says so. Launch row D2. Made by a read-only design workflow: three readers over the code, three proposals, two judges (regulatory operations; product and engineering), one synthesis.

Read-only design, 2026-10-08. I read the code at HEAD `427775e54` on `concept2cure-v2`, where ana-14 has landed. Line numbers are from HEAD (`git show HEAD:<path>`). Client paths under `client/src/concept2cure/v2/` are written short, for example `surfaces/ProjectHome.tsx`.

Uncommitted while I read:
- The 2D review loop: `server/routes/authoring.router.ts`, `server/middleware/authoringObjectAuthorization.ts`, `editor/AssignReviewDialog.tsx`, `editor/SendForReviewDialog.tsx`, `surfaces/TaskBoard.tsx`, and their tests.
- Staged edits to `components/ana/useAnaChat.ts`.

Line numbers in these files will move.

Labels used below:
- **By reading:** traced in the code, not run.
- **Unverified:** not checked.

**How this was made.** Three proposals went to two judges. The judges picked different winners, but both wanted the same shape:
- Proposal 1's five tabs and one dossier per market.
- Proposal 3's small slices that reuse existing code, and its fixes that leave one AnA.
- Proposal 2's fix to section status.

Every claim the judges found wrong has been dropped or corrected.

---

## 1. Decision

The project is the filing.
- **Five tabs.** Inside the project, five tabs follow the work in order: Evidence, Author, Review, Submit, Respond. Each of today's apps becomes a feature of one tab. It opens with the project, market, sequence or document already chosen. There is no app launcher inside the project.
- **Markets.** A market is one agency and one application type. Each market has its own sequences, its own readiness verdict and its own Module 1. Modules 2–5 are written once and placed into each market.
- **One AnA.** AnA is one conversation, and the document it builds opens on the right. The editor loses its own AnA, and Reporting loses its chat look-alike.
- **From the sequence, not the rail.** Compile, transmit and the readiness verdict are reached from the sequence.
- **Plan and Lifecycle go.** Nothing real is in those tabs. What they promised is listed as "coming later".
- **First fix.** Section status never moves for work done in the editor, so every "what is missing" figure on the project page reads zero. Nobody has seen this yet.

At launch this gives one US drug filing (IND, NDA, BLA or ANDA) built, reviewed, signed, gated, frozen and dispatched in one place. Transmit is wired but not proven (D7). Every other market can be built and checked, and each says on screen what it cannot do yet.

One decision was taken on your behalf and needs your yes: transmit runs on the sequence, not on the separate package store (LX-13).

---

## 2. The spine

The order of the work:
1. What needs me
2. Open the filing
3. Evidence
4. Author
5. Review
6. Submit, per market: build, check, freeze, dispatch, transmit, follow-ups
7. Respond

### Before the tabs

**My work (rail, across projects).**
- Review requests and §11.50 sign-offs arrive as tasks that open the document. This is 2C, landed: `editor/SendForReviewDialog.tsx`, `editor/TaskSignOffDialog.tsx`.
- The rail entry applies the `mine` filter (`registryModel.ts:148`).
- It cannot be filtered to one project. Tasks are keyed on the integer `projects.id`, and ADR-0011 is still Proposed. `MyWorkLine` on the project page says so (`surfaces/ProjectHome.tsx:1286`).

**Project header.**
- Projects publishes `window.C2C_PROJECT` (`shellProject.ts`). The header shows product, application type, primary agency and application number.
- F9 adds one line under it: each market's verdict from the server gate, and the count of documents in review from `GET /api/review/board?scope=all&programId=` (`server/routes/review-board-routes.ts:87-115`). Nothing in the line is computed in the browser.
- F8 names the project in the top bar on every screen.

**Start box and Conversations list (ana-12).**
- Today they sit inside the Author tab (`ProjectHome.tsx:1928-1929`). Leaving Author unmounts a half-typed message (`:1759-1763`).
- F2 moves them above the tabs, outside the tab switch.

### Evidence: bring the sources in

**Job:** get study reports, CMC data, letters and records into the project, through one place.

**Holds:**
- **Project files:** `ProjectEvidence` → `editor/ProjectFilesPanel.tsx`, over `GET /api/c2c/project-vault/:id` (`ProjectHome.tsx:243-262`; slice 23, landed `7a6edef06`).
- **Data room:** `DataRoom` (`ProjectHome.tsx:680-967`), with sources, uploads and pins. Today it is mounted under Author (`:1435`); F3 moves it here.
- **Adopting a conversation file:** the audited adopt action (PF-07, `surfaces/ConversationFilesAdopt.tsx`).
- **Vault** (`surfaces/Vault.tsx`) is this tab's working view: upload, versions, filing, and placing a vault file into a sequence (`surfaces/VaultPlaceIntoSubmission.tsx`). It opens from "Open in Vault" (`ProjectHome.tsx:250`).

**Changes (F3):**
- "Write from these sources" (`:947`) opens the editor with no document. It becomes the pin-and-ask handoff that "Draft with N pinned" already does (`:955-964`).
- The tab blurb "Vault, RAG search & claim↔evidence linking" (`fixtures/project-home-data.tsx:286`) becomes "Project files and the data room the documents are written from".

**Coming later:** import from Veeva Vault, SharePoint and OneDrive. `Vault.tsx:1446-1462` already says so.

**AnA and canvas:**
- "Draft with N pinned" sets `C2C_SOURCE_PINS` and asks in the one conversation. The canvas opens when AnA starts a document.
- A chat attachment joins the data room only through the person's adopt.

Sources serve every market.

### Author: write what each market needs

**Job:** see which sections are required and not started, start them, and draft them with AnA from the sources.

**Holds:**
- **Documents list (F3):** `GET /api/authoring/docs?programId=`, rendered with `useDocumentList` and `StatusPill` from `editor/CanvasDocumentList.tsx` (2B, landed). A row opens its document by id through `setEditorTarget` (`editorTarget.ts:152`). It replaces two things:
  - "Recent drafts" (`ProjectHome.tsx:1528-1560`). It opens the editor without the draft (`:1537`, `:1552`) and filters on a status that never moves (`server/routes/c2c/projects.ts:1095`, `status != 'todo'`).
  - The Workspace grid (`:1342-1369`).
- **Module completion** by CTD module (`ProjectHome.tsx:1402-1430`, from `GET /:id/workstreams`, `projects.ts:1037-1060`).
  - It reads section status, which only moves after F1.
  - A row opens the governed document at that module, not the editor's list (`:1421`).
- **Editor:** `surfaces/DocumentAuthoring.tsx` → `editor/DocumentWorkbench.tsx`, with the filing outline (`useFilingOutline.ts`). Clicking a required section with no draft only toasts "no draft yet" (`DocumentWorkbench.tsx:3430`). F4 makes the click start that section.
- **Canvas:** `editor/DocumentCanvas.tsx` beside `surfaces/ConversationThread.tsx` (slice 1). It has the Documents list and the working-copy download (`editor/DownloadMenu.tsx`, 2B).
- **The document's own exits:** Send for review, File to vault (`editor/FileToVaultDialog.tsx`) and Place into filing (`surfaces/AuthoringPlaceIntoFiling.tsx`).
- **Protocols** (`protocol-dev`), listed as "Protocols (organisation-wide)".
  - `protocol_documents` has no program key (`migrations/20260621_protocol_development.sql:19-38`; PF-14 open).
  - A filed protocol is placed at the Module 5 code for its study type (ICH M4E 5.3.x). There is no single fixed code.

**AnA and canvas:**
- There is one conversation. The document opens on the right while AnA builds it.
- AnA's edits arrive as tracked suggestions, and the writer accepts and saves. AnA never saves governed content as final and never signs (`docs/design/ONE_ANA_ONE_CANVAS.md:565-595`).
- **F5 removes the editor's own AnA pane.** The pane opens by default (`DocumentWorkbench.tsx:1032`), runs its own `useAnaChat` (`:1421`) and renders from `:4532`.
  - Its button becomes "Work on this with AnA". That opens the conversation with this document in the canvas, through `openFromList` (`ConversationThread.tsx:1212`).
  - The pane also renders a governed command's §11.50 sign-off (`:4537`). The conversation must render that sign-off before the pane goes.
- In production, drafting governed content needs a PQ-passed model. The launch definition says 0 of 4 approved models have one (`docs/LAUNCH_DEFINITION_OF_DONE.md:20`; not re-verified). A refusal is shown as a refusal, never as an empty draft.

**Markets:**
- Module 1 is per market; Modules 2–5 are written once.
- Today the outline is the project's newest governed document (`useFilingOutline.ts:175`), so only the first market has a Module 1 outline. F22 gives each added market its own.

### Review: review, approve, sign

**Job:** send finished documents for review, and see what this filing has out, what came back, and what waits for a signature.

**Holds:**
- **Send for review** from the document and from the canvas card (2C, landed; the 2D loop is in flight).
- **Project review queue (F7):** `GET /api/review/board?scope=all&programId=<uuid>`. The route already filters by program (`review-board-routes.ts:108-115`).
  - Status shows in words (`REVIEW_STATUS_LABEL`, `surfaces/Review.tsx:79`), and a row opens its document through `openReviewDocument` (`Review.tsx:159`).
  - It replaces "Review tasks aren't wired to this workspace yet" and its button to the `task-board` alias (`ProjectHome.tsx:1890-1902`).
- **"Open the review board"** opens `surfaces/Review.tsx` with its program filter on (`onlyProgram`, `Review.tsx:111-137`).
- **Signing:**
  - `surfaces/AuthoringSignatures.tsx` with `EsignModal`, over `POST /api/authoring/docs/:docId/e-sign` (`authoring.router.ts:4543`).
  - `editor/TaskSignOffDialog.tsx`.

**Change (F1):** the approval signature moves the bound governed sections to `approved`, in the same transaction.

**AnA and canvas:** AnA summarises comments and proposes fixes as tracked suggestions. It never approves, signs or records a verdict.

**Approval at filing (a correction to proposal 1).** Freeze, dispatch and transmit already refuse unapproved leaf sources:
- A placed filing copy takes its status from the source (`server/services/coauthor/coauthor-snapshot.ts:105-107`).
- A co-author copy can be transmitted only when it is `approved` (`server/services/ectd/leaf-source-resolver.ts:159`).
- `assertSequencePackageable` runs at freeze and dispatch (`server/services/submission-service/submission-service.ts:907`, called at `:1002`) and again at transmit.

The real gap is that the copy's status is fixed at the moment of placement. A draft that is placed and later approved stays `draft` until it is re-placed. F17 says so before placing and offers "Re-place approved version".

### Submit: one row per market; everything else from the sequence

**Job:** for each market, build the sequence, check it, freeze it, dispatch it, transmit it, download it, and file follow-ups.

**Market list (F9).**
- One `ProjectMarkets` list, generalised from slice 24's `ProjectSubmitStage`, `ProjectReadiness` and `ProjectSubmissions` (`ProjectHome.tsx:407-520`).
- Today the verdict covers one submission (`findProgramSubmission`, `surfaces/programSequence.ts:261-269`).
- Each row shows:
  - application type and agency;
  - the latest sequence and its status;
  - its own server verdict (`GET /api/submissions/sequences/:seqId/dispatch-readiness`, `server/routes/submissions.ts:1680`);
  - its support line (F19).
- A failed read shows "No verdict" with a retry, never "Cleared".

**Add a market**, at the top of the tab.
- Until F22, it opens Submission Center's New submission form with the project named. F20 fixes the form's defaults.
- After F22, it calls one route.

**Opening a row.** The row opens Submission Center on that submission and sequence (F10).
- Its tabs: Planner, Sequences, Builder, Validation (`surfaces/SubmissionSeqWorkspaces.tsx:626`), Shadow review and Dispatch (`:1221`).
- Cross-region goes (F21).

**On the sequence's Dispatch tab:**
- **Assemble a test package (F10):** `POST /api/submissions/sequences/:seqId/assemble` (`submissions.ts:1620`), which has no client caller today. It shows the server's blockers verbatim.
- **Freeze and Dispatch:** each with a Part 11 signature. These are real (`surfaces/SubmissionCenter.tsx:701` `runGoverned`; `EsignModal` at `:1698-1722`; `submissions.ts:1718`, `:1734`).
- **Transmit (F12):** `POST /api/submissions/sequences/:seqId/transmit` (`submissions.ts:1762` → `transmitSequence`, `submission-service.ts:1333`).
  - It has no client caller today. The tab offers only a sentence (`SubmissionSeqWorkspaces.tsx:1436-1441`).
- **Transmissions and acknowledgements (F13):** `GET /api/mdx/gateways/transmittals?program_id=&region=` (`server/routes/mdx-submission-gateway.ts:119-160`).
  - Sequence transmit writes `program_id` (`submission-service.ts:1512`).
  - Whether the row also records the sequence id is unverified. If it does not, the list says it is filtered by project and region.
- **Compile and download (F14):** eCTD compile (`surfaces/EctdCompile.tsx`), opened with the sequence carried. For markets with no gateway channel, this is how the package reaches the applicant.

**Follow-ups on each market row.**
- Amendment, response, annual, variation and withdrawal (`SubmissionCenter.tsx:294`).
- Leaf lifecycle operations in the Builder.
- There is no US supplement type and no Japanese partial-change type. See section 3.

**Planner (F21).** It shows the market's required structure from the deterministic engine: `POST /api/submissions/:id/plan` (`submissions.ts:1011`) → `buildSubmissionStructure` (`server/services/reasoning-engine/submission-structure.ts:176`). No v2 screen calls it today.

**Coming later**, as one line on the tab:
- registrations, market access and pharmacovigilance;
- the variation classifier (route at `submissions.ts:528`, no UI);
- IND annual-report tracking;
- regulatory intelligence, precedent and agency meetings.

**AnA:**
- It explains validation findings (`POST /:id/validation/explain`, `submissions.ts:1033`).
- It narrates the dispatch QC, whose verdict is deterministic (`:1085`).
- "Fix" on a finding opens the Builder at that code (F18). Today it sends chat text (`surfaces/DispatchReadiness.tsx:363`).
- AnA never freezes, dispatches or transmits.
- There is no canvas here: a sequence is a record, not a document.

### Respond: answer the agency

**Job:** turn an agency letter into a reviewed response and file it as a response sequence in the same market.

**Today:** one card, "Response authoring", which opens the editor with no letter (`fixtures/project-home-data.tsx:300-304`). HA questions and precedent responses are locked.

**After F15**, three actions:
1. **Add the agency's letter:** a data-room upload.
2. **Draft the response with AnA:** the letter is pinned (`C2C_SOURCE_PINS`) and the conversation opens.
3. **Start a response sequence:** Submission Center opens on that market's Sequences tab with the follow-up type `response`.

**Coming later:** question-by-question tracking (`haq-manager` is locked; its routes exist in `server/routes/haq-manager.ts`), agency meetings and precedent responses.

**AnA** drafts the response from the pinned letter and the project's sources. It invents no question numbers or due dates. The response then goes through Review and is placed like any other document.

### Plan and Lifecycle

Both tabs show "Not in this release" with no button (`ProjectHome.tsx:522-548`). Their tools are all locked (`fixtures/project-home-data.tsx:295-299`, `:305-309`).

F2 removes both tabs:
- Market choice moves to Submit (Add a market and the Planner).
- Follow-up sequences live on each market row.

`SchedulePanel` goes with Plan, for two reasons:
- It fetches only numeric ids (`SCHED_IDENT_RE`, `ProjectHome.tsx:1013`, `:1061`), but the page holds a program UUID or nothing (`:1598`). So it never loads for a project opened from Projects (by reading).
- Its "Generate" asks AnA for dated milestones (`:1072-1075`), which is a model producing figures and breaks Rule 2.

`project-home.set-stage` keeps `plan` and `lifecycle` as aliases for Submit (`shared/navigation/surface-actions.ts:483`), so AnA calls that use them still resolve.

---

## 3. Jurisdictions

### How one filing for several agencies appears

**Project.** One product's filing program, keyed on `regulatory_programs.id`.

**Market.** One agency and one application type: one `submissions` row anchored by `program_id` (`createSubmissionSchema`, `submissions.ts:167-181`).
- A US IND and a US NDA are two markets. They have different Module 1 content (Form 1571 vs 356h) and separate sequence numbering.

**What already exists, and what is still single.**
- Submission Center can already add submissions on the same program in 14 regions.
- What is single today:
  - the governed outline (`ALREADY_SCAFFOLDED`, `server/services/c2c/scaffold-project-documents.ts:121`, `:161`);
  - `target_agencies`, which is written as `[primaryAgency]` (`server/routes/c2c/projects.ts:763`) and never edited.

**Each market has:**
- sequences numbered in its own region;
- its own verdict (F9);
- its own transmit route (`transmitRouteFor`);
- its own Module 1 outline (F22);
- a support line (F19).

**Modules 2–5.**
- They are written once as project documents and placed into each market's sequence. Placement is per market.
- Copying placements from one market to another is coming later, and the Builder says so.
- A market that needs its own version of a common document gets its own document, placed only there. Examples: Japanese Module 2 for PMDA, Chinese for NMPA, a region-specific 2.5, 2.7 or 3.2.P, and FDA ISS/ISE under 5.3.5.3.
- One approval does not cover a translation or a regional rewrite.
- After approval, markets diverge, so each market keeps its own leaf lifecycle.

**Module 1 and 3.2.R: per market.**
- The five full CTD packs at ich-m4-v2.1 share the same 50 Module 2–5 keys outside Module 1 and 3.2.R. The packs are nda:fda, bla:fda, maa:ema, jnda:pmda and ind:mhra; the judges parsed this from `migrations/20260804_phase9_rule_pack_outlines.sql`.
- ind:fda v2.3 (`migrations/20260901_ind_fda_m1_v2_3_outline.sql`) is deeper.
- So adding a market scaffolds only its Module 1 subtree and 3.2.R.
- A key that its pack requires but the home tree lacks shows as a gap row. It is never inserted silently.

### What is real today, per region

| Region | Governed outline | Module 1 as packaged | Gate checks Module 1 (region profile) | Transmit | Market row says |
|---|---|---|---|---|---|
| FDA | IND, NDA, BLA, ANDA. Device outlines exist (510(k), De Novo, PMA), but device programs get no submission (`projects.ts:818-821`, by reading) | Built to FDA headings (`server/services/ectd/regional-backbone-readiness.ts:45`) | Yes | ESG AS2 envelope is not PKCS#7, so FDA would reject it (`server/services/submission-gateways/fda-esg.ts:18-30`). No ESG account, no DTDs (D7) | "Transmit not proven: \<server reason\>" |
| EMA | CTA (CTR 536), MAA, MDR, IVDR | Flat under `<m1-eu>` | Yes (`eu`) | Centralised MAA: CESP refuses and the channel is unconnected. CTA goes through the CTIS portal only | "Applicant uploads" / "CTIS portal only" |
| PMDA | J-NDA | Flat. A new application needs eCTD v4.0 and is blocked (`server/services/ectd/dispatch-readiness.ts:214-241`) | Yes (`jp`) | The adapter refuses (`pmda-gateway.ts`) | "New applications blocked: eCTD v4.0 required" |
| Health Canada | None (`NO_RULE_PACK`) | Flat | No | The adapter posts to an endpoint written from no agency source (`health-canada-gateway.ts:7-16`) | "No outline; no channel" |
| MHRA | `ind:mhra` exists but is mislabelled: the UK has no IND | EU placeholder | No | Generic adapter, no channel | Not offered |
| NMPA, MFDS | None | EU placeholder | Yes (`cn`, `kr`) | No channel | "No outline; no channel" |
| TGA | None | EU placeholder | No | No channel | "No outline; no channel" |
| Swissmedic, ANVISA, CDSCO, HSA, EU national authorities, notified bodies | Unmapped (`server/services/c2c/document-class.ts:67-70`) | EU placeholder | No | No channel | Refused at creation |

Region profiles exist only for fda, eu, jp, cn and kr (`server/services/region-profiles/region-profile-service.ts:66-72`).

The "no channel" labels for Health Canada and the generic adapters follow regulatory practice as the judges described it. Health Canada's CESG uses AS2, and the other agencies take portal uploads. I have not checked this against agency documents.

### How the UI says so

**One support line per market, from one server function (F19).**
- It is composed from four sources:
  - the rule pack;
  - the region profile;
  - `classifyRegionalBackbone` (`regional-backbone-readiness.ts:100`);
  - the submission channel plus the adapter's own refusal.
- It is shown on Add a market and the New submission region options, on each market row, and on the New project picker's entries (`surfaces/AnaVerbs.tsx:23-60`; today 234 entries with no tier).
- No model writes any part of it.

**`submission-resolver.ts:237` reads the same function.** Today it sets `buildSupported = AGENCY_MODULE1[agency] != null`, so EMA and PMDA are reported as buildable while their Module 1 is flat.

**The Planner shows a proxied region as "No rule data for \<agency\>".** It never shows sections or a review clock for that region. Today the engine returns `supported: true` with the proxy region's sections and clock, plus a note (`submission-structure.ts:196-215`).

**Unsupported agencies are refused at creation**, with the reason (`NO_RULE_PACK`, `UNMAPPED_PROGRAM_TYPE`).

**Transmit results are shown verbatim.** `{transmitted:false, reason:'gateway_not_configured'}` reads "Not sent: no gateway account is configured for this region and environment".

### Coming later, named where each would live

- Copying Module 2–5 placements across markets: Builder.
- Regional forms panels: `IndFormsPanel` is mounted only in the locked `IndLifecycle.tsx:1177`. Until it returns, a form node is met by a completed PDF placed from the Vault.
- US supplements (PAS, CBE-30, CBE-0) and Japanese partial-change applications: market row. No such sequence type exists (`SubmissionCenter.tsx:294`), and "variation" is the EU term.
- eCTD v4.0.
- Device packaging and transmission.
- Agency question tracking, registrations, the variation classifier and annual reports.
- Proven gateways (D7): DTDs, PKCS#7 AS2, an ESG account, and one accepted test sequence.

---

## 4. Navigation

**Rail.** Unchanged from 2A (`registryModel.ts:141-150`): New conversation, Projects, Vault, Submission Center, Quality, Reporting & analytics, My work, Conversation.
- There are no renames for launch. The "Documents", "Submissions" and "Records & reports" names (`docs/SURFACE_DECISIONS_2026-10-08.md:30-38`) are dropped; no slice owns them.
- "Conversation" becomes Recents when the client half of ONE_ANA slice 3 lands.

**Top bar.**
- A project chip (F8) replaces "Switch client domain" (`Shell.tsx:518-545`). That control's job is already done by Client type in the account menu (`Shell.tsx:404`).
- The chip opens the project page. "No project open" opens Projects.

**Reached only inside a project:**
- the five tabs, the start box and the Conversations list;
- the review queue;
- the market rows, Add a market and the Respond actions;
- Submission Center opened on a market and a sequence;
- from a sequence: Assemble, Freeze, Dispatch, Transmit, Transmissions, and Compile and download.

**No rail entry.** These are reached from the tab that owns them, and also from ⌘K and the Apps catalog:
- From Author: `document-authoring`, `protocol-dev`.
- From Review: `review`.
- From Submit: `ectd-compile`, `gateway-transmittals` (as a log), and `dispatch-readiness` (the same market list, full page).

**Cross-project views:**
- **Projects:** the portfolio.
- **Submission Center** with no project open, or its "All projects" toggle (slice 24): the organisation's submissions. A row opens its project's Submit tab.
- **My work:** the signed-in person's tasks.
- **Quality:** SOPs and change control, which are organisation-level (PF-16). Product quality records keyed to a project come later.
- **Reporting & analytics:** the portfolio. It reports on the organisation's lead program, not the open project (`surfaces/Insights.tsx:1094`). A per-project report comes later.
- **Audit trail:** from record views.
- **Settings:** the account menu.
- **Vault** is per project. With no project open it shows "Open a project to see its vault" and nothing to click (`Vault.tsx:1472`). F16 adds an "Open a project" button.

---

## 5. What each current app becomes

| Today | Becomes | Where, and what replaces it |
|---|---|---|
| `projects` | Cross-project view | The portfolio; it opens a filing |
| `project-home` | The filing | Five tabs (F2) |
| `conversation-thread` | AnA: the one conversation | Canvas on the right; unchanged |
| `home` | Start page | Its composer seeds a conversation; unchanged here |
| `tasks` (My work) | Cross-project view | Rail, `mine` filter. The project no longer sends people to the `task-board` alias (F7) |
| `vault` | Evidence feature | The rail opens the open project's vault, or "Open a project" (F16) |
| `artifacts-center` | Coming out (ONE_ANA slice 25) | Canvas Documents list (`editor/CanvasDocumentList.tsx`). Until then, reached from Live Drive and ⌘K. Removed from the project grid (F3) |
| `document-authoring` | Author feature | The canvas at full width, with no AnA pane of its own (F5) |
| `review` | Review feature | The project review queue (F7), and the board with the program filter on |
| `protocol-dev` | Author feature, organisation-wide | Listed on Author; no program key (PF-14) |
| `submission-center` | Submit working view; cross-project index when no project is open | Opens on a market and a sequence (F10) |
| `ectd-compile` | Submit feature, from the sequence | "Compile and download" on the Dispatch tab, carrying the sequence (F14) |
| `gateway-transmittals` | Cross-project transmittal log | Each market's transmissions sit inside its Dispatch tab (F13). The package-transmit form is no longer linked; it is locked after LX-13 (F12) |
| `dispatch-readiness` | Submit feature | Renders the same market list as the Submit tab (F9, F18). Kept as the Submission Readiness catalog entry |
| `quality` | Cross-project view | Rail; unchanged |
| `insights` | Cross-project view | The composer becomes "Find a report" (F6) |
| `compliance-reports` | Cross-project view | Reached from Reporting |
| Project Workspace grid | Removed | Each item is reached from the tab that owns it (F3) |
| Project "Recent drafts" | Removed | Author Documents list (F3) |
| Project Plan tab and `SchedulePanel` | Removed | Add a market and the Planner on Submit, plus a coming-later line (F2). The panel never loads for a program |
| Project Lifecycle tab | Removed | Follow-up sequences on each market row (F2) |
| Cross-region tab, its route and the AnA tool `cross_region_gap_analysis` | Removed | The Planner, over the deterministic engine (F21) |
| The editor's own AnA pane | Removed | The one conversation, with the document in its canvas (F5) |
| Top-bar "Switch client domain" | Removed | Client type in the account menu (2A); the project chip takes its place (F8) |
| `ectd-coauthor` (locked) | Scrapped | The Builder points to Place into filing and the Vault (F16) |
| `haq-manager`, `agency-meetings`, `global-ri`, `precedent-intelligence` | Coming later | Named on the Respond and Submit coming-later lines |
| `registrations`, `market-access`, `safety-narrative`, `ind-checklist`, `ind-lifecycle` | Coming later | Named on the market row's coming-later line |
| Device surfaces (`device-510k`, …) | Coming later | The device market row says so; the 510(k) button is gated on availability (F16) |

---

## 6. Breaks on the filing path today

| # | Break | Where | Fixed by |
|---|---|---|---|
| 1 | Section status never leaves `todo` for editor work, so Module completion, Recent drafts and `c2c_documents.readiness` read zero (by reading; not run on a database) | `commit-section-to-filing.ts:241-251` updates content only; scaffold writes `'todo'` (`scaffold-project-documents.ts:184`); `/workstreams` counts status (`projects.ts:1048-1055`); `/drafts` filters `!= 'todo'` (`:1095`) | F1 |
| 2 | The old-store PATCH accepts `approved` with only a reason, no signature | `server/routes/c2c/documents.ts:486-500` | F1 |
| 3 | The Review tab is a dead end that sends people to the scrapped `task-board` alias | `ProjectHome.tsx:1890-1902` | F7 |
| 4 | Document jumps on the project page open the editor without the document | `ProjectHome.tsx:947`, `:1421`, `:1537`, `:1552` | F3 |
| 5 | "Every capability, scoped to this project" launches organisation-level apps | `ProjectHome.tsx:1342-1369` | F3 |
| 6 | Three intake doors; the data room is under Author | `ProjectHome.tsx:1435` | F3 |
| 7 | An unstarted required section only toasts | `DocumentWorkbench.tsx:3430` | F4 |
| 8 | The editor has its own AnA | `DocumentWorkbench.tsx:1032`, `:1421`, `:4532` | F5 |
| 9 | Reporting's chat look-alike, answered by a fixed router under an AnA mark | `Insights.tsx:1334`, `roRouteReply` `:492` | F6 |
| 10 | No screen names the open project; two controls set the client type | `Shell.tsx:503-515`, `:518-545` vs `:404` | F8 |
| 11 | Plan and Lifecycle show "Not in this release" with no button | `ProjectHome.tsx:522-548`; `fixtures/project-home-data.tsx:295-309` | F2 |
| 12 | Submit shows one verdict per project | `programSequence.ts:261-269` | F9 |
| 13 | "Open in Submission Center" after placing carries nothing | `AuthoringPlaceIntoFiling.tsx:387` | F10 |
| 14 | Assemble and sequence transmit have no client caller; Dispatch offers a sentence | `submissions.ts:1620`, `:1762`; `SubmissionSeqWorkspaces.tsx:1436-1441` | F11, F12 |
| 15 | Transmit lives on a different store (packages) from the sequence that was built | `GatewayTransmittals.tsx:466`, `:655` | F12 + LX-13 |
| 16 | Compile reaches one submission per project, FDA/EMA only | `server/services/cmc/submission-spine.ts:103-121`; `EctdCompile.tsx:825` | F14 |
| 17 | Respond opens the editor with no letter | `fixtures/project-home-data.tsx:300-304` | F15 |
| 18 | Exits that land on locked screens or show nothing to click | `SubmissionCenter.tsx:1318` (510(k)); `Vault.tsx:1309` (eTMF); `Vault.tsx:1472`; `LaunchScopeGate.tsx` has no button; the Builder points to the locked Co-Author (`SubmissionSeqWorkspaces.tsx:389`) | F16 |
| 19 | The filing-copy status is fixed at placement; nothing says so | `coauthor-snapshot.ts:105-107`; `AuthoringPlaceIntoFiling.tsx:242` | F17 |
| 20 | Readiness "Fix" and "Prepare governed transmit" send chat text | `DispatchReadiness.tsx:363`, `:389-398` | F18 |
| 21 | The resolver calls EMA and PMDA buildable | `submission-resolver.ts:237` | F19 |
| 22 | New submission defaults to IND / FDA / biotech | `SubmissionCenter.tsx:1121`, `:1126`, `:1136` | F20 |
| 23 | The cross-region model answer renders as a verdict ("No Module 1 deltas reported"), with targets hard-coded (Rule 2) | `SubmissionSeqWorkspaces.tsx:1083-1195`, `:1092`, `:1175`; `submissions.ts:1055` | F21 |
| 24 | The Planner engine substitutes a proxy region's sections | `submission-structure.ts:196-215` | F21 |
| 25 | A second market gets no Module 1 outline; `target_agencies` is never edited | `useFilingOutline.ts:175`; `scaffold-project-documents.ts:121`, `:161`; `projects.ts:763` | F22 |
| 26 | Three readiness figures disagree | `c2c_documents.readiness` trigger; `/workstreams` weighting (`projects.ts:1053-1055`); `ectd-compile` `/status`. `GET /:id/vault-structure` (`projects.ts:1613`) has no client caller | F23 |
| 27 | The decision record says compile and transmit are reached from the sequence; they are not | `docs/SURFACE_DECISIONS_2026-10-08.md:106-107` | F24 |

Two corrections to the readers:
- **Compile and readiness links.** The Workspace grid currently links to `ectd-compile` and `dispatch-readiness` (`registryModel.ts:694`, `:723`). So F3 must add their replacement doors in the same change.
- **Respond.** Respond is not a "Not in this release" stage today; only Plan and Lifecycle are.

---

## 7. Slices in order

### 7.1 Landed and in flight

| Work | Commit | State | Fits the spine? | What it must change |
|---|---|---|---|---|
| Wave 2A: nav lists the places | `9a94754c6` | Landed | Yes | Nothing. The top-bar switcher it left goes in F8 |
| Wave 2B: canvas documents, download | `e76ae571c` | Landed | Yes | Nothing. F3 reuses its list |
| Wave 2C: send for review | `9018545a1`, `71492adc0` | Landed | Yes | Nothing. F7 shows what it sends |
| Slice 23: project files on Evidence | `7a6edef06` | Landed | Yes | Nothing. The documents half is F3 |
| ana-12: start box | `d210bbe36` | Landed | Yes | It moves above the tabs (F2) |
| Slice 24: project readiness and submissions | `b1d7d85ec` | Landed | Yes | One verdict per project becomes one row per market (F9). Its components are generalised, not rebuilt, and its tests are re-pointed, not deleted. The "Open readiness" link (`ProjectHome.tsx:416`) is retargeted in F10 |
| ana-14: AnA reads its project | `427775e54` | Landed | Yes | Nothing |
| 2D: review loop | Working tree | In flight | Yes | Nothing. F1 and F7 wait for its commit (it edits `authoring.router.ts` and the review-board tests) |
| F0: filing-path reachability gate | The commit that adds `tests/ui/filing-path-reachability.test.ts` | Landed 2026-10-08 | Yes | Each of F3, F4, F7, F10, F12 and F15 removes its hop from `tests/ui/filing-path-reachability.baseline.json` in the same change; the test fails until it does. Evidence: `docs/evidence/D2-ONE-ANA/2026-10-08/f0-filing-path-reachability/` |
| F2: five tabs; start box above them | The commit that adds `__tests__/projectHomeStages.test.tsx` | Landed 2026-10-08 | Yes | Nothing. F15 replaces Respond's tool list; F21 and F22 put the Planner and Add a market on Submit. Evidence: `docs/evidence/D2-ONE-ANA/2026-10-08/f2-five-tabs/` |
| F16: no dead ends on the filing path | The commit that adds `__tests__/filingPathNoDeadEnds.test.tsx` | Landed 2026-10-08 | Yes | Nothing. Doors on launch screens ask `surfaceAvailable.ts`. Evidence: `docs/evidence/D2-ONE-ANA/2026-10-08/f16-no-dead-ends/` |
| F17: placement states the filing copy's status | The commit that adds `__tests__/placeIntoFilingApprovalState.test.tsx` | Landed 2026-10-08 | Yes | Nothing. The copy-status rule lives in `shared/regulatory/filing-copy-status.ts`. Re-place from the Builder's rows needs a leaf's link to its authoring source (as F18 does). Evidence: `docs/evidence/D2-ONE-ANA/2026-10-08/f17-filing-copy-status/` |
| F19: each market states what the platform can carry | The commit that adds `server/services/regulatory/market-support.ts` | Landed 2026-10-08 | Yes | F9's market rows reuse `MarketSupportLine`; F20's region options use `useMarketSupport`. The New project picker shows the line for the chosen filing, not on all 234 entries. Evidence: `docs/evidence/D2-ONE-ANA/2026-10-08/f19-market-support/` |
| F20: New submission takes the project's filing | The commit that adds `surfaces/NewSubmissionForm.tsx` | Landed 2026-10-08 | Yes | Nothing. Region options carry F19's statement for the chosen type. Evidence: `docs/evidence/D2-ONE-ANA/2026-10-08/f20-new-submission-from-project/` |
| F21 (part): the Cross-region model verdict goes | The commit that adds `server/services/ana/__tests__/cross-region-retired.test.ts` | Landed 2026-10-08 | Yes | The Planner's multi-region compare is not built: the proposed `WORKFLOW_DECISION_2026-10-08.md` defers F21–F23 until after D10. Evidence: `docs/evidence/D2-ONE-ANA/2026-10-08/f21-cross-region-retired/` |

### 7.2 New slices

The first eight slices make the founder's path coherent, with one AnA, from opening the project to sign-off. The next eight join the filing end of the path. The rest add the second market.

Every slice files its red run, then its green run, under `docs/evidence/D2-ONE-ANA/`. F11–F14 also file under D7/D10.

**F0. Filing-path reachability gate. S.**
- **Files:**
  - `tests/ui/filing-path-reachability.test.ts` (new)
  - `tests/ui/filing-path-reachability.baseline.json` (new)
- **Fails first.** The test asserts an in-product control for each of six hops. All six are red today:

  | Hop | Red today because |
  |---|---|
  | Review tab → document | `ProjectHome.tsx:1899` |
  | Unstarted outline node → started section | `DocumentWorkbench.tsx:3430` |
  | Market row → its sequence | `AuthoringPlaceIntoFiling.tsx:387` |
  | Dispatched sequence → Transmit | No caller of `/sequences/:seqId/transmit` |
  | Respond → response sequence | No such control |
  | Author document row → that document | `ProjectHome.tsx:1552` |

  The baseline count may only fall.
- **Depends on:** none.

**F1. Section status follows the governed work. M.**
- **Files:**
  - `server/services/c2c/commit-section-to-filing.ts:241-251`: set `drafted` when the status is `todo` and the new content is non-empty, in the same UPDATE.
  - `server/routes/authoring.router.ts`: the approvals at `/docs/:docId/e-sign` (`:4543`) and `/docs/:docId/sign` (`:6409`) move the bound sections that have content to `approved`, in the same transaction, recorded with `recordGovernedAction`.
  - `server/routes/c2c/documents.ts:471-560`: refuse `approved` and `locked` with 409 `APPROVAL_REQUIRES_SIGNATURE`.
- **Fails first:** `server/services/c2c/__tests__/node-status-follows-work.pglite.test.ts`:
  1. A save on a bound document leaves the section `drafted`. Red: it stays `todo`.
  2. After the approval signature, the sections are `approved` and readiness is above 0. Red: unchanged.
  3. PATCH with `approved` returns 409. Red: 200.
- **Depends on:**
  - The 2D commit.
  - Confirm whether any launch screen still calls `client/src/concept2cure/mdx/hooks/useSectionSave.ts`.
  - A D5 evidence row and an OQ case.

**F2. Five tabs; the start box above them. S.**
- **Files:**
  - `fixtures/project-home-data.tsx:284-309`
  - `surfaces/ProjectHome.tsx`: stage switch at `:1867-1945`; `SchedulePanel` at `:1013-1110`
  - `shared/navigation/surface-actions.ts:483`: aliases
- **Fails first:** `__tests__/projectHomeStages.test.tsx` checks:
  - The tabs are exactly Evidence, Author, Review, Submit and Respond.
  - No tab renders "Not in this release".
  - `set-stage {stage:'plan'}` opens Submit.
  - A message typed in the start box survives switching tabs.
  
  Red: seven tabs, and the start box sits inside Author.
- **The commit carries:**
  - the `git log --all --diff-filter=D` search;
  - the reading that `SchedulePanel` never loads for a program.

**F3. Author holds the project's documents; Evidence holds intake. M.**
- **Files:**
  - `ProjectHome.tsx`: delete the grid at `:1342-1369`; replace Recent drafts at `:1528-1560` with `ProjectDocuments`, built on `editor/CanvasDocumentList.tsx`; module rows at `:1421`; move `DataRoom` from `:1435` to Evidence; change `:947` to pin-and-ask.
  - `fixtures/project-home-data.tsx:286`: the blurb.
  - Submit gains a "Compile and download" link, gated on availability.
- **Fails first:** `__tests__/projectHomeDocuments.test.tsx` checks:
  - No text "Every capability, scoped to this project".
  - A document row calls `setEditorTarget({docId, programId})`.
  - Evidence has "Data room" and Author does not.
  - "Write from these sources" never opens `document-authoring`.
  - A failed read shows an error with a retry.
  
  `ci:surface-discoverability` stays green. The commit names each grid item's replacement.
- **Depends on:** F2.

**F4. An unstarted section can be started. S.**
- **Files:**
  - `editor/DocumentWorkbench.tsx:3425-3431`: create the section with `POST /api/authoring/sections` (`authoring.router.ts:1784`), as `surfaces/AuthoringCreateExport.tsx:202` does, then open it. A refusal is shown verbatim.
- **Fails first:** `editor/__tests__/outlineStartsSection.test.tsx`: clicking unbound node `2.5` posts code `2.5`. Red: a toast.
- **Depends on:** none. It shares a file with F5, so do not run them in parallel.

**F5. One AnA while editing. M.**
- **Files:**
  - `DocumentWorkbench.tsx`: the default at `:1032` becomes null; remove the `useAnaChat` at `:1421` when the editor is not embedded; remove the pane from `:4532`; the button becomes "Work on this with AnA".
  - `ConversationThread.tsx`: accept an `openDoc` on arrival and call `openFromList` (`:1212`) once.
- **Fails first:** `__tests__/editorOneAna.test.tsx` checks:
  - The editor has no AnA textbox or message list.
  - The button mounts the conversation with that document in the canvas and an unsent prefill.
  - A governed command's §11.50 sign-off renders in the conversation.
  
  Red: the pane opens by default.
- **Depends on:**
  - Coordination with the build-with-AnA lane (`docs/work-orders/README.md:70`) and ONE_ANA slices 15/16.
  - `scripts/ci/check-canvas-path.mjs` stays green.

**F6. Reporting: "Find a report". S.**
- **Files:**
  - `surfaces/Insights.tsx:1334`: the composer becomes a labelled field with no AnA mark and no chat bubbles. `roRouteReply` (`:492`) stays as its router.
- **Fails first:** `__tests__/insightsNoChatLookalike.test.tsx`. Red today.
- **Depends on:** none.

**F7. The Review tab shows this filing's reviews. S.**
- **Files:**
  - `ProjectHome.tsx:1890-1902`
  - `Review.tsx`: reuse `openReviewDocument` (`:159`) and `REVIEW_STATUS_LABEL` (`:79`); take an `onlyProgram` nav param.
- **Fails first:** `__tests__/projectHomeReviewStage.test.tsx` checks:
  - It requests `/api/review/board?scope=all&programId=<PID>`.
  - It shows "Changes requested".
  - "Open document" targets that document id.
  - A 500 shows an error with a retry, never an empty list.
  - There is no "aren't wired" text and no navigation to `task-board`.
- **Depends on:** the 2D commit.

**F8. The open project is named in the top bar. S.**
- **Files:** `Shell.tsx:518-545` becomes a chip from `useShellProject` (`shellProject.ts`).
- **Fails first:** `__tests__/topBarProject.test.tsx` checks:
  - On Vault with a project open, the chip "ONC-221" opens `project-home`.
  - No element is titled "Switch client domain".
  
  Red: `Shell.tsx:524`.
- **Depends on:** none.

**F9. Submit: one row per market, each with its own server verdict; the header status line. M.**
- **Files:**
  - `surfaces/programSequence.ts`: add `useProgramMarkets` (list submissions → latest sequence of each → its verdict). Keep `useProgramSequence`.
  - New `surfaces/ProjectMarkets.tsx`, generalised from `ProjectHome.tsx:407-520`.
  - The header line in `ProjectHome.tsx`.
- **Fails first:** `__tests__/projectMarkets.test.tsx` mocks an IND/FDA market whose sequence 0000 is blocked by 2 blockers, and an MAA/EMA market with no sequence. It expects:
  - "Dispatch blocked · 2 blockers" and "No sequence yet";
  - a 500 on one verdict to show "No verdict" with a retry on that row only;
  - the header to show both verdicts and the count in review.
  
  Extend `projectHomeSubmitStage.test.tsx`; do not delete it.
- **Depends on:** F2.

**F10. Submission Center opens on the market and sequence. S.**
- **Files:**
  - `SubmissionCenter.tsx`: `consumeNavParams('submission-center')` sets the submission, sequence and tab.
  - `AuthoringPlaceIntoFiling.tsx:381-392`: stash `{submissionId, sequenceId, ws:'builder'}`.
  - The `ProjectMarkets` row.
  - "Open readiness" (`ProjectHome.tsx:416`) becomes Validation on the gated sequence.
  - The Dispatch tab gains "Assemble a test package": `POST /api/submissions/sequences/:seqId/assemble`, results shown verbatim; a 422 shows the server's words.
- **Fails first:**
  - `__tests__/submissionCenterOpensOnSequence.test.tsx`: after placing into sequence 7, "Open in Submission Center" lands on sequence 7 in the Builder. Red: `:387` carries nothing.
  - `__tests__/sequenceAssembleDryRun.test.tsx`. Red: no caller.
- **Depends on:** F9.

**F11. (Merged into F10.)** The assemble dry run ships with F10 so that the Dispatch tab gains its first real control in one change.

**F12. Transmit from the dispatched sequence. M.**
- **Files:**
  - `SubmissionCenter.tsx`: the flow kind at `:554` and `runGoverned` at `:701` gain `transmit`. Sign with intent `transmit` on `ectd-sequence:<id>`, then `POST /sequences/:id/transmit` with `{signatureActionId, environment, applicationId}`. With no application number, the control says why and does nothing.
  - `SubmissionSeqWorkspaces.tsx:1436-1441`.
- **Fails first:** `__tests__/sequenceTransmit.test.tsx` checks:
  - Sign, then transmit, in that order.
  - `{transmitted:false, reason:'gateway_not_configured'}` reads "Not sent: …", with no success message.
  - A 409 is shown verbatim.
  
  Red: no caller.
- **Depends on:**
  - F10.
  - Founder question 1 (LX-13).
  - Reconciling with the package-spine lane (`docs/work-orders/README.md:73`) and the IND demo lane (`:61`).
  - AnA's `transmit_submission` tool still points at the package spine (`server/services/ana/AnaToolExecutor.ts:9200`, per review). Repoint it in the same change.

**F13. Transmissions and acknowledgements inside the Dispatch tab. S.**
- **Files:** `SubmissionSeqWorkspaces.tsx`, the Dispatch workspace.
- **Fails first:** `__tests__/dossierTransmissions.test.tsx`: lists `GET /api/mdx/gateways/transmittals?program_id=&region=` with status, id, acknowledgement time and sender. A failed read is an error, not "none sent".
- **Depends on:** F12.

**F14. Compile carries the sequence. M.**
- **Files:**
  - `server/routes/ectd-compile.ts:480-525`: accept a `sequenceId` owned by the program; otherwise use the existing spine rule.
  - `EctdCompile.tsx`: take the nav param; the region list at `:825` gives way to the sequence's recorded region.
- **Fails first:** `server/routes/__tests__/ectd-compile-sequence.test.ts`:
  - The MAA sequence id compiles the MAA. Red: the spine matches on application type.
  - Another program's sequence returns 404.
- **Depends on:** F10. Needed before a second-market beta client, not for the US D7 path.

**F15. Respond answers the agency. S.**
- **Files:**
  - `ProjectHome.tsx`: the respond branch, reusing the data-room upload and `C2C_SOURCE_PINS`.
  - `fixtures/project-home-data.tsx:300-304`.
  - `SubmissionCenter.tsx`: read a `followUp` param (`:294`, `:319`).
- **Fails first:** `__tests__/projectRespondStage.test.tsx` checks:
  - The three actions are present.
  - "Start a response sequence" opens `{submissionId, ws:'sequences', followUp:'response'}`.
  - The text "Question-by-question tracking comes later" is shown.
- **Depends on:** F3, F10.

**F16. No dead ends on the filing path. S.**
- **Files:**
  - `SubmissionCenter.tsx:1318` and `Vault.tsx:1309`: gated on availability.
  - `Vault.tsx:1472`: an "Open a project" button.
  - `SubmissionSeqWorkspaces.tsx:389`: points to Place into filing and the Vault, and says that copying across markets comes later.
  - `LaunchScopeGate.tsx`: one button back to Projects.
- **Fails first:** `__tests__/filingPathNoDeadEnds.test.tsx`. Red on all of them.
- **Depends on:** none.

**F17. Placement states the filing copy's status. S.**
- **Files:** `AuthoringPlaceIntoFiling.tsx:200-260`.
  - Before placing a non-approved document, say: "Filed as draft. Freeze will refuse it until you re-place it after approval."
  - On a leaf whose source is now approved, offer "Re-place approved version", which writes a new copy into the same leaf through `PUT /sequences/:seqId/leaves`.
- **Fails first:** `__tests__/placeIntoFilingApprovalState.test.tsx`. Red.
- **Depends on:** none. Unverified: which field the dialog reads for the source's state.

**F18. Readiness is one list, and its buttons do the job. S.**
- **Files:** `DispatchReadiness.tsx`.
  - It renders `ProjectMarkets`.
  - "Fix" (`:363`) opens the Builder at that code through F10.
  - "Prepare governed transmit" (`:389-398`) opens the Dispatch tab.
- **Fails first:** `__tests__/dispatchReadinessActs.test.tsx`: no call to `ask()`. Red.
- **Depends on:** F9, F10. Opening the source document straight from a finding needs the leaf's link back to its source, which is unverified, so that is not promised.

**F19. Each market states what the platform can carry. M.**
- **Files:**
  - New `server/services/regulatory/market-support.ts`, composing `document-class.ts` and the rule packs, `REGION_MAP`, `classifyRegionalBackbone`, and the submittability channel plus the adapter's refusal.
  - One GET route.
  - `submission-resolver.ts:237` reads it.
  - Rendered on market rows and in `AnaVerbs.tsx` `RegistryPicker`.
- **Fails first:** `server/services/regulatory/__tests__/market-support.test.ts` expects:

  | Input | Expected |
  |---|---|
  | `('maa','EMA')` | Flat Module 1, no channel |
  | `('nda','FDA')` | Structured Module 1 |
  | `('nds','Health_Canada')` | No outline, no channel |
  | `('nda','ANVISA')` | Unmapped |

  The resolver must no longer report EMA or PMDA as buildable. Red: the module is absent, and the resolver reads `:237`.
- **Depends on:** none. Check `server/services/ana-ri/workflow-orchestration.ts` first, because it also reads submittability.

**F20. New submission takes the project's filing. S.**
- **Files:** `SubmissionCenter.tsx:1121`, `:1126`, `:1136`. The defaults come from the open project's `program_type` and `primary_agency`. If that market already exists, no region is preselected. Each region option carries its F19 line.
- **Fails first:** `__tests__/submissionCenterNewFromProject.test.tsx`. Red: hard-coded `ind`, `fda`, `biotech`.
- **Depends on:** F19.

**F21. The Planner reads the engine; Cross-region goes. M.**
- **Files:**
  - The Planner (`SubmissionCenter.tsx:1333`) calls `POST /api/submissions/:id/plan` with the primary region plus any "Compare with" picks.
    - A proxied region renders "No rule data for \<agency\>".
    - The narrative is labelled as a model narrative.
  - Remove `cross-region` from:
    - `shared/types/submission-ui.ts`
    - the `surface-actions.ts` enum
    - `PER_SEQ_WS` (`:395`) and the render at `:1559`
    - `CrossRegionWorkspace` (`SubmissionSeqWorkspaces.tsx:1083-1195`)
  - Retire in the same commit:
    - `POST /:id/cross-region` (`submissions.ts:1055`)
    - `computeCrossRegionGap`
    - the AnA tool `cross_region_gap_analysis` (`server/services/ana/submission-center-tool-defs.ts`, `tool-authorization.register.json`)
- **Fails first:** `__tests__/plannerComparesRegions.test.tsx` checks:
  - There is no `cross-region` workspace.
  - `fda` plus `eu` gives two region blocks.
  - `ca` gives "No rule data for Health Canada" and no sections.
  - The client bundle contains no "No Module 1 deltas reported".
- **Depends on:** F19.

**F22. Add a market. L.**
- **Files:**
  - `server/routes/c2c/projects.ts`: new `POST /:id/markets {agency, applicationType, reason}`. In one transaction it:
    - appends to `target_agencies`;
    - scaffolds only the pack's Module 1 subtree and 3.2.R (`scaffold-project-documents.ts`, idempotent per `(doc_type, agency)`);
    - creates the anchored submission (`server/routes/c2c/project-intake.ts:118-170`);
    - records the governed action.
  - It refuses `NO_RULE_PACK`, `UNMAPPED_PROGRAM_TYPE`, MHRA "IND" and device programs, each with the reason. A repeat returns 409.
  - Required keys missing from the home tree become gap rows.
  - `server/services/c2c/governed-document-binding.ts`: Module 1 and 3.2.R sections bind to their market's document, and a section in the wrong scope is refused.
  - `useFilingOutline.ts:175`: common nodes come from the home document; Module 1 comes from the market's document.
  - Add a market, and New submission inside a project, both call this route.
- **Fails first:**
  - `server/routes/c2c/__tests__/projects-add-market.pglite.test.ts`: adding EMA MAA to an NDA/FDA project creates exactly the MAA Module 1 subtree plus 3.2.R (the count is read from the pack) and an EU submission. Health Canada returns 422.
  - `__tests__/filingOutlinePerMarket.test.tsx`.
  
  Red: the route is absent, and the scaffold refuses a second document.
- **Depends on:** F19, F20.

**F23. One source for readiness and module counts. M.**
- **Files:**
  - New `server/services/c2c/dossier-read.ts`, extracted from `GET /:id/vault-structure` (`projects.ts:1613-1715`, no client caller). It adds per-market placement by `normalizeCtdCode` (`shared/regulatory/section-code.ts`).
  - Module completion and the header read it. The `/workstreams` weighting is retired.
  - `ectd-compile` `/status` (`server/routes/ectd-compile.ts:1228`) reads it, or its figure is not shown on the filing path.
  - A store that cannot be read is listed as unavailable, never as empty.
- **Fails first:** `server/routes/c2c/__tests__/projects-dossier.test.ts`. Red: the route returns 404.
- **Depends on:** F1, F22.

**F24. Write the decision down. S.**
- **Files:**
  - `docs/SURFACE_DECISIONS_2026-10-08.md:106-108`: correct it after F12 and F14 land, and record the Cross-region scrap and the five tabs.
  - `docs/design/ONE_ANA_ONE_CANVAS.md`: mark the project-page stage strip as superseded.
  - `docs/work-orders/README.md`: the D2 row.
  - New `docs/design/FILING_SPINE.md`.
  - The pointer in `CLAUDE.md` (`:165-166`) to the superseded `ANA_DOCUMENT_CANVAS.md` is a founder edit.
- **Fails first:** not applicable; this is a record. The reachability it describes is enforced by F0.
- **Depends on:** F12, F14.

---

## 8. Risks and what is not decided

### Questions only you can answer

1. **Transmit spine (LX-13).** I decided on your behalf that transmit runs on the sequence the person built. That is the recommendation in `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md:172`. Two claimed lanes build on the package store instead (`docs/work-orders/README.md:61`, `:73`).
   - If you confirm: the package lane stops, and its transmit form is locked once the filed history converges.
   - If you reverse: F12 is dropped.
2. **What we sell now.** One US drug filing end to end, with transmit wired but not proven until D7. Every other market reads "build and check; applicant uploads". Is that the pitch to beta clients and investors? Should the New project picker stop offering filings with no path, rather than only labelling them? That would cover device programs past authoring, MHRA "IND", and agencies with no rule pack.
3. **Submission Readiness.** CLAUDE.md Rule 2 and row D2 name it as a launch app. In this design it is a view of the Submit tab. Keep the name as a catalog and entitlement entry only, or restate D2 as a capability?
4. **US post-approval changes.** There is no supplement type (PAS, CBE-30, CBE-0) and no Japanese partial-change type. Each needs regulatory content, not just a button. Add them before beta, or tell marketed-product clients "coming later"?
5. **Model qualification.** Governed drafting is refused in production until a model passes PQ, and the launch definition says 0 of 4 have. The Author demo depends on it. Run PQ before beta, or demo on staging and say so?

### Risks

- **F1 is a Part 11 change.** It moves what sets `approved` onto the signature transaction. It needs an OQ case and an updated D5 row. Refusing `approved` over PATCH may break an old-store caller, so check first.
- **Work in flight.** 2D is editing `authoring.router.ts`, the review-board tests, `AssignReviewDialog.tsx`, `SendForReviewDialog.tsx` and `TaskBoard.tsx`. F1 and F7 wait for it. Line numbers in those files will move.
- **No gateway is proven (D7).** Transmit will say "Not sent" in every organisation. The Health Canada adapter posts to an endpoint written from no agency source. The agency channel facts in section 3 are regulatory practice, not checked against agency documents.
- **Shadow review may put a model in the gate.** Shadow review feeds the dispatch gate (`shadowPresence`, `server/services/ectd/assess-dispatch-readiness.ts:120`). Whether its findings are made by a model is unverified. If they are, a model output gates dispatch, which breaks Rule 2.
- **Placing one source document into several markets.** Its pinning rules (`dispatch-readiness.ts:343-356`, content not pinned or mismatched) are unverified for that case. F22's binding rules must refuse a section placed in the wrong market, never file it there.
- **Project scoping gaps that stay:**
  - My work is not filtered by project (integer `projects.id`; ADR-0011 is Proposed and its number collides).
  - Protocols are keyed by organisation (PF-14 open).
  - QMS product records have no project (PF-16 unbuilt).
  - Reporting reports on the lead program, not the open one.

  Each must say so on screen in one line.
- **Records disagree.** PF-10 records your decision to fork the conversation on a project switch, but slice 5 landed as a refusal (`054f31081`). `ANA_DOCUMENT_CANVAS.md` still calls itself binding although `ONE_ANA_ONE_CANVAS.md:67` supersedes it.
- **Outside this plan, and must not be undone:**
  - Live Drive's jump to Artifacts Center (`V2App.tsx:640-641`, ONE_ANA slice 25).
  - The conversation's private chat (`ConversationThread.tsx:1001`, ONE_ANA slice 10).
- **Smaller risks:**
  - F9 makes one request per market; that is fine for one to five markets.
  - The `set-stage` aliases must stay, or AnA calls that name `plan` or `lifecycle` break.
  - F5 and F17 touch the path that `scripts/ci/check-canvas-path.mjs` pins, so that gate must stay green.
