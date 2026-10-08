# Before: what the founder saw on 2026-10-07

Captured in a real browser against the real server, client and database; AnA's replies came from a stand-in model (no AI key in that environment), labelled "STAND-IN" on screen. Red boxes mark every AnA entry point. These are the "before" for `docs/design/ONE_ANA_ONE_CANVAS.md`.

I captured the live app in a real browser and saved 20 screens. At 1440x900 the founder sees up to three AnA chat boxes at once. A document AnA drafts appears as a card in the middle of the conversation, not on the right. The editor opens on the right only after "Open full editor" is clicked.

**How it ran.** The server, client, database and the AnA tool were real; only AnA's replies were scripted.
- **Database:** I created `c2c_ui_screens` with pgvector. `install-fresh.mjs` exited 0, `deploy-migrate.mjs` exited 0 ("safe to roll services"), and `seed-ga-demo.mjs` exited 0 with one module skipped (124-investigator-brochure).
- **Server:** `npx tsx server/index.ts` with `NODE_ENV=development PORT=5077 ALLOW_DEV_AUTH=1 LAUNCH_SCOPE_ENFORCE=on`. Signed in as `jm.smith@concept2cure.pro` ("Dev mode — MFA skipped"). Open project: Vorelinib · KIT-mutant GIST (IND), BX-512.
- **AnA replies:** `ANTHROPIC_API_KEY` is empty in `.env`, so a scripted stand-in model answered. It is adapted from `docs/evidence/ANA-AGENTS/2026-09-27/E2E-stand-in/harness/stand-in-e2e.mjs` and labels every reply "STAND-IN". The `draft_authoring_document` tool, its approval prompt ("Confirm and run", which I clicked) and the stored document were real.
- **"Memory: Could not be read"** comes from this environment: there is no OpenAI key, and the ANA-AGENTS README gives the same cause.
- **Not investigated:** the warning "Some project context could not be loaded" appeared on every reply; I did not find its cause.
- **Cleanup:** every process I started is stopped (port 5077 returns 000). `git status` is clean at `19fdc82c4`. The `c2c_ui_screens` database is still in the local cluster.

Each screen has a plain `.png`, a `.marked.png` with numbered red boxes on every AnA entry point, and for some a `.tall.marked.png` at 1440x2400 showing what is below the fold. The per-element list with pixel boxes is in `inventory.json`.

## Live screenshots
All files are in this folder (the marked screenshots of the key screens).

- **`01-home`**: greeting, a project card, and the main composer "How can I help you today? Type @ to name an app." (`Surfaces.tsx:269`). At the far right edge is a collapsed "✻ ANA" tab that opens the right rail (`Shell.tsx:829-832`). The speech-bubble icon in the header is "Collaborate", which messages a colleague, not AnA (`Shell.tsx:536-543`).
- **`02-home-rail-open`**: after clicking the tab, the right rail "AnA — Co-Author" opens with its own composer "Describe a task for AnA to carry out…" (`Shell.tsx:1232`). Two AnA chat boxes are now on one screen, centre and right.
- **`03-projects`**: an "Ask AnA" button at top right (`Projects.tsx:1223`) plus the rail tab.
- **`04-project-home`, `04b`, `04c`**:
  - The middle of the page holds a third chat panel, "AnA · co-author", with an "Open full thread" link (`ProjectHome.tsx:915-933`).
  - Its composer "Message AnA about Vorelinib · BX-512…" (`ProjectHome.tsx:926`) is below the fold at 1440x900. It renders only 157×42 px wide inside a roughly 1180 px panel; I saw this but did not find the cause.
  - `04c` has the rail open: two composers on screen, the project panel in the centre and the rail on the right. The rail still shows "Welcome, JM — let's get your drug program set up" with a project open.
- **`05-conversation-after-ask`**: after sending "Draft the Module 2.5 clinical overview…" from project home.
  - The conversation takes the centre.
  - The approval card "Confirm the proposed action / Cancel / Confirm and run" sits inline in the thread.
  - Three boxes for typing to AnA are on screen at once: "Reply to AnA" (`ConversationThread.tsx:1381`), "Steer this run…" (`AnaWorkSections.tsx:548`), and the drive strip's "Ask or steer AnA…" (`LiveDriveOverlay.tsx:160`), which sits over the composer controls.
  - The right column is a "Progress" step list, not a chat and not a document (`ConversationThread.tsx:1446-1449`).
  - There is no rail tab on this screen (`surfaceViews.ts:410`, `V2App.tsx:1254`). The "AnA" in the header is a plain label, not a button (`ConversationThread.tsx:1241`).
- **`06-conversation-document-card`**:
  - The drafted document appears as a card inside the centre thread, with its 4-section outline, the 2.5.1 text and "Open full editor".
  - The card also offers File to vault, Assign review, Place into filing and Edit in Authoring.
  - The right column is still Progress. No document is on the right.
- **`07-conversation-editor-beside`**:
  - After "Open full editor", the conversation shrinks to a left column of about 470 px. The card collapses to "Close the editor".
  - The real editor fills the right of about 900 px, with "Back to conversation", outline and toolbar (`ConversationThread.tsx:1435`).
  - Progress is hidden. "Ask for a source" in the toolbar asks AnA (`RichSectionEditor.tsx:2252`).
- **`08` and `14`**: a plain question answered in the conversation, the second reached from the left-nav "Conversation" entry.
- **`09-vault`**: "Ask AnA to import" (`Vault.tsx:1368`) plus the rail tab.
- **`09b-vault-rail-open-same-conversation`**: the rail on Vault shows the same question and answer that were in the centre conversation (`09b-rail.text.txt`). One chat is shown in two places: centre on the conversation screen, right rail everywhere else (shared chat at `V2App.tsx:727`; `V2App.tsx:666-676` says so).
- **`10-submission-center-rail-open` and `10b`**:
  - The rail stays open between screens because its open/closed state is saved.
  - The submission picker shows "C2C-001 IND (FDA)" while the open project is BX-512; I saw this but did not find the cause.
  - "Open the sequences" has AnA's sparkle and sits under "I can plan the sequence…", but it only switches a tab (`SubmissionCenter.tsx:970`).
- **`11-document-authoring`**:
  - The right side is the editor's own separate AnA pane, "AnA · 2.5.1", with "Ask about 2.5.1…" and Send (`DocumentWorkbench.tsx:4745`; its own chat at `:1419`).
  - It says "AnA has not started a turn in this conversation", even though AnA drafted this document in the conversation minutes earlier.
  - There is no shell rail here (`surfaceViews.ts:463`).
- **`12-ana-command`**: "Ask AnA to plan the path" (`AnaCommand.tsx:624`) plus the rail tab.
- **`13-reporting-analytics`**: a fourth chat-style pane, on the left: "Describe the report or dashboard you need for C2C-001…" (`Insights.tsx:1348`). It sends to `/api/report-os/runs` (`Insights.tsx:906`). There is no rail here (`surfaceViews.ts:493`), and the screen shows C2C-001, not the open project.
- **`15-cmdk-palette-with-question`**: the ⌘K search turns typed text into "Ask AnA: '…' — Send to gateway" (`Shell.tsx:1709`).
- **`16-tasks`**: rail tab only.
- **`17-pdev-shell`, `18-device-510k-shell`**: "not in this release" panels plus the rail tab.
- **`19-ectd-coauthor`**:
  - An AnA pane in the middle column with its own chat (`EctdCoauthor.tsx:335`).
  - Its composer (`EctdCoauthor.tsx:875`) is off-screen at 1440x900 and only visible in the tall capture, near y≈2230.
  - The screen shows the C2C-001 dossier while the open project is BX-512.
- **`20-bell-tray`**: the notification tray offers "Triage my day with AnA" (`TaskTray.tsx:228-231`).

## AnA entry points per screen (live, 1440x900)
These are present on every main-shell screen and are not repeated in the table:
- three left-nav entries, "AnA Command", "AnA memory" and "Conversation" (`registryModel.ts:110-114`);
- ⌘K "Ask AnA";
- the bell tray's "Triage my day with AnA".

"Rail tab" below is the collapsed "✻ ANA" tab at the right edge.

| Screen | Visible AnA entry points (where, what) | Chat boxes on screen |
|---|---|---|
| Home | centre: composer; right: rail tab | 1 |
| Home, rail open | centre: composer; right: rail composer and panel | 2 |
| Projects | right: "Ask AnA" button; right: rail tab | 0 |
| Project home | centre: co-author panel and "Open full thread"; centre: composer below the fold; right: rail tab | 1, after scrolling |
| Project home, rail open | centre: co-author composer; right: rail composer | 2 |
| Conversation, during a run | centre: Reply composer; centre: Steer box; centre: "Ask or steer" drive strip; right: Progress (not chat); header: plain "AnA" label | 3 |
| Conversation, document drafted | centre: Reply composer; centre: document card with "Open full editor"; right: Progress | 1 |
| Conversation, editor open | left: Reply composer; right: editor with "Back to conversation" and "Ask for a source" | 1 |
| Vault | right: "Ask AnA to import"; right: rail tab (the rail, once opened, shows the same conversation) | 0, or 1 with rail open |
| Submission Center | right: rail tab, or the open rail and its composer; centre: AnA-voiced card whose button is not AnA | 0 or 1 |
| Document authoring | right: editor's own AnA pane and composer; centre: "Ask for a source"; no shell rail | 1 (a separate chat) |
| AnA Command | centre: "Ask AnA to plan the path"; right: rail tab | 0 |
| Reporting & analytics | left: report composer; no rail | 1 (a separate service) |
| eCTD co-author | middle: AnA pane, composer below the fold; centre: "Ask for a source"; no rail | 1, off-screen |
| Tasks, PDEV, 510(k) | right: rail tab | 0 |

In code there are five separate AnA chat instances:
- the shell chat (`V2App.tsx:727`), shared by Home, Project home, the conversation screen and the right rail;
- a fallback chat inside the conversation screen (`ConversationThread.tsx:888`);
- the editor's (`DocumentWorkbench.tsx:1419`);
- the eCTD co-author's (`EctdCoauthor.tsx:335`);
- the Risk-based monitoring screen's (`Rbm.tsx:160`).

Reporting's composer is a separate report service, not one of these.

## What the code does today versus the design doc
- **Where the document goes:** the design doc says it should render "inline in the message stream" with "Open in editor" (`docs/design/ANA_DOCUMENT_CANVAS.md`, "Client contract (WN)"). The live app matches that. Neither the doc nor the code puts a document canvas on the right by default; the right column during a conversation is Progress.
- **The right-hand editor:** it exists only after "Open full editor". The D2 README (§1) says it needs a window at least 1100 px wide; below that the document takes the whole screen.
- **When the rail shows:** it is drawn on every screen except those that own their conversation: client portal, conversation, document authoring, eCTD co-author, Reporting & analytics, and Risk-based monitoring (`surfaceViews.ts:404-557`).

## Screenshots already in the repo
- **`docs/evidence/W1/2026-09-29-launch-sweep/shots/`** (commit `762d8e6e2`):
  - `home.png`: centre composer and rail tab.
  - `project-home.png`: "No project selected" and the rail tab.
  - `document-authoring.png`: the editor with its own "AnA · 7.1" pane and "Ask about 7.1…", no rail tab.
  - `vault.png`: "Ask AnA to import" and the rail tab.
  - `submission-center.png`: the AnA-voiced card and the rail tab.
- **`docs/evidence/D2-CANVAS-EDITOR/2026-10-01/screens/2-card.png` and `7-beside-after.png`** (commit `03ea3dc76`): these are not the live app. Per that README's §7 they are markup captured from a test environment with fixture data. They show the same layout I captured live.
- **`docs/evidence/ANA-AGENTS/2026-09-27/E2E-stand-in/screens/`** (commit `3e6b74b7e`):
  - `s4-auto-1-finished.png`: the conversation screen with Progress on the right and no rail tab.
  - `s4-manual-0-home-manual.png`: the Home composer and the rail tab.

Everything I used is in `(session scratchpad, not filed)`:
- `ui/` — the screenshots and `inventory.json`
- `harness/` — the stand-in model and capture scripts
- `run/` — the database-setup logs and server logs