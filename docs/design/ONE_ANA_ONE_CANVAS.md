# One AnA, one canvas

**Status: decided, 2026-10-08.** Made by the chief product officer under the founder's
delegation of 2026-10-07. Launch row **D2**, on the path row **D10** needs. Lane:
`docs/work-orders/README.md:71` (session `…01T2wooCZu46W7msw4TJuuzr`). Branch:
`concept2cure-v2` only (CLAUDE.md, Rule 0).

`docs/SURFACE_DECISIONS_2026-10-08.md` decides which screens remain places. This record
decides where AnA lives, what the canvas does, and the order of the work. It is steps 4
to 6 of that record's build order, written out as slices.

Every `file:line` below was read at `2fd174c14` on `concept2cure-v2`. A line number that
has moved since is a reason to re-read the file, not to doubt the decision. Short client
paths are relative to `client/src/concept2cure/v2/`; paths beginning `components/ana/`,
`_shared/` or `quality/` are relative to `client/src/concept2cure/`. Paths beginning
`server/`, `shared/`, `tests/`, `scripts/` or `docs/` are from the repository root.

**How it was chosen.** Three complete designs were written and scored by three judges:
founder fit, Part 11 safety, and engineering risk. Design A ("one conversation, one
canvas") won two of the three and the highest total. It is the base here. Where this
record takes an idea from design B ("beside") or design C ("Claude-faithful"), it says so.
Each judge's corrections to the designs' claims about code have been applied.

---

## 1. Decision

AnA is talked to in one place: the conversation. What AnA builds appears on the right of
that conversation, in the canvas, where the person watches it arrive, reads it, edits it,
downloads it, and takes it through review, signature, filing and placement into a
submission. Every other screen is a place to work, at full width, with no AnA column. When
a button on such a screen needs AnA, it carries the record to the conversation as an
attachment and waits for the person to press Enter. The product's functions live inside
the project's workflow and the document's lifecycle, not in separate apps; the places that
remain are those named in `docs/SURFACE_DECISIONS_2026-10-08.md`. On AnA's placement, the
canvas and the navigation, this record supersedes the two-location model of
`docs/design/UI_CODEBASE_STUDY.md` (:142, :322), §6.1 and §9.1 of
`docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md`, decision 2 and the client contract of
`docs/design/ANA_DOCUMENT_CANVAS.md`, and the other statements in the table below. A later
session may not cite any of them against it. The founder delegated these decisions to the
CPO on 2026-10-07, in the words quoted here. They stand until he says otherwise.

The founder, 2026-10-07:

> "Why are there multiple places on one screen where AnA could be accessed through a chat
> conversation? ... I don't understand why the right rail AnA is prevalent everywhere when
> there's AnA in the middle screen sometimes ... nothing like what Claude or Anthropic
> would do ... when I want to use AnA, just like I use Claude, I want to have a canvas on
> the right-hand side, and I want to see the documents being built, and I want to be able
> to pull them down and see them and work with them and edit them too ... why you've
> pulled so much of the feature functionality into individual apps that are just
> traditional need and use cases as part of the natural workflow for my client base."

> "... running out of time ... need this really good and done soon ... go to market and
> get investors and beta clients."

His delegation, the same day, is recorded on the board (`docs/work-orders/README.md:71`)
and in `docs/SURFACE_DECISIONS_2026-10-08.md:5`: *"I need you to make these decisions."*

**Superseded by this record:**

| Document | Section | What it said |
|---|---|---|
| `docs/design/UI_CODEBASE_STUDY.md` | :142 and :322 | AnA as "a persistent right-rail (and a full-screen mode)"; "AnA panel (everywhere) + AnA Full-Screen". This two-location model is what the founder saw. |
| `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md` | §6.1 Desktop Shell (:191) | The work in the centre, an optional right context drawer. |
| same | §9 and §9.1 Right Context Drawer, Allowed Tabs (:288-301) | The right side as a tabbed context drawer, including an Artifacts tab. |
| `docs/design/ANA_DOCUMENT_CANVAS.md` | Decision 2 (:31-34) and "Client contract (WN)" (:73-93) | The canvas inline in the thread; the editor reached by "Open in editor". Decisions 1, 3 and 4 of that file stand. |
| `client/src/concept2cure/v2/surfaceViews.ts` | :21-28 | A screen that takes the rail's column may "answer in its own dock". |
| `tests/ui/one-shell.test.ts` | :142-170 | The same rationale for five `useAnaChat` callers. |
| `client/src/concept2cure/v2/registryModel.ts` | :12 | "GENERATED from the kit registry … edit the kit first", for the navigation arrays. |
| `docs/audits/ANA_UI_FORENSIC_AUDIT_2026-07-28.md` | :10 | The 2026-07-28 navigation change "reverted in full", read since as "the shipped navigation wins". Superseded on AnA placement and navigation only. |
| `docs/GA_COMPLETION_LEDGER_2026-08.md` | :222 | "Keep what came from the design kits", as a rule for surfaces. Superseded on the same two questions only. |

`docs/design/ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md:115` (2026-06-30) already described
this layout: chat on the left, the document on the right, a handle between them. Its code
was deleted on 2026-08-04 as unreachable. This record does not restore that code. It
builds on the editor-beside-the-conversation work of 2026-10-01 that is on trunk now.

---

## 2. Layout

### 2.1 The shell

Today the shell grid is three columns: nav, page, AnA (`styles/app-v2.css:1306`). The AnA
column is 380px open or a 32px seam (`app-v2.css:30-31`, `:1374-1375`), and a drawer at
900px and narrower (`app-v2.css:1340-1351`). Six surfaces hide it (`surfaceViews.ts:404`,
`:410`, `:463`, `:470`, `:493`, `:557`) and every other screen draws it
(`V2App.tsx:1254-1255`).

After this change the shell is two columns everywhere: **nav | page**. The third column,
its seam, its scrim (`V2App.tsx:1228-1229`) and its drawer are removed. The only screen
with a right-hand column is the conversation, and that column is the canvas.

Focus order is nav, then conversation, then canvas. On the conversation screen, two skip
links, "Skip to conversation" and "Skip to canvas", replace the single "Skip to content"
(`V2App.tsx:1195-1207`). Other screens keep "Skip to content". (From design B.)

### 2.2 Widths

| Element | Wider than 1100px | 1100px and narrower | Phone, 760px and narrower |
|---|---|---|---|
| Nav | 264px, or 56px collapsed (`app-v2.css:28-29`). While the canvas is open and the window is narrower than 1600px, it collapses to 56px on its own. A nav the person pinned stays as pinned. The automatic collapse is not saved. | 56px strip | Drawer at 640px and narrower (existing, `app-v2.css:1307`) |
| Conversation, canvas closed | Centred reading column, max 768px | Full width | Full width, 16px side gutters, composer pinned to the bottom |
| Conversation, canvas open | `clamp(380px, 38%, 560px)` of the space right of the nav. Resizable from slice 14: 30% to 60%, remembered per person. | Hidden behind the canvas; a switch brings it back | Same as 1100px |
| Divider | 1px line with an 8px hit area, `role="separator"`, arrow keys move 16px, double-click resets | none | none |
| Canvas | The rest. Never narrower than 640px. | Full-width sheet | Full width; header actions fold into "⋯" |
| Editor inside the canvas | 12px pane padding (`authoring-v2.css:1609`), 220px outline, page at least 420px (`authoring-v2.css:23-25`). Comments float over the page whenever the canvas is narrower than 1124px. | Existing narrow rules | Existing phone rules (`authoring-v2.css`, "Phone (≤760px)") |
| AnA column on any other screen | 0px. It does not exist. | 0px | 0px |

Worked examples, conversation screen with a document open (computed from the CSS; each is
confirmed in a real browser by slice 12):

| Window | Nav | Conversation | Canvas | Editor page after the outline |
|---|---|---|---|---|
| 1280px | 56 | 465 | 758 | about 514 |
| 1440px | 56 | 526 | 857 | about 613 |
| 1920px | 264 | 560 | 1095 | about 851 |

**Why Comments must float by the canvas's width, not the window's.** The editor's three
tracks are 220px, at least 420px, and `clamp(300px, 24vw, 460px)` (`authoring-v2.css:30-31`).
At 1920px that is 1100px, and the canvas has 1071px inside its padding, so the page would
scroll sideways. Today the float rule inside the canvas is keyed to the window, 1500px and
narrower (`authoring-v2.css:1653-1666`), and is scoped to `.dcv-workbench > .ed`. That
wrapper exists in one place, `editor/DocumentCanvas.tsx:608`. On the Authoring screen the
float starts only at 1204px and narrower (`authoring-v2.css:44`). So this design keeps the
`.dcv-workbench` wrapper and turns the rule into a container query on the canvas: Comments
float whenever the canvas is narrower than 1124px (220 + 420 + 460 + 24). That is slice 12.
Designs B and C both deleted the wrapper and relied on the 1500px rule; the judges found
that mistake, and this record does not repeat it.

### 2.3 The screens

**The conversation, nothing open (Home is this screen with a new conversation), 1440px:**

```
+----------+------------------------------------------------------------+
| C2C      |                                                            |
| + New    |                    Good morning, JM                        |
| Search   |                                                            |
|          |     +--------------------------------------------------+   |
| Projects |     | How can I help you today?                        |   |
| Documents|     | [+] [@]   Engine v   Between steps v         [^] |   |
| Submiss. |     +--------------------------------------------------+   |
| Quality  |     Starters for this client type                          |
| Records  |     Continue:  ONC-221  .  Clinical Overview  .  My work 3 |
| My work 3|                                                            |
|          |                                                            |
| Recents  |                                                            |
|  Draft.. |                                                            |
|  IB 7.1  |                                                            |
| JM  v    |                                                            |
+----------+------------------------------------------------------------+
   264px            centred reading column, max 768px
```

**The conversation with a document open, 1440px.** The nav has collapsed on its own:

```
+--+---------------------------+-+--------------------------------------+
|  | Draft 2.5  . Working in   | | < Documents (2)  Clinical Overview   |
|C |   ONC-221  . Step 3 of 5  | | DRAFT . v1 . saved 10:42   [Full] [x]|
|  |                           | | Draft > In review > Approved > Filed |
|+ | You: Draft the 2.5        | |   > In submission  [Send for review] |
|  |   Clinical Overview from  | |                Download v   ...      |
|P |   the CSR and the IB.     | +-----------+--------------------------+
|D | AnA: Four sections drafted| | 2.5.1  ok | 2.5.1 Product development|
|S |   [Clinical Overview Open]| | 2.5.2  ok |   rationale              |
|Q | You: Tighten 2.5.3.       | | 2.5.3  ok | Vorelinib is a selective |
|R | AnA: A tighter 2.5.3 ...  | | 2.5.4  -- |   ... (editable, one     |
|W |                           | |           |   section at a time)     |
|  |   [Insert into 2.5.3 as   | |           | [AnA suggestion: Accept  |
|  |    tracked suggestion]    | |           |   . Reject]              |
|  | +-----------------------+ | |           |                          |
|  | | Reply to AnA      [^] | | |           |                          |
|  | +-----------------------+ | |           |                          |
+--+---------------------------+-+-----------+--------------------------+
 56            526            1       857: outline 220, page about 613
```

**The canvas in its list state:**

```
+------------------------------------------------------------------+
| Documents        ( This conversation | This project )        [x] |
+------------------------------------------------------------------+
| Clinical Overview      Module 2.5  DRAFT      4 of 4   10:42     |
|                        Built by AnA            Open  Working copy|
| Nonclinical Overview   Module 2.4  IN REVIEW  6 of 6   Tue       |
|                        Built by AnA            Open  Working copy|
+------------------------------------------------------------------+
```

**A proposal AnA has not saved yet (slice 13):**

```
+------------------------------------------------------------------+
| Clinical Overview          Proposed by AnA . not saved           |
+------------------------------------------------------------------+
| 2.5.1 Product development rationale                              |
|   Vorelinib is a selective ...                                   |
| 2.5.2 Overview of biopharmaceutics ...                           |
|                                                                  |
| [ Save as a draft in ONC-221 ]   [ Discard ]                     |
| No download, no filing, no editing until it is saved.            |
+------------------------------------------------------------------+
```

**A project, 1440px.** Nav and page; no AnA column, no AnA card:

```
+----------+------------------------------------------------------------+
| nav      | ONC-221 . Vorelinib . IND (FDA)                            |
|          | Stage: Plan > Author > Review > File > Submit              |
|          | +--------------------------------------------------------+ |
|          | | Start a conversation in ONC-221                    [^] | |
|          | +--------------------------------------------------------+ |
|          | Conversations                      | Files (project vault) |
|          |   Draft 2.5 Overview         10:42 |   CSR-001.pdf         |
|          |   Review the IB  Tue               |   IB v4.pdf           |
|          | Documents                          | Readiness             |
|          |   Clinical Overview  DRAFT  4 of 4 |   2 findings block    |
|          |   Nonclinical Ov.  IN REVIEW  6/6  |   sequence 0001       |
|          |   [New document]                   | My work on ONC-221    |
+----------+------------------------------------+-----------------------+
                                                         320px
```

**Documents, Submissions, Quality, Records & reports, My work, Settings.** Nav and the
place at full width. A record's "Ask AnA about this" opens the conversation with the
record attached:

```
+----------+------------------------------------------------------------+
| nav      | Documents                              Search    Upload    |
|          | folders | list                | SOP-012 Document control   |
|          |         |                     | v3 . Effective             |
|          |         |                     | [Ask AnA about this]       |
+----------+------------------------------------------------------------+

                 after "Ask AnA about this":

+----------+------------------------------------------------------------+
| nav      | < Back to Documents          Working in ONC-221            |
|          | ...                                                        |
|          | [ SOP-012 Document control  x ]                            |
|          | +--------------------------------------------------------+ |
|          | | Ask about SOP-012...                               [^] | |
|          | +--------------------------------------------------------+ |
|          |   Nothing is sent until you press Enter.                   |
+----------+------------------------------------------------------------+
```

**1100px and narrower: one pane at a time.**

```
+--+-------------------------------------------------+
|  | [ Conversation | Clinical Overview ]            |
|  +-------------------------------------------------+
|  | the selected pane, full width                   |
+--+-------------------------------------------------+
```

- Navigating to a place shows that place. Opening a document shows the canvas.
- A document AnA builds does not take the screen. A bar reads "AnA built Clinical Overview
  · View".
- An ask from the editor closes the sheet and fills the composer. This is today's
  behaviour (`ConversationThread.tsx:976-981`).
- "Insert into 2.5.3" switches back to the canvas.

**Phone, 390px.**

```
+--------------------------------------+
| =  Draft 2.5          [Conversation] |
+--------------------------------------+
| transcript                           |
| [Clinical Overview . Open]           |
|                                      |
+--------------------------------------+
| Reply to AnA                     [^] |
+--------------------------------------+
```

Nothing scrolls sideways at 390px. The canvas header's actions fold into "⋯". Side gutters
are 16px.

---

## 3. Where AnA is talked to

### 3.1 The one place

The conversation (`conversation-thread`, `surfaces/ConversationThread.tsx`) is the only
place AnA answers. It runs on the shell's one chat (`V2App.tsx:727-730`).

Two rules hold on every screen:

- **At most one AnA typing box is on screen.** During a run it is the same box, which
  steers. The ratchet in slice 2 enforces this.
- **No button sends a message the person did not write.** A button attaches its record and
  may suggest a question as placeholder text; the person sends it. The exceptions are text
  the person typed: the composer, and ⌘K's "Ask AnA: …".

Home and the project page carry the same composer in "start" mode. Typing there opens the
conversation, as Claude's new-chat page and project page do. They are not second places:
nothing is answered there.

### 3.2 Every entry point today, and what it becomes

| Entry point | Today | Becomes | Slice |
|---|---|---|---|
| **Right rail**, open and as a seam | `AnaRail`, `Shell.tsx:622-1548`, mounted at `V2App.tsx:1254-1255` on every screen without `ownsConversation`. Collapsed by default (`V2App.tsx:179`); any ask opens it and saves that (`V2App.tsx:1058`). | Deleted. Its own pieces move first (slice 6): the "Working in" block (`Shell.tsx:933-1014`) becomes a chip in the conversation header; the first-run welcome (`Shell.tsx:903-932`) and the Live Drive tour and demo start (`Shell.tsx:1479-1515`) move to Home; the engine picker (`Shell.tsx:1531`) moves to the conversation composer. The "What AnA can do here" chips (`Shell.tsx:1151-1168`) are deleted; each screen keeps its own buttons. "Open in conversation" (`Shell.tsx:610-620`, `:1103-1104`) is deleted. | 6, 9 |
| **The conversation screen** | Full chat in the centre (`ConversationThread.tsx`, registered at `surfaceViews.ts:410`), with Progress on the right (`:1446-1478`) and the editor beside it after a click (`:1435`). | The one place. The right column becomes the canvas (section 4). | 1, 12 |
| **Editor dock W** | The editor's own chat: `useAnaChat` at `editor/DocumentWorkbench.tsx:1419`, pane `:4533-4777`, toggle `:3702-3711`. Starts empty on every visit. | Deleted after every document opens in the canvas (slice 15). In the canvas the editor already hands each ask to its host (`DocumentWorkbench.tsx:1480-1483`), and every turn names the open document and section (`ConversationThread.tsx:922-933`). | 16 |
| **eCTD co-author dock E** | Middle-column chat, `surfaces/EctdCoauthor.tsx:335`. | The surface left launch scope on 2026-10-08 (`bcc457edb`; CPO decision: scrap, its outcome delivered by Submission Center's builder and the editor). No client can reach it. It stays a named, dated exception in the one-shell test until its code is removed by a change that names those replacements. | 2 |
| **RBM dock R** | `surfaces/Rbm.tsx:160`. | Locked in production (CPO: later, clinical operations). Same dated exception as E. If RBM enters scope before its dock is removed, the test fails. | 2 |
| **The conversation's private chat** | `ConversationThread.tsx:888`, used only when no shell chat is passed in. | Deleted. Tests pass a stub chat. | 10 |
| **Home composer** | `surfaces/Surfaces.tsx:264-402`; seeds `window.C2C_CONVO` and navigates (`:211-214`). | The conversation's own composer in start mode (one component, `AnaComposer`). | 17 |
| **Project home card** | "AnA · co-author", `surfaces/ProjectHome.tsx:923-958`, mounted at `:1619`. | The same composer in start mode at the top of the project page, scoped to the project. The project's conversation list (`ProjectHome.tsx:986`, Resume at `:1044`) stays as "Conversations". | 17 |
| **⌘K "Ask AnA: …"** | `Shell.tsx:1709`. | Kept. It sends the typed text into the current conversation if that conversation is in the open project, otherwise into a new one, and shows the conversation. It is a keyboard path into the one place. | 8 |
| **The Ask-AnA buttons** | About 80 call sites. The design brief counted 77; counts vary by method (a grep at `2fd174c14` finds 104 matching lines in 49 files under `v2/surfaces` and `quality/`, including guards). Every one calls `V2App.ask` (`V2App.tsx:1051-1061`), which sends into the rail. | Three dispositions, section 3.3. Slice 2 records the exact count its gate uses, and only lets it fall. | 8, 20, 21 |
| **Reporting's report builder** | A chat-shaped column, `surfaces/Insights.tsx:1279-1350`, whose replies come from a fixed matcher, `roRouteReply` (`Insights.tsx:492`). It looks like AnA and is not. | A plain "Find a report" field over the same matcher, with no chat bubbles. "Ask AnA about this report" attaches the report to the conversation. | 21 |
| **Run-strip steer box** | `AnaWorkSections.tsx:538-553`, mounted in the conversation at `ConversationThread.tsx:1350`. A second box during every run. | Deleted. While a run streams, the composer sends through `interject` (`useAnaChat.types.ts:807`) and its button reads "Steer". Stop and Pause stay. | 4 |
| **Live Drive steer box** | `LiveDriveOverlay.tsx:149-161`. A third box while AnA drives. | Deleted. The strip keeps narration, Stop and Take over, and gains "Back to conversation". | 4 |
| **"Get help"**, top bar and account menu | `Shell.tsx:547-555` and `:217`, both to the conversation. | Deleted. The account menu gets "Help & documentation", which opens the documentation, not AnA. | 9 |
| **Nav "Conversation"** | `registryModel.ts:114`. | "New conversation" and Recents. | 3, 22 |
| **Task tray "Triage my day with AnA"** | `TaskTray.tsx:228-231`. | A starter on Home. | 22 |
| **Template library's inline ask** | `surfaces/TemplateLibrary.tsx:713-725`, `:737-739`. | The surface left launch scope on 2026-10-08 (`bcc457edb`). When it returns, it offers "New document from this template". | — |

**Not conversations, and kept.** `AuthoringAiDraft` (mounted at
`DocumentWorkbench.tsx:4354`) is a one-shot section draft with span-level source lineage.
Design C retired it into the conversation; the Part 11 judge showed the conversation's
insert path keeps attribution per turn, not per span. It stays until the conversation's
insert carries span lineage. The editor's "Ask for a source" and "Ask AnA to draft 2.5.x"
are asks, and follow the rules above.

### 3.3 The Ask-AnA buttons

Each button takes one of three dispositions. (From design C, with A's labels.)

1. **A button named for a job does the job.** It sends nothing to AnA. Slice 20:
   - Dispatch readiness "Fix" (`surfaces/DispatchReadiness.tsx:618-622`) opens the
     finding's document at its section, through the open-the-item channel.
   - Dispatch readiness "transmit" (`DispatchReadiness.tsx:644-648`) opens the sequence's
     governed transmit in Submissions, with its e-signature. It never sends a chat message.
   - Licensing "contact sales" (`surfaces/LicensingSurface.tsx:104`) files an access request.
   - The task board's automatic message after a template creates tasks
     (`surfaces/TaskBoard.tsx:1098`) is deleted. A toast says what was created.
   - Documents "Ask AnA to import" (`surfaces/Vault.tsx:1359`) opens the import dialog.
   - Settings buttons that only type a sentence to AnA (`surfaces/AdminAccess.tsx:404`,
     `:522`, `:523`, `:539`, `:676`) open the screen's own dialog where one exists. Where
     none exists, they attach the member or role (disposition 2).
2. **A button about a thing attaches it.** "Ask AnA about this" puts a chip above the
   composer (for example "SOP-012 Document control", "Finding F-7", "Sequence 0001"),
   opens the conversation, focuses the composer, and shows a suggested question as
   placeholder text. Nothing is sent until the person presses Enter. The turn carries the
   origin screen's published context as that turn's `module_context`, the same per-turn
   pattern as `authoringContext` (`ConversationThread.tsx:927`). It does not carry the
   origin's `screen_actions`: the action bus refuses an action for a screen that is not
   open (`surfaceActions.ts:435-443`). If an attached record is an authoring document, it
   opens in the canvas too.
3. **A button with no context is removed.** Projects' header "Ask AnA"
   (`surfaces/Projects.tsx:1223`) and Quality's header "Ask AnA" (`quality/App.tsx:290`)
   go. "New conversation" is always one click away in the nav.

The conversation header shows "Back to <screen>" when the person arrived from one. Back
restores what the navigation parameters carry: the screen, the project, the record id. It
does not promise to restore scroll position or an unsaved selection; the screen remounts
under a new key (`V2App.tsx:1076-1078`).

---

## 4. The canvas

### 4.1 What it is

The canvas is the right-hand column of the conversation, `.ct-canvas`. It replaces two
things that already occupy that position and already replace each other: the side column
with Progress and the type-B Artifacts list (`ConversationThread.tsx:1446-1478`, 384px,
`app-v2.css:3004`), and the editor pane (`ConversationThread.tsx:1435`). It has three
states:

- **Closed.** Nothing built, nothing open. The conversation is centred.
- **List.** "Documents", with a switch: This conversation · This project.
- **Open.** One document in the one editor. This is `DocumentWorkbench`, mounted by
  `DocumentCanvas` and portalled into the canvas (`editor/DocumentCanvas.tsx:597-631`).
  No second editor is built.

Progress (`AnaWorkPanel`) moves into a popover on the header's Step chip. In the
transcript, each document is a compact chip: title, status, Open. The card's duplicate
action row (`DocumentCanvas.tsx:528-593`) goes, because the actions live once, in the
canvas.

The canvas header shows: "← Documents (n)", the title, the status pill (Draft, In review,
Frozen, Approved), the version, the last-saved time, the project, "Full" (⤢) and close.
"Full" collapses the conversation to a 40px "AnA" seam on the canvas's left edge, in the
same position; clicking the seam, or the shortcut that toggles the rail today (⌘\,
`V2App.tsx:956`), restores it. (Seam from design C.)

### 4.2 Watching it being built

**Today.** `draft_authoring_document` is a confirm-class tool
(`server/services/ana/tool-authorization.register.json:1770-1771`). AnA proposes; a card
in the transcript asks the person to confirm; the tool then writes every section in one
transaction (`server/services/authoring/authoring-from-draft.ts:206`); the stream sends one
`artifact_draft` event (`server/routes/ana-ri/stream.ts:2603-2643`); the document appears
as a card in the middle of the transcript. The editor opens on the right only after "Open
full editor" (`DocumentCanvas.tsx:544`). The founder saw exactly this on 2026-10-07.

The design reaches "see it being built" in three steps. Each is useful on its own, and the
later ones fall back to the earlier.

1. **It opens when it is saved (slice 1).** When `artifact_draft` arrives with an
   `authoringDocId` (client handling at `components/ana/useAnaChat.ts:1683`), the canvas
   opens on that document while the turn is still running. It never takes over a canvas
   whose open document has unsaved edits; the workbench's `requestLeave`
   (`DocumentWorkbench.tsx:1236`) answers that, and the header then shows "New document
   ready · Open". It announces politely and does not move focus. While the tool runs, the
   transcript shows AnA's live step line, as today.
2. **The proposal is shown before it is saved (slice 13).** The `approval_required` event
   the client already receives (`stream.ts:2064-2075`, handled at `useAnaChat.ts:1323`)
   carries the proposal's parameters in `data.retry.params`
   (`server/services/ana-ri/part11-governance.ts:435`). For `draft_authoring_document`
   those are the title and every section's code, title and content
   (`server/services/ana/document-surface-tool-defs.ts:144-169`). So the canvas can show
   the whole proposed document at the moment AnA asks to save it, with no server change.
   It is marked **"Proposed by AnA · not saved"**. It has no download, no filing and no
   editing. The confirmation renders on the proposal, with the same
   `GovernedActionSignoff` the transcript uses today (`SignoffList`,
   `ConversationThread.tsx:387`); the transcript shows one line, "Waiting for you to save
   Clinical Overview". Confirm: the tool runs and the stored record replaces the proposal.
   Decline or failure: the proposal is discarded and the server's reason is shown. Slice
   13 first proves by test that the event carries the section text. If it does not, the
   slice reports blocked.
3. **It is written word by word (slice 26).** The gateway already buffers the tool's
   input as it streams (`input_json_delta`, `server/services/ai-gateway/gateway.ts:2812-2815`).
   `stream.ts` does not forward it today (it has no `input_json_delta` or `partial_json`
   handling). Slice 26 exposes the buffer, emits `artifact_delta` events for
   `draft_authoring_document` from a tolerant incremental parse, throttled to about 100ms
   and never persisted, and fills the slice-13 proposal as AnA writes. Where no fragments
   arrive (deterministic mode, another provider), step 2's behaviour holds. (From design C;
   the change is in `gateway.ts`, as C said, not only in `stream.ts`, as A said.)

Until slice 26 lands, the demo says what is true: the document appears section by section
when AnA proposes it, not word by word.

A document AnA is building is read-only until the building turn settles. (From design B.)
A document the person has open stays editable while AnA answers: nothing in that turn
writes into it, because her changes arrive only as tracked suggestions.

### 4.3 The list of documents

One list component, two scopes:

- **This conversation** reads `GET /api/authoring/docs` (`server/routes/authoring.router.ts:1275`)
  filtered by `provenance->>'conversationId'`. The draft tool already records the
  conversation as provenance (`server/services/authoring/authoring-draft-tool.ts:118`). No
  migration is needed.
- **This project** reads the same route with `programId`, with a "Built by AnA" filter.

Because the list is read from the server, it survives a reload. Today a reload restores
document cards by parsing the step history (`ConversationThread.tsx:107-167`), which is
cut to 180 characters (`server/services/ana/tool-trace.ts:68`). Slice 11 first tries to
reproduce the case where the cut drops the document id. If the test does not fail, it is
recorded as not reproduced, and the list ships for its own sake.

Each row shows title, type, status, sections drafted ("4 of 4"), updated time, Open, and
Download working copy. Type-B drafts from this session appear in the same list with "Open
as document" (existing) until slice 25 makes every AnA document an authoring document.

The project page's Documents panel uses the same component with the project scope.
Project home's "Recent drafts" (`ProjectHome.tsx:1194`), which reads a third store, is
replaced by it.

### 4.4 Open and edit in place

The canvas is the same editor as everywhere else: outline, one section at a time,
comments, history, sources, signatures, audit, project files and tasks.

- AnA never writes into the open document. Her answers arrive as tracked suggestions
  through the editor's one insert door (`DocumentWorkbench.tsx:1328-1340`), gated by
  `anaInsertRefusal` (`ConversationThread.tsx:196`). The person accepts or rejects each
  one, and the decision is chained.
- Every turn sent while a document is open names the document and the section
  (`ConversationThread.tsx:922-933`).
- The bridge that lets the conversation insert into the editor stays where it works today:
  the workbench publishes it through `embedded.onEditorBridge` (`DocumentWorkbench.tsx:1344-1397`),
  which only the canvas passes. `DocumentAuthoring` passes no `embedded`, no bridge and no
  `onAsk` (`surfaces/DocumentAuthoring.tsx:98-111`). This is why documents open in the
  canvas (slice 15), not on the Authoring screen.
- Opening a document anywhere opens it in the canvas, beside the project's most recent
  conversation or a new one: Documents' "Open in editor", a project's Documents panel,
  Recents, a task's "Open the item", a review's "Sign". The `document-authoring` route
  becomes the canvas at full width. It still mounts `DocumentWorkbench`, so the gate's
  `surface-mounts-workbench` link holds (`scripts/ci/check-canvas-path.mjs:135-137`).

### 4.5 Download: two acts, one renderer

Today a document AnA has just built cannot be downloaded. Word, PDF and XML are disabled
for drafts (`surfaces/AuthoringCreateExport.tsx:225-233`), and the server refuses with 409
(`authoring.router.ts:5818-5841`). These become one **Download** menu with two acts that
cannot be mistaken for each other.

**(a) Working copy (.docx or .pdf), any status.** A CPO decision under the delegation.
A marked, audited working copy is a convenience copy, not a record; the authoring store
remains the system of record.

- `POST /api/authoring/docs/:docId/working-copy` with `{ format }`. It is a POST so a
  cross-site page cannot trigger it; the CSRF middleware skips GET
  (`server/middleware/csrf.ts:19`, `:83`). It requires the same permission as the
  controlled export.
- Rendered by the one renderer, `renderAuthoringExport`, in a working-copy mode.
- **Every page** carries a header and footer: **"DRAFT — uncontrolled copy** · not a
  controlled record · <document id> · v<n> · <status> · downloaded <UTC time> by <user>".
  Today the vault filing's working-draft statement prints once, before the content
  (`server/services/authoring/authoring-file-to-vault.ts:414-416`; the notice is "rendered
  before the content", `authoring-export.ts:55-58`). That is not enough for a copy that
  leaves the system.
- **No signature manifest.** The renderer builds it unconditionally today
  (`prepareShared`, `server/services/authoring/authoring-export.ts:210-215`). The
  working-copy mode suppresses it, so a draft can never print "this signature covers the
  content of this document".
- The filename ends "— working copy".
- One chained audit row, `authoring.document.working_copy`: actor, document, version,
  format, SHA-256 of the delivered bytes. No export-history row, so the Exports tab still
  lists only controlled acts, and "changed since last export" is not re-baselined.
- The document-control SOP gains a definition of a working copy, and QA concurs before the
  first beta client uses it. The validation package (D4) gains an OQ test case.

**(b) Controlled export (Word, PDF, XML).** Unchanged. Only FROZEN or APPROVED, with the
signature manifest; the server's 409 stands and is pinned by a regression test in slice 7.
In the menu it is disabled with its reason: "Freeze or approve to export a controlled
copy."

**File to vault** stays the existing governed act: it renders, files and records a SHA-256,
and says whether it filed a working draft or a sealed record.

### 4.6 Versions

The workbench's History tab, unchanged. The canvas header shows the version and the
last-saved time. A frozen or approved document opens read-only.

### 4.7 The document's lifecycle

From design B. One strip in the document header:

**Draft → In review → Approved → Filed → In submission**

The next governed act is the only primary button. Every step composes a component that
exists; none is rebuilt:

| Step | Component |
|---|---|
| Send for review | The request-review entry built by step 3 of `docs/SURFACE_DECISIONS_2026-10-08.md` (route at `authoring.router.ts:3226`, which no screen calls today). `AssignReviewDialog` creates a task, not a review request (`editor/AssignReviewDialog.tsx:178`). |
| Freeze, Approve and sign | `surfaces/AuthoringFilingBar.tsx` through the one `EsignModal` (`_shared/components/EsignModal.tsx`): meaning, reason, re-authentication, re-verified on the server (`server/services/part11/reverify-signer.ts`). |
| File to record | `editor/FileToVaultDialog.tsx`: format, folder, reason, SHA-256. |
| Place into submission | `surfaces/AuthoringPlaceIntoFiling.tsx`. |

A reviewer signs on the document, not on a task board. Today the review task sends the
signer away (`editor/ReviewTasksPanel.tsx:304-310`), and the Review board's "Sign in the
authoring workspace" opens Authoring with no document (`surfaces/Review.tsx:587-589`, used
at `:818`). Slice 19 fixes both.

### 4.8 Part 11 guarantees

- AnA never signs, freezes, approves or files. The action bus refuses governed verbs
  (`surfaceActions.ts:484-486`), so Live Drive cannot press them either.
- A new document exists only after a person confirms it (confirm class,
  `tool-authorization.register.json:1770-1771`).
- AnA's changes to an existing authoring document arrive only as tracked suggestions.
- A proposal or streamed text never looks saved, has no actions, and is discarded on
  decline or failure. A confirmation given in the canvas writes the same chained turn
  record as one given in the transcript (proved in slice 13, row D5).
- Section saves keep their provenance, version write and audit row.
- Freeze, approval and §11.50 signature keep their ceremony.
- The status pill is always visible. A draft is never shown as a record.
- A controlled export exists only for a sealed document. A working copy is marked on every
  page, has no manifest, and is audited.
- A conversation writes only into its own project. Today a thread's project is fixed when
  the thread is created (`server/services/chat-thread-helpers.ts:174-203`), but each turn's
  project comes from the request body (`stream.ts:802`, `:887`), and the shell sends the
  open project on every turn (`V2App.tsx:729`; `useAnaChat.ts:1093`). Nothing compares them.
  The draft tool writes into the turn's project (`authoring-draft-tool.ts:114`). Slice 5
  makes write and confirm tools refuse when the two differ, re-checks when a held
  confirmation is decided (the held context is captured at `stream.ts:2043`), and offers
  "New conversation in <project>". (Design C stated this rule but built no slice for it.)
- Recents shows only the signed-in person's conversations (slice 3).

Not covered by "tracked suggestions only": three confirm-class tools overwrite sections
directly, `update_biosketch_section`, `update_protocol_section` and `write_kit_section`
(`tool-authorization.register.json:3856`, `:3897`, `:4003`). None of their documents opens
in the canvas in this design. Before one does, those tools must refuse while the section is
open in an editor, or become tracked suggestions, with a test.

---

## 5. Navigation

The places come from `docs/SURFACE_DECISIONS_2026-10-08.md` (its PLACE decisions). The nav
is the same for every client type. Entries outside the release are absent, not shown
locked.

**Nav, top to bottom:**

1. **Concept2Cure mark**: Home. Today it opens the document editor (`Shell.tsx:294-306`).
2. **New conversation**: Home, which is the empty conversation.
3. **Search ⌘K**: the existing palette, with its "Ask AnA: …" row.
4. **Projects**: the portfolio, and each project's page (`projects`, `project-home`).
   Renamed from "Project management" (`registryModel.ts:96`).
5. **Documents**: the controlled library (`vault`), renamed from "Vault"
   (`registryModel.ts:97`). The editor opens from any document. "Protocols"
   (`protocol-dev`) is its child row. There is one Documents entry, not a Documents and a
   Vault.
6. **Submissions** (`submission-center`), renamed from "Submission Center"
   (`registryModel.ts:98`). Compile, validation (dispatch readiness) and transmit are
   inside a sequence.
7. **Quality** (`quality`). It has no nav entry today (`registryModel.ts:95-100`).
8. **Records & reports**: the audit trail (`audit-trail`) as the place, with Reports
   (`insights`), Compliance reports and Integrity (`part11-console`) as its tabs. Replaces
   "Reporting & analytics" (`registryModel.ts:100`).
9. **My work** (`tasks`), relabelled from "Tasking" (`registryModel.ts:99`), with a count
   from `GET /api/task-management/my-work`, the same read the task tray makes
   (`TaskTray.tsx:99`).
10. **Recents**: the signed-in person's last 8 conversations; those in the open project
    are marked.

**Account menu:** Settings (Organization, Client type, Members & access, Apps, Plan &
billing; Security for platform operators), Help & documentation, Sign out. The client type
is chosen in one place. A new organisation lands on Projects; four of the five client types
open on a "Not in this release" screen today (`docs/SURFACE_DECISIONS_2026-10-08.md:85`).

**Top bar:** the breadcrumb, ⌘K, New task and Collaborate (`Shell.tsx:526-543`) stay.

**What leaves:**

| Today | Goes to |
|---|---|
| Client categories (`Shell.tsx:310`) and the top bar's client-domain selector (`Shell.tsx:480-505`) | Settings › Client type |
| Science & intelligence (`Shell.tsx:334`; `registryModel.ts:103-106`), all out of the release | Nothing |
| Explore (`Shell.tsx:338-339`; `registryModel.ts:109-115`): AnA Command, AnA memory, Apps catalog, Artifacts Center, Conversation | AnA Command and AnA memory are locked (CPO). Apps: Settings › Apps. Artifacts Center: the canvas list, then locked (slice 25). Conversation: New conversation and Recents. |
| Quick access (`Shell.tsx:340`): Recent Documents, My Tasks | Recents and a project's Documents; My work |
| "Get help", top bar and account menu | Help & documentation |
| The task tray popover (`Shell.tsx:544`) | The My work count |

`registryModel.ts` keeps its arrays but its header (`:12`) records that the navigation is
decided here and is no longer generated from the design kit. Any generator for those
arrays is disabled in the same commit, so a regeneration cannot bring the old nav back.
`ci:surface-discoverability` requires every launch surface to be a nav place or to name
its parent place (for example "dispatch-readiness: Submissions › a sequence ›
Validation"). (From design B.)

---

## 6. Slices

**Rules for every slice.**

- One commit, on `concept2cure-v2`, filed under row D2 with evidence in
  `docs/evidence/D2-ONE-ANA/<date>/ana-<n>-<slug>/`.
- The named test is seen failing on the code before the change, then passing.
- A slice that changes the screen has a real-browser check at 1280, 1440 and 390, filed
  with the evidence. A slice that cannot produce its evidence reports **blocked**, not done.
- A file another session committed in the last 24 hours is rebased onto, not overwritten.
- A deletion names, in its commit message, the file that now delivers the outcome and the
  test that proves it is reachable (CLAUDE.md, working agreement).
- `ci:canvas-path` stays green throughout. No slice deletes `DocumentCanvas`.

**Lanes.** "L*n*" is line *n* of `docs/work-orders/README.md` §0. Only lanes verified there
are named. The ones these slices touch:

- **L69**, `…01WcyqbqWn6LszBqUWUSNnqA`: the D2 canvas. `editor/DocumentCanvas.tsx`, the
  canvas and card wiring in `ConversationThread.tsx`, the `.dcv`/`.ct-*` rules in
  `authoring-v2.css`.
- **L70**, the same session: AnA reads and proposes edits. The `EditorBridge`, and
  registration lines in `stream.ts`, `authoring.router.ts` and
  `tool-authorization.register.json`.
- **L82**, this session: `AnaWorkPanel`, `AnaWorkSections`, `AnaOutputs`, `useAnaChat*`,
  `useChatUpload`, `tool-trace.ts`.
- **L91**, `…01JNRgCKWRqqJxZ1cJCyxoor`: open-the-item navigation, `navParams` and
  `shared/navigation`.
- **L102**, `…019ZvHmh63vQ2C66VAwZg2kc`: multi-agent and Manual/Auto. `V2App.tsx`,
  `Shell.tsx`, `registryModel.ts`, `Surfaces.tsx`, `ConversationThread.tsx`,
  `AnaWorkSections.tsx`, `useAnaChat*`, `app-v2.css`, `stream.ts`, `post-processing.ts`,
  `RunPolicySwitch.tsx`.
- **L104**, `…01TTTQ1hpdMr1yAMVYH4nYdE`: the editor-family review. `DocumentWorkbench.tsx`,
  `RichSectionEditor.tsx`, `ProtocolDev*`.
- **L118**, the same session: the reasoning check. `stream.ts`, `post-processing.ts`, the
  success returns of `gateway.ts` `route()`, `useAnaChat*`, the "Grounded in" label in
  `ConversationThread.tsx`, `.ct-ground-chip` rules in `app-v2.css`.
- **L60**, `…01TtwRHmBMya3QTFCbFsBjoj`: the IND path. `AuthoringPlaceIntoFiling.tsx`.
- **L26**, `…01KnUGoX3g4R4FWKWGc2sTbN`: the e-signature transport, `useEsignature.ts`.

Our own claim (L71) records that L69's windows are closed and that this lane builds on its
landed steps rather than beside them. Each slice that touches a file another lane names
announces it on that lane's row first.

**When the founder sees it.** Slice 1 puts the target layout of the conversation screen in
front of him in a real browser: the document opening on the right while AnA works. Slice 9
puts the whole target in front of him: one AnA, no rail on any screen. He is shown slices
1, 9 and 13 before slice 22 changes the navigation, because a navigation change was
reverted the same day once before.

Order: smallest first, except where a slice needs an earlier one. What the founder asked
for comes first.

### 1. The canvas opens while AnA builds — S — the founder sees it

- **Size.** A few hours. Client only, and reverted by reverting one commit.
- **Change.** In `ConversationThread`, when a turn first carries an authoring document
  (from `artifact_draft`), set `expandedDocId` (`ConversationThread.tsx:902`) to it, so the
  editor opens beside the conversation in the existing pane (`:1435`). Skip it when the
  open document has unsaved edits; show "New document ready · Open" instead. Announce
  with `aria-live="polite"`; do not move focus. Below 1600px, while a document is open,
  collapse the nav to 56px unless the person pinned it; do not save that. At 1100px and
  narrower, do not open; show "AnA built <title> · View".
- **Files.** `surfaces/ConversationThread.tsx` (one effect, one notice);
  `V2App.tsx` (the collapse hint); `styles/authoring-v2.css` (the notice rule).
- **Fails first.** New `__tests__/canvasAutoOpen.test.tsx`. A mocked stream emits
  `artifact_draft` with an `authoringDocId`, then more text. Before the stream ends,
  `[data-testid=ct-canvas-pane]` is visible and shows the title. Today it stays hidden
  until "Open full editor" is clicked (`DocumentCanvas.tsx:544`). A second case: unsaved
  edits mean no switch and the notice shows.
- **Real browser.** The stand-in model harness
  (`docs/evidence/ANA-AGENTS/2026-09-27/E2E-stand-in/`): ask for a draft, confirm, and the
  document appears on the right with no click. 1440 and 1280.
- **Lanes.** L69 (canvas wiring), L102 and L118 (`ConversationThread.tsx`, other regions).

### 2. Count the AnA places, and let the count only fall — S

- **Change.** In `tests/ui/one-shell.test.ts`, make the `useAnaChat` allow-list
  (`:171-177`, five files) shrink-only. Add two shrink-only counts with a baseline file:
  AnA typing boxes, and free-text ask sites in launch screens. The test fails when a count
  rises, and when a count falls without the baseline being lowered. `EctdCoauthor.tsx` and
  `Rbm.tsx` stay as named exceptions with a date and a reason: both surfaces are outside
  launch scope. The exception fails the test if either surface re-enters
  `shared/constants/launch-scope.ts` while its dock exists.
- **Files.** `tests/ui/one-shell.test.ts`; `tests/ui/one-ana.baseline.json` (new).
- **Fails first.** A scratch tree with a sixth `useAnaChat` caller and a new AnA textarea
  fails and names both. A scratch tree with one box removed and the baseline unchanged
  fails. HEAD passes.
- **Lanes.** None name these files.

### 3. Recents: the person's own conversations — S — visible

- **Change.** `GET /api/chat/threads` filters by the signed-in user on both branches. Today
  the global list filters only by organisation (`server/routes/chat/threads.ts:84-101`,
  `WHERE` at `:96`) and the program list likewise (`:43-63`), and each row's title is the
  first user message. So a colleague's first message would show as a title. Threads with no
  recorded owner are not listed. The nav gains Recents: the last 8, the open project's
  marked. A failed read shows an error, never an empty list. A row opens the conversation
  through the existing `C2C_CONVO` hand-off.
- **Files.** `server/routes/chat/threads.ts` (two `WHERE` clauses); `Shell.tsx` (one nav
  section); a server test; `__tests__/navRecents.test.tsx` (new).
- **Fails first.** Server test: user B in the same organisation does not see user A's
  thread. Today B sees it.
- **Lanes.** L102 (`Shell.tsx`; this inserts one nav section). No lane names `threads.ts`.

### 4. One typing box during a run — S — visible

- **Change.** Delete the run strip's steer input (`AnaWorkSections.tsx:538-553`) and the
  Live Drive steer box (`LiveDriveOverlay.tsx:149-161`). While a run streams, the
  conversation composer sends through `interject` (`useAnaChat.types.ts:807`). Its button
  reads "Steer", and in Manual mode "Do this instead", the strip's own wording
  (`AnaWorkSections.tsx:548`). Stop and Pause stay. The Live Drive strip gains "Back to
  conversation".
- **Files.** `AnaWorkSections.tsx`; `LiveDriveOverlay.tsx`; `surfaces/ConversationThread.tsx`
  (composer send path).
- **Fails first.** A composer test during a stream expects `interject` to be called; today
  the composer cannot reach it. Real browser during a stand-in run: one textbox on screen.
  Today there are three: "Reply to AnA", "Steer this run…" and "Ask or steer AnA…" (live
  capture of 2026-10-07). The slice-2 count falls by two.
- **Lanes.** L82 (own). L102: agree the held-run wording on its row first; its Manual mode
  uses the strip's input.

### 5. A conversation writes only into its own project — S

- **Change.** In `stream.ts`, before a write- or confirm-class tool runs or is held: if
  the thread is bound to a program and the turn names another, refuse with
  `THREAD_PROJECT_MISMATCH` and say which project the conversation belongs to. Re-check
  when a held confirmation is decided. The client shows "New conversation in <project>".
  Unbound threads are unchanged.
- **Files.** `server/routes/ana-ri/stream.ts` (one guard where tools are held,
  `:2032-2075`, and at execution); `server/services/chat-thread-helpers.ts` (one reader);
  a stream test; one client notice in `ConversationThread.tsx`.
- **Fails first.** A thread bound to program P1, a turn with `project_id` P2, and
  `draft_authoring_document`: today an authoring document is written into P2. After: refused,
  no row.
- **Lanes.** L102, L118 and L70 all name `stream.ts`. The guard is additive and announced on
  all three rows; check the file's 24-hour window first.

### 6. The rail's own pieces move to the conversation first — S

- **Change.** Additive only, so the replacement exists by path before slice 9 deletes the
  rail. The conversation header gains a "Working in <project>" chip and, when `C2C_CONVO`
  carries an origin, "Back to <screen>". The composer foot gains `EngineChoices`, which
  today is mounted only in `Shell.tsx:1531` and `Surfaces.tsx:380`. Home gains the
  first-run welcome and the Live Drive tour and demo start.
- **Files.** `surfaces/ConversationThread.tsx` (header and composer foot only);
  `surfaces/Surfaces.tsx` (Home); `V2App.tsx` (props to Home).
- **Fails first.** New `__tests__/conversationRehomed.test.tsx`: the conversation renders
  the engine picker and the chip; Home renders the welcome and the tour start. Today they
  render only inside `AnaRail`.
- **Lanes.** L102 (`RunPolicySwitch` in the same composer foot: place beside it, do not
  edit it); L118 ("Grounded in" chip: not touched).

### 7. Pull it down: the working copy — M — visible

- **Change.** As section 4.5. A new route, the renderer's working-copy mode (watermark on
  every page, no manifest), the audit row, and the Download menu replacing the three
  disabled buttons.
- **Files.** `server/services/authoring/authoring-export.ts` (mode flag);
  `server/services/authoring/authoring-working-copy.ts` (new); `server/routes/authoring.router.ts`
  (one route and its authorization entry); `surfaces/AuthoringCreateExport.tsx`; route and
  client tests.
- **Fails first.** The route answers 404 today. After, on a DRAFT document: 200; every PDF
  page's text, and the .docx header and footer XML, carry "DRAFT — uncontrolled copy"; no
  signature-manifest text; one chained audit row with the byte hash; no export-history row.
  The controlled export of the same draft still answers 409.
- **Real browser.** Download both formats and open them. Evidence includes the files.
- **Lanes.** L70 holds registration lines in `authoring.router.ts`; this adds one route
  line. `f3b642189` (2026-10-06) last changed the export area of that file and of
  `AuthoringCreateExport.tsx`: read it and reuse its delivery helper.

### 8. Every ask lands in the conversation, attached — M

- **Change.** `V2App.ask` (`V2App.tsx:1051-1061`) stops sending into the rail. It hands off
  through the existing `C2C_CONVO` protocol (`V2App.tsx:1016-1034`), extended with an
  `attach` reference (surface, record id, label, the context the screen published at the
  click) and an `origin`. It continues the current conversation when its project is the
  open project, and otherwise starts a new one. The conversation shows the chip and a
  suggested placeholder, and sends nothing until Enter. The turn carries the attachment as
  that turn's `module_context`, through one new per-turn send option, the pattern
  `authoringContext` uses (`ConversationThread.tsx:927`). No `screen_actions`. ⌘K's "Ask
  AnA: …" sends its typed text. The rail stays mounted for one slice and receives no asks.
  `C2C_CONVO` is kept: 12 source files and 24 test files use it.
- **Files.** `V2App.tsx`; `components/ana/useAnaChat.ts` and `useAnaChat.types.ts` (one
  option); `surfaces/ConversationThread.tsx` (read `attach` and `origin`, render the chip);
  `tests/ui/one-conversation.test.tsx` (new).
- **Fails first.** Click a Documents "Ask AnA about this": the location becomes
  `conversation-thread`, a chip reads "Documents · <record>", and no request has been sent.
  Press Enter: the request body carries `module_context.surface = 'vault'`. Today the click
  sends into the rail.
- **Real browser.** Documents → Ask → the conversation with the chip → Enter → an answer →
  Back. 1440, 1024, 390.
- **Lanes.** L102 (`V2App.tsx`); L69, L82, L102 and L118 name `useAnaChat`: one option,
  announced.

### 9. The rail goes — M (the tests make it large) — the founder sees the whole target

- **Change.** Delete `AnaRail` (`Shell.tsx:622-1548`), `openThisConversation`
  (`:610-620`), its mount and scrim (`V2App.tsx:1228-1229`, `:1254`), the third grid column
  (`app-v2.css:30-31`, `:1306`, the `.ana` parts of `:1340-1351`, `:1374-1378`,
  `:1669-1670`), Live Drive forcing the rail open (`V2App.tsx:674-675`, `:810`), and both
  "Get help" launchers (`Shell.tsx:547-555`, `:217`). The logo goes to Home
  (`Shell.tsx:294-306`). In the same commit, before the deletions, re-point every
  rail test one behaviour at a time onto the conversation: the 14 files under
  `client/src/concept2cure/v2/__tests__` that reference `AnaRail` (anaContinueHosts,
  anaRailHistory, anaAnswerCaveats, runPolicySwitch, anaRailContextHonesty,
  anaPremortemMount, homeEngine, engineChoices, anaRailAttach, anaInterruptedHosts,
  anaRailWorkDock, anaMessageWarnings, anaRailActions, anaRunControl), plus
  `shellAskGuard.test.tsx` and `liveDriveShell.test.tsx`. `tests/ui/ana-rail-phone-drawer.test.ts`
  becomes a conversation phone-layout test. The commit message lists old test → new test
  and names `ConversationThread.tsx` as the replacement. Rehearse the admin console's
  governed sign-off before pushing: its sign-off now renders in the conversation.
- **Files.** `Shell.tsx`; `V2App.tsx`; `styles/app-v2.css`; the tests above;
  `tests/ui/one-shell.test.ts`.
- **Fails first.** `tests/ui/one-conversation.test.tsx`: render V2App on `vault` and expect
  no `.ana` and no `.ana-seam`. Today both render.
- **Real browser.** Home, Projects, a project, Documents, Submissions, Quality, Records &
  reports at 1440 and 390: no AnA column anywhere; one typing box on each screen that has
  one.
- **Lanes.** L102 (`Shell.tsx`, `V2App.tsx`, `app-v2.css`) and L118 (`app-v2.css` chip
  rules): deletions only in the rail block and the grid rules. `Shell.tsx`, `V2App.tsx` and
  `ConversationThread.tsx` were last changed together on 2026-10-05 (`38c4ce101`, author
  `concept2cure`, no lane): rebase immediately before the commit.

### 10. No private chat inside the conversation — S

- **Change.** Delete the fallback `useAnaChat` (`ConversationThread.tsx:888`). The screen
  always runs on the shell's chat; tests pass a stub. Remove `ConversationThread.tsx` from
  the allow-list.
- **Files.** `surfaces/ConversationThread.tsx`; `tests/ui/one-shell.test.ts`; the
  `conversationThread*.test.tsx` files that relied on the fallback.
- **Fails first.** `one-shell.test.ts` with `ConversationThread.tsx` removed from the
  allow-list fails today.
- **Lanes.** L102, L118 (one line in a shared file).

### 11. Documents built, read from the server — S

- **Change.** `GET /api/authoring/docs` (`authoring.router.ts:1275`) accepts
  `conversationId` (filtered on `provenance->>'conversationId'`, tenant-scoped) and
  `source=ana`. A small `DocumentList` reads it. Before building on it, reproduce the
  180-character trace defect (section 4.3).
- **Files.** `server/routes/authoring.router.ts` (the list handler only);
  `editor/DocumentList.tsx` (new); a pglite route test.
- **Fails first.** Two documents, one from conversation A and one from B. Filtering on A
  returns one. Today the parameter is ignored and both come back.
- **Lanes.** L70 (registration lines in the same file; this edits the list handler only).
  The file was last changed 2026-10-07 07:49 (`326af268b`): wait out the 24 hours.

### 12. One right-hand column, three states — M — visible

- **Change.** As section 4.1. `.ct-side` (`ConversationThread.tsx:1446-1478`) and
  `.ct-canvas-pane` (`:1435`) become one `.ct-canvas` with closed, list and open states.
  Progress moves to the Step chip's popover. The transcript card becomes a chip; its action
  row (`DocumentCanvas.tsx:528-593`) goes. The conversation width becomes
  `clamp(380px, 38%, 560px)` (from `clamp(340px, 34%, 520px)`, `authoring-v2.css:1599-1602`).
  The Comments float rule (`authoring-v2.css:1653-1666`) becomes a container query on the
  canvas at 1124px. Map each of the D2 canvas lane's nine landed steps to a test in its new
  home.
- **Files.** `surfaces/ConversationThread.tsx`; `editor/DocumentCanvas.tsx`;
  `styles/authoring-v2.css`; `styles/app-v2.css` (`.ct-side` rules removed); the
  `documentCanvas*` and `conversationThreadCanvas` tests.
- **Fails first.** New `__tests__/canvasStates.test.tsx`: with two documents built, the
  list state shows both from the route, and no `.ct-side` renders. Real browser at 1920
  with Comments open: `scrollWidth` equals `innerWidth` (without the container query it
  would exceed it by about 29px at the new widths).
- **Lanes.** L69 owns this ground. Do it as the next step after L69's landed steps,
  announced on L69, never inside a window of theirs. `AnaWorkPanel` is L82 (own).

### 13. See the proposal before it is saved — S — the founder sees it

- **Change.** As section 4.2, step 2. On `approval_required` for
  `draft_authoring_document`, the canvas opens on the proposal from `data.retry.params`,
  marked "Proposed by AnA · not saved", with the confirmation on it. Confirm swaps in the
  stored record; decline discards.
- **Files.** `surfaces/ConversationThread.tsx`; `editor/DraftProposal.tsx` (new); tests.
  No server file.
- **Fails first.** A stream whose `approval_required` carries two sections: the canvas
  shows both, with no Download, File or Edit control. Decline removes it; confirm shows the
  stored record. Today the proposal is a card in the transcript. A second test: a canvas
  confirmation posts the same decision, and writes the same chained turn record, as one
  given in the transcript (the pattern of `conversationThreadSignoff.test.tsx`).
- **Lanes.** L69 (canvas wiring). `useAnaChat` is read, not changed.

### 14. Drag the divider — S

- **Change.** A separator between conversation and canvas: `role="separator"`, arrow keys
  move 16px, double-click resets, 30% to 60%, remembered per person in `localStorage`
  inside `try`/`catch`.
- **Files.** `surfaces/ConversationThread.tsx`; `styles/authoring-v2.css`.
- **Fails first.** ArrowRight on the separator widens the canvas, and the value survives a
  remount. Focus is visible and the separator is named.
- **Lanes.** L69 (canvas CSS), after slice 12.

### 15. Opening a document anywhere opens it in the canvas — M — visible

- **Change.** As section 4.4. Documents' "Open in editor", a project's Documents rows,
  Recents and a task's "Open the item" open the document in the canvas. The
  `document-authoring` route opens the canvas at full width with the conversation as its
  seam.
- **Files.** `editorTarget.ts`; `surfaces/DocumentAuthoring.tsx`;
  `surfaces/ConversationThread.tsx`; `surfaces/Vault.tsx`; `surfaces/ProjectHome.tsx`.
- **Fails first.** Documents "Open in editor" lands on `conversation-thread` with the
  canvas open on that `docId`. Today it lands on `document-authoring`. `ci:canvas-path`
  stays green.
- **Lanes.** L91 (consume its open-the-item channel, do not edit it); L69.

### 16. The editor has no AnA of its own — M

- **Change.** Delete W: the workbench's `useAnaChat` (`DocumentWorkbench.tsx:1419`), its
  pane (`:4533-4777`) and its toggle (`:3702-3711`). At full width, an editor ask restores
  the split with the composer filled and the same document and section open. Remove
  `DocumentWorkbench.tsx` from the allow-list. Re-run the affected OQ-AUTHORING steps.
- **Files.** `editor/DocumentWorkbench.tsx` (the three blocks only);
  `surfaces/ConversationThread.tsx`; `tests/ui/one-shell.test.ts`.
- **Fails first.** `one-shell.test.ts` without `DocumentWorkbench.tsx` in the allow-list
  fails today (`:1419`). An integration test: an ask from the full-width editor shows the
  conversation with the composer filled and the canvas on the same section.
- **Lanes.** L104 and L70 name this file. Edit only the three W blocks; announce on both;
  `f3b642189` (2026-10-06) is the last change.

### 17. One composer — M

- **Change.** Extract `AnaComposer` from the conversation's composer: attach, `@app`,
  engine, run policy, send and steer. The conversation uses it to reply; Home and the
  project page use it to start. Delete Home's composer (`Surfaces.tsx:264-402`) and the
  project card (`ProjectHome.tsx:923-958`) in the same commit.
- **Files.** `AnaComposer.tsx` (new); `surfaces/ConversationThread.tsx`;
  `surfaces/Surfaces.tsx`; `surfaces/ProjectHome.tsx`; `homeEngine.test.tsx` and
  `projectHomeConversations.test.tsx` retargeted.
- **Fails first.** A one-shell assertion that only `AnaComposer.tsx` renders an AnA composer
  textarea. Today `Surfaces.tsx`, `ProjectHome.tsx` and `ConversationThread.tsx` each
  render one.
- **Lanes.** L102 (`Surfaces.tsx`, the composer foot): move its components, do not rewrite
  them. L82 (own, `useChatUpload`).

### 18. The document's lifecycle strip — S — visible

- **Change.** As section 4.7. One new composition in the workbench header.
- **Files.** `editor/DocumentLifecycleStrip.tsx` (new); `editor/DocumentWorkbench.tsx` (one
  mount line); a test.
- **Fails first.** On a DRAFT: the one primary button is "Send for review", and the
  controlled export is disabled with its reason. On APPROVED: "File to record". On FILED:
  "Place into submission". There is no strip today. The existing e-signature, freeze and
  file-to-vault tests stay green.
- **Depends on.** Step 3 of `docs/SURFACE_DECISIONS_2026-10-08.md` (send for review).
- **Lanes.** L104 (one line in `DocumentWorkbench.tsx`); L60 (`AuthoringPlaceIntoFiling`
  composed, not edited); L26 (the e-signature transport, not edited).

### 19. A review is signed on the document — M

- **Change.** `ReviewTasksPanel` signs a task in place through `EsignModal`, re-verified on
  the server, instead of sending the signer to the task board
  (`ReviewTasksPanel.tsx:304-310`). The Review board's "Sign" opens the document by id in
  the canvas (`Review.tsx:587-589`).
- **Files.** `editor/ReviewTasksPanel.tsx`; `surfaces/Review.tsx`; tests.
- **Fails first.** A task that needs a signature opens `EsignModal` in place; today it
  navigates to `task-board`. The Review board's Sign carries `docId`; today it does not.
- **Lanes.** L26 (composed, not edited); L91 (consumed).

### 20. Buttons named for a job do the job — S

- **Change.** As section 3.3, disposition 1.
- **Files.** `surfaces/DispatchReadiness.tsx`; `surfaces/LicensingSurface.tsx`;
  `surfaces/TaskBoard.tsx`; `surfaces/Vault.tsx`; `surfaces/AdminAccess.tsx`.
- **Fails first.** One test per button: the job runs and `onAsk` is not called. Today each
  calls `onAsk` (for example `TaskBoard.tsx:1098` sends a message nobody wrote).
- **Lanes.** L91 for "Fix" (its channel). The others are unclaimed.

### 21. Asks attach; asks without context go; the report look-alike changes — S

- **Change.** As section 3.3, dispositions 2 and 3, and the Reporting row of section 3.2.
  Every remaining record-scoped button reads "Ask AnA about this" and uses slice 8's
  attach. The free-text count falls to zero in launch screens.
- **Files.** The launch surfaces with ask buttons; `quality/App.tsx`;
  `surfaces/Projects.tsx`; `surfaces/Insights.tsx`; `styles/insights-v2.css`;
  `tests/ui/one-ana.baseline.json`.
- **Fails first.** A static test that no launch surface passes free text to AnA, and that no
  surface outside `AnaComposer` renders an input whose label names AnA or describes a
  request to it. Today `Insights.tsx:1348` does.
- **Lanes.** None name these files.

### 22. The nav lists the places — M — shown to the founder after 1, 9 and 13

- **Change.** As section 5.
- **Files.** `registryModel.ts` (the nav arrays and the header); `Shell.tsx` (nav, top bar,
  account menu); `V2App.tsx`; `TaskTray.tsx`; `scripts/ci/check-surface-discoverability.mjs`;
  `__tests__/shellNav.test.tsx` (new).
- **Fails first.** `shellNav.test.tsx` asserts the exact entries in order, that no entry
  carries an AnA badge, that the mark goes to Home, and that Quality is present. Today the
  nav has Explore, Quick access and no Quality. `ci:launch-scope` and
  `ci:surface-discoverability` stay green.
- **Lanes.** L102 (`Shell.tsx`, `registryModel.ts`): the nav and top-bar functions, not the
  run-control code.

### 23. The project page holds its documents and files — S — visible

- **Change.** The project's Documents panel uses slice 11's list with the project scope,
  replacing "Recent drafts" (`ProjectHome.tsx:1194`). Its Files panel mounts
  `editor/ProjectFilesPanel.tsx` unchanged, which already reads the project vault
  (`ProjectFilesPanel.tsx:162`), replacing "The document vault opens in its own workspace"
  (`ProjectHome.tsx:1558`).
- **Files.** `surfaces/ProjectHome.tsx`; tests.
- **Fails first.** The project page lists the project's vault folders from a mocked route;
  today it shows the empty state.
- **Lanes.** This session's own commit `bcc457edb` (2026-10-08) last changed the file.

### 24. The project page holds readiness and submissions — M

- **Change.** Submission Center reads the open project instead of listing every
  submission and asking for the programme (`SubmissionCenter.tsx:356-361`). The project
  page's Readiness panel shows the verdict from the same endpoint the readiness screen
  calls (`DispatchReadiness.tsx:351`). Its Submissions panel lists the project's sequences.
  A My-work panel for the project waits for the integer-project-id mapping
  (`docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`); until then it says so in one line and
  links to My work.
- **Files.** `surfaces/SubmissionCenter.tsx`; `surfaces/ProjectHome.tsx`; tests.
- **Fails first.** With ONC-221 open, Submission Center shows only ONC-221's submissions
  and no programme picker. Today it shows all of them.
- **Lanes.** L60 (rehearse the IND path's clicks after the change; its files are not
  touched).

### 25. Every AnA document is an authoring document — M

- **Change.** With a project open, post-processing turns every generated draft into an
  authoring document through the from-draft service (decision 1 of
  `docs/design/ANA_DOCUMENT_CANVAS.md`). With no project open, the card offers "Save to a
  project". The type-B .docx route (`server/routes/c2c/exports.ts:125-129`) retires into
  the working copy. Artifacts Center's list of AnA drafts is now the canvas list, so it is
  locked in `shared/constants/launch-scope.ts`, naming the canvas list as its replacement
  (CPO decision: feature, locked when this ships).
- **Files.** `server/routes/ana-ri/post-processing.ts`;
  `server/services/authoring/authoring-from-draft.ts`; `server/routes/c2c/exports.ts`;
  `surfaces/ConversationThread.tsx` (`ArtifactPanel` removed); `shared/constants/launch-scope.ts`.
- **Fails first.** A generated briefing draft with a project open yields an
  `authoring_documents` row and no document row in `concept2cure_artifacts`. Today it
  yields only the latter.
- **Lanes.** L102 and L118 name `post-processing.ts`: announce on both, 24-hour check.

### 26. Watch it being written — L — the founder sees it

- **Change.** As section 4.2, step 3. Two parts in one commit: the gateway exposes its
  per-block input buffer through a callback; `stream.ts` emits `artifact_delta`; the client
  fills the proposal.
- **Files.** `server/services/ai-gateway/gateway.ts`; `server/routes/ana-ri/stream.ts`;
  `components/ana/useAnaChat.ts` and `.types.ts` (one event); `editor/DraftProposal.tsx`.
- **Fails first.** A scripted gateway that emits the tool input in fragments: at least two
  `artifact_delta` events before the tool executes. Today none. In deterministic mode: none,
  and `artifact_draft` unchanged.
- **Lanes.** L118 names `gateway.ts` `route()` and `stream.ts`; L102 and L70 name
  `stream.ts`. Run last, in a window agreed on all three rows.

### 27. Walk the client's path, with no exits — S

- **Change.** Extend `tests/e2e/biotech-founder-path.e2e.spec.ts` to walk the whole path
  with the conversation and canvas: Home → project → AnA proposes Module 2.5 → save → edit
  → send for review → a second user signs on the document → file to record → place into a
  sequence → validation → transmit (stand-in transport). It counts every navigation that
  leaves the project and requires zero. (From design B.)
- **Files.** `tests/e2e/biotech-founder-path.e2e.spec.ts`; evidence screenshots.
- **Fails first.** The extended walk fails today at the first step that leaves the project.
- **Real browser.** 1440 and 1024, filed as D2 evidence and as the rehearsal of the D10 act.
- **Lanes.** L60 uses the same seed: read it, do not edit it.

---

## 7. Risks

1. **Asking from a work screen leaves that screen.** The record is out of view while AnA
   answers; this was the founder-fit judge's main objection to the base design.
   *Mitigation:* the chip carries the record and what the screen published about it;
   "Back to <screen>" returns; an attached authoring document opens in the canvas beside
   the answer. After beta, decide whether the canvas should also show other records (a
   Documents record, a sequence) read-only.
2. **The origin screen's actions cannot run from the conversation.** Context from an
   unmounted screen is dropped (`V2App.tsx:708-715`) and its actions are refused
   (`surfaceActions.ts:435-443`). *Mitigation:* the attachment is a snapshot taken at the
   click, `screen_actions` are not sent, and AnA offers "Take me there" through Live Drive.
   The admin console's governed flows are rehearsed before slice 9 lands, because their
   sign-off moves from the rail to the conversation.
3. **Rail tests guard real behaviour.** Fourteen test files reference `AnaRail`, and two
   more assume it. *Mitigation:* slice 9 maps each behaviour to a conversation test and
   lists the mapping in its commit.
4. **Lanes share the hot files.** See the lane list in section 6. *Mitigation:* claim,
   announce, edit only named regions, observe the 24-hour rule, rebase immediately before
   each commit. Slices 12, 13 and 14 run in sequence after L69's landed steps.
5. **The decision is reverted, or regenerated away.** A navigation change was reverted the
   same day on 2026-07-28, and on 2026-09-24 the rule was "keep what came from the design
   kits". *Mitigation:* this record; the shell-nav test; the `registryModel.ts` header and
   a disabled generator; the founder sees slices 1, 9 and 13 before slice 22.
6. **Widths on laptops.** *Mitigation:* the nav collapses below 1600px while a document is
   open; Comments float by the canvas's width; the divider; browser checks at 1280, 1440
   and 1920 in slices 1, 12 and 14. Nothing is accepted from CSS arithmetic alone.
7. **A working copy passes for a controlled record.** *Mitigation:* "DRAFT — uncontrolled
   copy" on every page with id, version, status, user and time; no manifest; a separate
   route; a chained audit row with the hash; the export permission; an SOP definition and
   QA concurrence; a D4 OQ test case; the export's 409 pinned by a test.
8. **A proposal or streamed text is taken for a record.** *Mitigation:* the "Proposed by
   AnA · not saved" state with no actions; discard on decline or failure; the confirmation
   on the proposal; the D5 proof in slice 13; both the streamed and the all-at-once paths
   tested in slice 26.
9. **A conversation writes into the wrong project.** This is possible today. *Mitigation:*
   slice 5, early, on the server.
10. **Colleagues' conversations in Recents.** *Mitigation:* slice 3 lands before Recents is
    shown, with the user filter on both branches.
11. **Section overwrites outside the tracked-suggestion rule.** Three confirm-class tools
    overwrite sections. *Mitigation:* their documents do not open in the canvas; before one
    does, the tool refuses while the section is open, or becomes a suggestion, with a test.
12. **Two document views for part of the series.** Until slice 15, the Authoring screen is
    still a full-width editor with its own AnA. *Mitigation:* nothing regresses meanwhile,
    and slice 15 comes before slice 16 deletes that AnA.
13. **Live Drive takes AnA off the conversation.** After slice 4 there is no typing box
    while she drives another screen. *Mitigation:* the strip keeps Stop, Take over and
    "Back to conversation"; `liveDriveShell.test.tsx` and a real drive pass in every shell
    slice.
14. **The validation package describes the old screens.** The OQ protocols were executed
    at `89ee3a81` (`docs/work-orders/README.md:101`) with the rail and the editor's AnA
    pane. *Mitigation:* a D4 change-control record, and the affected OQ-AUTHORING steps
    re-run after slices 9, 12, 13, 15 and 16, before a pilot user files on production
    (D10).
15. **Two drafting paths remain.** `AuthoringAiDraft` stays for its span-level lineage.
    *Mitigation:* named here as a later consolidation, not as done.
16. **Locked docks come back.** E and R remain in code behind the launch-scope lock.
    *Mitigation:* slice 2's exception fails the moment either surface re-enters scope.
17. **Long conversations beside a heavy editor.** *Mitigation:* measure a 200-turn thread
    with a document open on the evidence machine before slice 12 ships; virtualise the
    transcript only if the measurement says so.
18. **Project-scoped review and tasks are blocked.** Tasks and readiness are keyed on an
    integer project id, not the program id. *Mitigation:* the project page says so in one
    line and links to My work until the project-first lane resolves it.
19. **Rule 2.** *Mitigation:* every slice is filed under D2; no surface is added (My work
    is the `tasks` surface relabelled, `DocumentList`, `DraftProposal` and `AnaComposer` are
    components of existing surfaces); the seven launch apps remain entitlement keys
    (`docs/LAUNCH_DEFINITION_OF_DONE.md:18`); a slice without its evidence reports blocked.