# Slices 1, 4, 8 and 9 in a real browser: the rail is gone

Captured 2026-10-08, 02:33 to 02:38 UTC, in headless Chromium (Playwright). It ran against the real server, client and database. AnA's replies came from the same scripted stand-in model as the slice-1 capture, labelled "STAND-IN" on screen. The `draft_authoring_document` tool, its approval card and the stored documents were real.

**Result.**

- **Passed:**
  - No screen at any width drew a right rail, seam or scrim.
  - "Search connected sources" put its question in the conversation's composer, unsent, with "From Vault (DMS)" and "Back to Vault (DMS)".
  - Enter sent it with the Vault's context.
  - The document AnA drafted opened on the right by itself while she was still working, and stayed open after the turn.
- **Failed:** "one typing box during a run". With Live Drive on, which is the default, **two** boxes show during every run: the composer ("Steer this run") and the Live Drive strip's "Ask or steer AnA…". With Live Drive switched off there is one. See finding 1.

## How it ran

- **Code.**
  - The brief named `b733c5db3`, but trunk moved while I was setting up. The server that served every screenshot started at 02:31:59 from a clean tree at `715107bd6`, without watch mode.
  - Every file these slices touch is byte-identical to `b733c5db3`: `V2App.tsx`, `Shell.tsx`, `ConversationThread.tsx`, `Surfaces.tsx`, `surfaceViews.ts`, `app-v2.css`, `ProjectHome.tsx`, `LiveDriveOverlay.tsx`, `AnaWorkSections.tsx` and `useAnaChat.ts`.
  - The commits in between changed Vault internals (`Vault.tsx`, filing and data-room components) and server vault and submission services. The "Search connected sources" handler did not change.
  - Trunk moved once more during the capture, to `790b07dc9`. That commit changed only `docs/reports/`.
- **Database:** `c2c_ui_screens` (local PostgreSQL 16, `/var/lib/postgresql/c2c-local`). It was reused as built on 2026-10-07 and not rebuilt.
- **Server:** `npx tsx server/index.ts` with:
  - `NODE_ENV=development PORT=5077 ALLOW_DEV_AUTH=1 LAUNCH_SCOPE_ENFORCE=on`;
  - `ANTHROPIC_BASE_URL` pointing at the stand-in on port 8797;
  - `ALLOWED_ORIGINS=http://localhost:5077,http://127.0.0.1:5077`. Without it, the server refused the browser's module requests with 403 (`/@react-refresh`, Origin check) and the app never rendered. The slice-1 README does not list this flag. That first server, started at 02:20 from `488f11956`, served no screenshot and was stopped.
- **Stand-in:** `stand-in-ui.mjs` from the 2026-10-07 capture, with `FAKE_DELAY_MS=3000` as in slice 1. It received 5 requests in all: 1 for the Vault question and 4 for the two draft runs. None was refused.
- **Sign-in:** `jm.smith@concept2cure.pro`, dev mode with MFA skipped. Each script reset the shell preferences (`c2c-v2-prefs`) first, so every screen was in its shipped default.
- **Project:** Vorelinib · KIT-mutant GIST (IND), BX-512.
- **Viewport:** every PNG is a viewport-only screenshot.
- **Marked copies.** A `.marked.png` is the same moment as its `.png`, with a red numbered box on each place to type to AnA.
- **Counting typing boxes.** A typing box is a visible `textarea`, text input or `contenteditable` field that sends to AnA. Search fields and the document editor's body are not counted. Each count was read from the live DOM at the moment of the screenshot. Every field found, with its label, box and whether anything covered it, is in `capture-log.json`.

## Files

| File | What it shows | AnA typing boxes | Expected | Matched? |
|---|---|---|---|---|
| `1440-01-home.png` | Home, 1440x900. The shell grid is `56px 1384px 0px`, `data-ana-open="false"`, `--ana-seam: 0px`, and the DOM has no rail, seam or scrim element. The right edge is the landing page itself. **The first-run welcome shows**: "I can help you organize your program toward an NDA/BLA and keep the dossier consistent.", then "Set up a submission program", "Draft product labeling", "Upload a document to start" and Dismiss. The quick actions are "Draft Clinical Overview" and "Submission readiness". | 1: Home's composer, "How can I help you today?" | no rail or seam; welcome may show | **yes**. The welcome shows. |
| `1440-02-vault.png` | Vault (DMS) with the project open. No rail and the same grid. "Search connected sources" is on the right of the connected-repositories strip. The header also offers "Ask AnA to import". | 0 | no rail | **yes** |
| `1440-03-vault-ask-in-composer.png` | After one click on "Search connected sources". The conversation (`/conversation-thread`, "New conversation") holds "Search my connected repositories for documents relevant to this project." in the composer, **not sent**. Above the composer are the chip **"From Vault (DMS) ×"** and the button **"Back to Vault (DMS)"**. Between the click and the screenshot the stand-in received 0 requests and the browser sent 0 POSTs to `/api/ana-ri/stream`. | 1: "Reply to AnA" | on the conversation, composer holds the question unsent, From chip, Back button | **yes** |
| `1440-04-vault-ask-sent-reply-starts.png` | Enter pressed. AnA's reply text first appeared 2.7 s later ("Stand-in answer (scripted…"), and the screenshot is from that moment. The POST to `/api/ana-ri/stream` carried `context.screen: "vault"` and the Vault's `module_context` (`surface: "vault"`, "Document vault: 0 document(s)…"). The chip and Back are gone once sent. The run strip shows Working, Pause and Stop. **The Live Drive strip "AnA is driving" sits over the composer's footer, with its own "Ask or steer AnA…" box.** | **2**: composer "Steer this run", and the drive strip's "Ask or steer AnA while she drives" | reply starts after Enter | **yes** for the handover; **no** for one box (finding 1) |
| `1440-05-back-to-vault.png` | (extra) A second "Search connected sources", then **"Back to Vault (DMS)"** clicked. The page is back on Vault. The question was not sent: the stand-in received 0 requests. | 0 | (extra) Back returns | yes |
| `1440-06-run-approval.png`, `.marked.png` | "Draft the Module 2.5 clinical overview for Vorelinib BX-512." was typed in Project home's co-author composer, as in slice 1, and Send was clicked. This is the approval card "Confirm the proposed action", before confirming. Progress reads "Waiting for your approval", while the drive strip reads "AnA is driving". The composer is already "Steer this run". | **2**: composer "Steer this run"; drive strip "Ask or steer AnA…", clipped to "Ask or ste" by "Take over" | (context) | see finding 1 |
| `1440-07-during-run.png`, `.marked.png` | 65 ms after "Confirm and run". The card reads "Running…", the run strip shows Pause and Stop, and nothing is open on the right yet (Progress). | **2**: (1) composer "Steer this run"; (2) drive strip "Ask or steer AnA while she drives" | **1**, the composer labelled "Steer this run" | **no**. The composer is labelled "Steer this run" with a **Steer** button, but a second box shows. |
| `1440-08-document-opens-while-working.png`, `.marked.png` | 1.17 s after the click. The editor **opened on the right by itself 465 ms after "Confirm and run"**, while the turn was still running (Stop visible). It sits at x=527, 913 px wide, on "2.5.1 Product Development Rationale" with the 4-section outline and the STAND-IN text. The conversation is on the left at x=56, 471 px wide. "Open full editor" was never clicked. The drive strip sits across the conversation/editor boundary. | **2**, as above. The editor body is not counted. | document opens on the right while she works | **yes** for the document; **no** for one box |
| `1440-09-turn-ended.png`, `.marked.png` | 4.6 s after the click. The turn has ended: the closing "Stand-in answer: the draft tool returned …" is complete, Stop is gone and the header chip reads Progress. The editor is still open on the right and the drive strip is gone. The composer is "Reply to AnA" again. | 1: "Reply to AnA" | screenshot after the turn ends | **yes**, the document stays open |
| `1440-10-during-run-drive-off.png`, `.marked.png` | (extra) The same run with **"AnA drives" switched off** first, by one click on Home's switch (`aria-checked` went to `false`). During the run (Stop visible), the editor opened on the right by itself, 328 ms after "Confirm and run". No drive strip is drawn. | **1**: composer "Steer this run". The count was 1 at the approval card too. | (extra) shows which box is the second | yes. The second box is the Live Drive strip's. |
| `1280-projects.png` | Projects, 1280x800. The grid is `56px 1224px 0px`, the seam is 0 and there are no rail elements. "Ask AnA" sits at the top right. | 0 | no rail | **yes** |
| `1280-conversation.png` | The newest "Draft the Module 2.5…" conversation (the drive-off run), reopened from Project home › Conversations. No rail. The right-hand column is the conversation's own Progress panel, not AnA. The thread now holds the document card with its 4-section outline. Nothing opened on the right by itself: the history rule held. | 1: "Reply to AnA" | no rail | **yes** |
| `390-projects.png` | Projects, 390x844 (phone). The grid is `56px 334px 0px` and there is no rail. The page does not scroll sideways (`scrollWidth` 390), but the content is clipped: "+ New p…" and the search box are cut off at the right edge, and the workstream and status chips run off it. The subtitle wraps one or two words per line beside the header buttons. The 56 px navigation column stays on screen. | 0 | no rail | **yes** for no rail (layout: finding 3) |
| `390-conversation.png` | The same conversation at 390x844, scrolled to its end as it loads. No rail. Progress stacks below the composer. The header is crowded: "New conversation" overlaps the "Conversation" label, the conversation's title is not visible and "Progress" is cut off. The document card's buttons are cut off ("File to", "Place into"), the composer's placeholder wraps and is cut, and "AnA drives: on" is cut at the left edge. | 1: "Reply to AnA" | no rail | **yes** for no rail (layout: finding 3) |
| `1440-11-project-home.png` | Project home as it opens. No rail. The **"AnA · co-author"** panel ("Vorelinib · BX-512 · governed dossier", "Open full thread", and its greeting) starts at y≈462. Its composer is below the fold, with its top at y=905. | 0 in view | report the co-author panel | **yes**: it still exists |
| `1440-12-project-home-coauthor-panel.png`, `.marked.png` | The same page scrolled with the mouse wheel until the co-author composer is in view: "Message AnA about Vorelinib · BX-512…". It renders 157×42 px inside a panel about 1180 px wide, as on 2026-10-07. Sending from it opens the conversation; that is how runs 06 to 10 started. | 1: "Message AnA about this project" | report any AnA chat box on the page | reported |
| `capture-log.json` | One entry for every screenshot. Each entry holds the shell grid, `data-ana-open` and `--ana-seam`; any rail-shaped element; what sits at the window's right edge; every visible text field with its label, box and coverage, and whether it counts as an AnA box; the composer's label and value; the From chip and Back buttons; the document pane's and conversation's boxes; Stop; timings; and the clicks so far. The `*-meta` entries hold the browser's POST bodies to `/api/ana-ri/stream` (screen and `module_context`) and the stand-in request counts. | — | — | — |

## Measured

| Moment | AnA typing boxes | Labels |
|---|---|---|
| Home (01) | 1 | Home composer |
| Vault (02, 05) | 0 | — |
| Vault question handed over, unsent (03) | 1 | Reply to AnA |
| Vault question's reply streaming, Live Drive on (04) | 2 | Steer this run · Ask or steer AnA while she drives |
| Draft run: approval (06), after confirm (07), document open (08), Live Drive on | 2 | Steer this run · Ask or steer AnA while she drives |
| Draft run, turn ended (09) | 1 | Reply to AnA |
| Draft run, Live Drive **off** (10) | 1 | Steer this run |
| 1280 and 390 Projects | 0 | — |
| 1280 and 390 conversation (reopened, idle) | 1 | Reply to AnA |
| Project home, top (11) and scrolled (12) | 0 and 1 | Message AnA about this project |

Rail check on every screenshot: no rail, seam or scrim element is visible, and none is in the DOM. `data-ana-open` is `"false"`, the third grid column is `0px` and `--ana-seam` is `0px`.

Documents drafted in this capture (both in `authoring_documents`, titled "Module 2.5 Clinical Overview (stand-in draft)"):

| Run | Document | Thread |
|---|---|---|
| Vault question | — | `ana-ri_1791426806696_phzzb1k21` |
| Draft, Live Drive on (06–09) | `a59f3825-aa81-4e59-a289-31de5517f840` | `ana-ri_1791426896009_1g4t6huzz` |
| Draft, Live Drive off (10; reopened in the 1280 and 390 conversation shots) | `21b1d894-1707-41b5-916a-293a814b3a1f` | `ana-ri_1791426978964_nq4tr3sp0` |

## Findings

1. **Two boxes during a run while Live Drive is on, and Live Drive is on by default.** In the shipped defaults, every run on the conversation screen shows the composer ("Steer this run") and the drive strip's "Ask or steer AnA…". This was seen at the approval card, right after confirming, with the document open, and while the Vault question's reply streamed (04, 06, 07, 08). With "AnA drives" off, the strip is not drawn and the count is 1 (10).
   - **Likely cause.** This comes from reading the code; I did not test it by mutation.
     - `V2App.tsx:538` (`if (controls) driveControlsRef.current = controls;`) records the controls of *any* chat's drive event as "the chat that is driving". That includes the shell's own chat: `onShellDriveEvent` passes its controls through (`useAnaChat.ts:1506`).
     - The conversation screen runs on the shell's chat (`ConversationThread.tsx:921`, `anaChat = shellChat ?? ownChat`).
     - So the strip's box condition at `V2App.tsx:1340` (`ownsConversation && !driveControlsRef.current`) is false during any drive, and the box is drawn.
   - **The same cause probably explains 06.** `waiting` is passed as `null` whenever `driveControlsRef.current` is set (`V2App.tsx:1315`). That would be why the strip says "AnA is driving" while Progress says "Waiting for your approval".
   - **The test did not see it.** `oneBoxDuringRun.test.tsx` names the drive strip only in a comment and runs no turn with Live Drive on.
2. **The drive strip overlaps other controls** at 1440 (04, 06, 07, 08). It covers the composer's footer: the "Applies to your next message" help and the engine pill. With the editor open, it covers the editor's "…has a recorded origin" bar. With the editor closed, "Take over" clips its own input to "Ask or ste". This is slice 1's finding 4, still present.
3. **The phone layout (390) has no rail, but it is clipped and crowded** (`390-projects`, `390-conversation`; details in the table). The 56 px navigation column stays on screen at 390.
4. **The 471 px conversation column beside the editor at 1440 cuts off the composer's placeholder.** It reads "Steer this run — AnA takes it at her next" and "Reply to AnA — ask, request a draft, or type", each with a second line cut off (08, 09). Slice 1 saw the same at 1280.
5. **Project home still has its own AnA chat box,** the "AnA · co-author" composer (12). It is below the fold at 1440x900, and 157 px wide in a panel about 1180 px wide. It is the only AnA box on that page, and sending from it opens the conversation.
6. **Ask buttons not exercised here.** The Vault header's "Ask AnA to import" and Projects' "Ask AnA" are still offered. Only "Search connected sources" was tested.
7. **A reopened conversation now carries its document** (1280 and 390 conversation shots): the card, the outline, File to vault and the other actions. Nothing opened by itself. So the history rule that slice 1 could check only trivially held here with a document present.
8. **Same as before, not investigated.** "Some project context could not be loaded for this reply" appears on every reply. Progress shows "Memory: Could not be read" because this environment has no OpenAI key.

## Cleanup

The server (port 5077) and the stand-in (port 8797) were stopped after the capture, including the first server, which served no screenshot. PostgreSQL was left running. The capture scripts (`harness-1008-rail/`), the server and stand-in logs and the stand-in's saved requests stayed in the session scratchpad. Nothing outside this `screens/` folder was created or changed in the repository.
